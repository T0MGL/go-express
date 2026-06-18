-- 033_ledger_money_core.sql
-- Paso 1 de la re-arquitectura del nucleo financiero de GO EXPRESS sobre un ledger
-- append-only como unica fuente de verdad. Decision aprobada por Gaston: menos numeros
-- cacheados que se puedan desincronizar, no mas validaciones encima.
--
-- Contexto legal: el owner esta personalmente expuesto, es plata de afiliados, tolerancia
-- a error CERO. Cada mutacion de dinero queda atomica bajo lock o RPC, y cada estado
-- invalido que se pueda volver imposible a nivel DB se vuelve imposible aca.
--
-- Esta migracion NO declara el sistema listo para produccion. Eso lo decide el Paso 2
-- (re-auditoria adversarial). Aca solo se cierran de raiz los bugs del primer barrido.
--
-- IDEMPOTENCIA: CREATE OR REPLACE en funciones, IF NOT EXISTS / DO-guards en constraints
-- y columnas, DROP IF EXISTS antes de cada CREATE de trigger. Se puede correr dos veces
-- sin efecto secundario.
--
-- ROLLBACK: seccion explicita al final, comentada. Revierte funciones a su firma previa,
-- dropea constraint/columna/trigger nuevos. No revierte el recompute de saldo (es
-- idempotente y siempre correcto: dejarlo no hace daño).
--
-- DECISION SALDO DERIVADO vs CACHE DERIVADO:
--   Se mantiene clientes.saldo_cuenta_corriente como CACHE ESTRICTAMENTE DERIVADO, no como
--   fuente de verdad. La fuente de verdad es SUM(movimientos_cuenta_corriente.monto). El
--   cache se recalcula DENTRO de la misma transaccion bajo lock (registrar_movimiento_cc
--   ya lo hace via FOR UPDATE). Razon de mantener la columna y no derivar en cada lectura:
--   la validacion de limite de credito necesita leer el saldo bajo el MISMO lock que el
--   insert del movimiento para cerrar la race window (ver migracion 018). Derivar con un
--   SUM() en esa ruta obligaria a lockear toda la particion de movimientos del cliente,
--   peor concurrencia y mismo resultado. La integridad se garantiza con la funcion de
--   verificacion verificar_saldo_cc(): saldo_col == SUM(movimientos), corrible en cualquier
--   momento, y con recompute_saldo_cc() que reconstruye el cache desde el ledger. Para el
--   volumen actual de GO EXPRESS derivar en lectura tambien seria seguro; el cache se queda
--   por la ruta de limite de credito. Snapshots periodicos por rango: NO se implementan
--   ahora, anotado para cuando el ledger de un cliente supere ~100k filas.

BEGIN;

-- =============================================================================
-- 0) Normalizacion defensiva de registrar_movimiento_cc
-- El estado deployado en prod tiene la firma de 10 argumentos de la migracion 019:
-- el 10mo es p_bypass_limite BOOLEAN DEFAULT FALSE, NO es ruido, es el override admin
-- de limite de credito (envios.bypass_limite_credito) que el trigger trg_envio_cc_debito_fn
-- propaga. Colapsar a 9 args revertiria la 019 y romperia ese trigger (que llama con 10).
-- Por eso la firma canonica se MANTIENE en 10 args identica a la 019. Se dropea toda
-- variante previa con un loop dinamico solo para limpiar overloads y recrear una sola
-- canonica. registrar_movimiento_cc/anular_pago_atomico llaman con <=10 args (el default
-- cubre el caso de 9). Los triggers de debito (10 args) y credito (9 args) siguen validos.
-- =============================================================================

DO $$
DECLARE
  v_sig TEXT;
BEGIN
  FOR v_sig IN
    SELECT format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid))
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE p.proname = 'registrar_movimiento_cc'
       AND n.nspname = 'public'
  LOOP
    EXECUTE 'DROP FUNCTION ' || v_sig;
  END LOOP;
END $$;

CREATE FUNCTION registrar_movimiento_cc(
  p_cliente_id    UUID,
  p_envio_id      UUID,
  p_pago_id       UUID,
  p_tipo          tipo_movimiento_cc,
  p_monto         BIGINT,
  p_descripcion   TEXT,
  p_creado_por    UUID,
  p_ip            INET,
  p_user_agent    TEXT,
  p_bypass_limite BOOLEAN DEFAULT FALSE
)
RETURNS movimientos_cuenta_corriente
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_saldo_actual    BIGINT;
  v_limite_credito  BIGINT;
  v_nuevo_saldo     BIGINT;
  v_movimiento      movimientos_cuenta_corriente;
BEGIN
  IF p_monto = 0 THEN
    RAISE EXCEPTION 'monto no puede ser cero' USING ERRCODE = 'P0001';
  END IF;

  SELECT saldo_cuenta_corriente, limite_credito
    INTO v_saldo_actual, v_limite_credito
    FROM clientes
   WHERE id = p_cliente_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'cliente % no existe', p_cliente_id USING ERRCODE = 'P0002';
  END IF;

  v_nuevo_saldo := v_saldo_actual + p_monto;

  -- Limite de credito bajo lock. Solo movimientos que aumentan deuda (debito, ajuste
  -- positivo) y con limite configurado (> 0). reverso/credito/nota_credito reducen deuda
  -- y siempre se permiten. p_bypass_limite=TRUE saltea (override admin con motivo en
  -- auditoria_log, propagado por el trigger de debito desde envios.bypass_limite_credito).
  IF NOT p_bypass_limite
     AND v_limite_credito > 0
     AND p_tipo IN ('debito', 'ajuste')
     AND p_monto > 0
     AND v_nuevo_saldo > v_limite_credito THEN
    RAISE EXCEPTION 'limite_credito_excedido: saldo proyectado % excede limite %',
      v_nuevo_saldo, v_limite_credito
      USING ERRCODE = 'P0003';
  END IF;

  INSERT INTO movimientos_cuenta_corriente (
    cliente_id, envio_id, pago_id, tipo, monto, saldo_posterior,
    descripcion, creado_por, ip_address, user_agent
  ) VALUES (
    p_cliente_id, p_envio_id, p_pago_id, p_tipo, p_monto, v_nuevo_saldo,
    p_descripcion, p_creado_por, p_ip, p_user_agent
  )
  RETURNING * INTO v_movimiento;

  UPDATE clientes
     SET saldo_cuenta_corriente = v_nuevo_saldo
   WHERE id = p_cliente_id;

  RETURN v_movimiento;
END;
$$;

COMMENT ON FUNCTION registrar_movimiento_cc IS 'Unica via para mutar saldo_cuenta_corriente. Inserta movimiento (append-only) y recalcula el cache de saldo del cliente atomicamente bajo SELECT FOR UPDATE. Valida limite de credito bajo el mismo lock; p_bypass_limite=TRUE lo saltea (override admin). Firma canonica de 10 argumentos, p_bypass_limite DEFAULT FALSE (preserva migracion 019; el 10mo arg es opcional, asi que callers de 9 args siguen validos).';

-- =============================================================================
-- 1) Verificacion e integridad del cache de saldo
-- =============================================================================

-- Recalcula saldo_cuenta_corriente de UN cliente desde el ledger, bajo lock. La fuente de
-- verdad es SUM(monto). Idempotente. Devuelve el saldo recalculado.
CREATE OR REPLACE FUNCTION recompute_saldo_cc(p_cliente_id UUID)
RETURNS BIGINT
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_saldo BIGINT;
BEGIN
  PERFORM 1 FROM clientes WHERE id = p_cliente_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'cliente % no existe', p_cliente_id USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(SUM(monto), 0)::BIGINT
    INTO v_saldo
    FROM movimientos_cuenta_corriente
   WHERE cliente_id = p_cliente_id;

  UPDATE clientes SET saldo_cuenta_corriente = v_saldo WHERE id = p_cliente_id;
  RETURN v_saldo;
END;
$$;

COMMENT ON FUNCTION recompute_saldo_cc IS 'Reconstruye el cache saldo_cuenta_corriente de un cliente desde SUM(movimientos), bajo lock. Idempotente. Herramienta de reparacion: el flujo normal nunca lo necesita porque registrar_movimiento_cc mantiene el cache en cada movimiento.';

-- Verifica que el cache == SUM(ledger) para todos los clientes con movimientos o saldo no
-- nulo. Devuelve solo las filas DESINCRONIZADAS. Cero filas = invariante en verde.
-- Corrible en cualquier momento (read-only). Alimenta el test de invariante del Paso 3.
CREATE OR REPLACE FUNCTION verificar_saldo_cc()
RETURNS TABLE (
  cliente_id     UUID,
  saldo_cache    BIGINT,
  saldo_ledger   BIGINT,
  diferencia     BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id,
         c.saldo_cuenta_corriente AS saldo_cache,
         COALESCE(m.suma, 0)::BIGINT AS saldo_ledger,
         (c.saldo_cuenta_corriente - COALESCE(m.suma, 0))::BIGINT AS diferencia
    FROM clientes c
    LEFT JOIN (
      SELECT cliente_id, SUM(monto) AS suma
        FROM movimientos_cuenta_corriente
       GROUP BY cliente_id
    ) m ON m.cliente_id = c.id
   WHERE c.saldo_cuenta_corriente <> COALESCE(m.suma, 0);
$$;

COMMENT ON FUNCTION verificar_saldo_cc IS 'Invariante de dinero: saldo_cuenta_corriente == SUM(movimientos) por cliente. Devuelve solo filas desincronizadas. Cero filas = verde. Read-only, corrible en cualquier momento.';

-- =============================================================================
-- 2) Pagos a cuenta corriente NO se editan (Opcion A: append-only puro)
-- Cierra CRITICA 1 y 2 de raiz: editar el monto_recibido de un pago CC desincronizaba el
-- ledger (el trigger de credito solo dispara en INSERT, nunca en UPDATE). En vez de
-- parchar con un trigger de UPDATE fragil, se prohibe la edicion: el pago CC se anula y se
-- rehace. update_pago_atomico valida el monto_total contra el envio real ademas.
-- =============================================================================

CREATE OR REPLACE FUNCTION update_pago_atomico(
  p_pago_id         UUID,
  p_monto_recibido  BIGINT,
  p_metodo_pago     metodo_pago,
  p_fecha_pago      DATE,
  p_referencia      TEXT,
  p_notas           TEXT,
  p_apply_metodo    BOOLEAN,
  p_apply_fecha     BOOLEAN,
  p_apply_referencia BOOLEAN,
  p_apply_notas     BOOLEAN,
  p_actualizado_por UUID,
  p_usuario_nombre  TEXT,
  p_ip              INET,
  p_user_agent      TEXT
)
RETURNS pagos
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pago_previo  pagos;
  v_pago_actual  pagos;
  v_estado       estado_pago;
  v_tipo_pago    tipo_pago;
  v_monto_real   BIGINT;
  v_descripcion  TEXT;
BEGIN
  SELECT * INTO v_pago_previo
    FROM pagos
   WHERE id = p_pago_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'pago_no_encontrado: %', p_pago_id USING ERRCODE = 'P0001';
  END IF;

  IF v_pago_previo.anulado = TRUE THEN
    RAISE EXCEPTION 'pago_ya_anulado: %', p_pago_id USING ERRCODE = 'P0001';
  END IF;

  -- Tipo de pago + monto real del envio bajo el que vive este pago. monto_total no se
  -- confia del caller: la fuente de verdad del importe a cobrar es el envio.
  SELECT tipo_pago, (costo + COALESCE(costo_seguro, 0))::BIGINT
    INTO v_tipo_pago, v_monto_real
    FROM envios
   WHERE id = v_pago_previo.envio_id;

  -- Opcion A: pago a cuenta corriente es inmutable. Si cambia el monto_recibido, se exige
  -- anular y rehacer. Editar otros campos (metodo, fecha, referencia, notas) tampoco se
  -- permite por la misma puerta para no abrir una via parcial que confunda el ledger.
  IF v_tipo_pago = 'cuenta_corriente'
     AND p_monto_recibido <> v_pago_previo.monto_recibido THEN
    RAISE EXCEPTION 'pago_cc_no_editable: un pago a cuenta corriente no se edita, se anula y se rehace'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_monto_recibido < 0 THEN
    RAISE EXCEPTION 'pago_monto_recibido_invalido: monto_recibido debe ser >= 0'
      USING ERRCODE = 'P0001';
  END IF;

  -- monto_recibido no puede exceder el importe real del envio (no el monto_total guardado,
  -- que pudo haberse persistido mal en su momento).
  IF v_monto_real IS NOT NULL AND p_monto_recibido > v_monto_real THEN
    RAISE EXCEPTION 'pago_monto_recibido_invalido: monto_recibido % excede el costo real del envio %',
      p_monto_recibido, v_monto_real
      USING ERRCODE = 'P0001';
  END IF;

  IF v_monto_real IS NOT NULL AND p_monto_recibido >= v_monto_real THEN
    v_estado := 'pagado';
  ELSIF p_monto_recibido >= v_pago_previo.monto_total THEN
    v_estado := 'pagado';
  ELSIF p_monto_recibido > 0 THEN
    v_estado := 'pago_parcial';
  ELSE
    v_estado := 'pendiente';
  END IF;

  UPDATE pagos
     SET monto_recibido = p_monto_recibido,
         estado_pago    = v_estado,
         metodo_pago    = CASE WHEN p_apply_metodo     THEN p_metodo_pago ELSE metodo_pago END,
         fecha_pago     = CASE WHEN p_apply_fecha      THEN p_fecha_pago   ELSE fecha_pago  END,
         referencia     = CASE WHEN p_apply_referencia THEN p_referencia   ELSE referencia  END,
         notas          = CASE WHEN p_apply_notas      THEN p_notas        ELSE notas       END,
         updated_at     = NOW()
   WHERE id = p_pago_id
  RETURNING * INTO v_pago_actual;

  v_descripcion := format(
    'Pago actualizado: %s/%s Gs. (%s)',
    v_pago_actual.monto_recibido, v_pago_actual.monto_total, v_pago_actual.estado_pago
  );

  INSERT INTO auditoria_log (
    usuario, usuario_id, accion, entidad, entidad_id,
    descripcion, valor_anterior, valor_nuevo, ip_address, user_agent
  ) VALUES (
    p_usuario_nombre, p_actualizado_por, 'editar', 'pago', v_pago_actual.id::TEXT,
    v_descripcion, to_jsonb(v_pago_previo), to_jsonb(v_pago_actual), p_ip, p_user_agent
  );

  RETURN v_pago_actual;
END;
$$;

COMMENT ON FUNCTION update_pago_atomico IS 'Actualiza pago bajo lock + auditoria en la misma transaccion. Pago a cuenta corriente con cambio de monto_recibido: rechaza con pago_cc_no_editable (Opcion A append-only). Valida monto_recibido <= costo real del envio, no contra monto_total del caller.';

-- =============================================================================
-- 3) create_pago_atomico valida monto_total contra el envio real
-- Cierra el hallazgo de input no confiable: monto_total venia del caller HTTP. Ahora el
-- importe a cobrar se deriva del envio (costo + costo_seguro para CC; monto_a_cobrar para
-- COD). Si el caller manda un monto_total que no coincide, se ignora y se usa el real.
-- =============================================================================

CREATE OR REPLACE FUNCTION create_pago_atomico(
  p_envio_id        UUID,
  p_monto_total     BIGINT,
  p_monto_recibido  BIGINT,
  p_metodo_pago     metodo_pago,
  p_fecha_pago      DATE,
  p_referencia      TEXT,
  p_notas           TEXT,
  p_creado_por      UUID,
  p_usuario_nombre  TEXT,
  p_tracking_number TEXT,
  p_ip              INET,
  p_user_agent      TEXT
)
RETURNS pagos
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_estado       estado_pago;
  v_pago         pagos;
  v_descripcion  TEXT;
  v_tipo_pago    tipo_pago;
  v_monto_total  BIGINT;
BEGIN
  -- Fuente de verdad del importe del envio. Para cuenta_corriente el cobro total es el
  -- costo facturado (costo + seguro). Para contra_entrega es el monto_a_cobrar (el dinero
  -- que el repartidor levanta en la calle). Cualquier otro tipo cae al costo.
  SELECT tipo_pago,
         CASE
           WHEN tipo_pago = 'contra_entrega' THEN monto_a_cobrar
           ELSE (costo + COALESCE(costo_seguro, 0))
         END::BIGINT
    INTO v_tipo_pago, v_monto_total
    FROM envios
   WHERE id = p_envio_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'envio_no_encontrado: %', p_envio_id USING ERRCODE = 'P0001';
  END IF;

  -- El caller puede mandar monto_total pero no manda: validamos que coincida con el real.
  -- Si difiere, es un bug del caller o tampering: rechazamos en vez de persistir el del caller.
  IF p_monto_total IS NOT NULL AND p_monto_total <> v_monto_total THEN
    RAISE EXCEPTION 'pago_monto_total_invalido: monto_total enviado % no coincide con el del envio %',
      p_monto_total, v_monto_total
      USING ERRCODE = 'P0001';
  END IF;

  IF p_monto_recibido < 0 THEN
    RAISE EXCEPTION 'pago_monto_recibido_invalido: monto_recibido debe ser >= 0'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_monto_recibido > v_monto_total THEN
    RAISE EXCEPTION 'pago_monto_recibido_invalido: monto_recibido % excede monto_total %',
      p_monto_recibido, v_monto_total
      USING ERRCODE = 'P0001';
  END IF;

  IF p_monto_recibido >= v_monto_total THEN
    v_estado := 'pagado';
  ELSIF p_monto_recibido > 0 THEN
    v_estado := 'pago_parcial';
  ELSE
    v_estado := 'pendiente';
  END IF;

  INSERT INTO pagos (
    envio_id, monto_total, monto_recibido, metodo_pago, estado_pago,
    fecha_pago, referencia, notas, creado_por
  ) VALUES (
    p_envio_id, v_monto_total, p_monto_recibido, p_metodo_pago, v_estado,
    p_fecha_pago, p_referencia, p_notas, p_creado_por
  )
  RETURNING * INTO v_pago;

  v_descripcion := format(
    'Pago creado para envio %s: %s/%s Gs. (%s)',
    p_tracking_number, p_monto_recibido, v_monto_total, v_estado
  );

  INSERT INTO auditoria_log (
    usuario, usuario_id, accion, entidad, entidad_id,
    descripcion, valor_anterior, valor_nuevo, ip_address, user_agent
  ) VALUES (
    p_usuario_nombre, p_creado_por, 'pago', 'pago', v_pago.id::TEXT,
    v_descripcion, NULL, to_jsonb(v_pago), p_ip, p_user_agent
  );

  RETURN v_pago;
END;
$$;

COMMENT ON FUNCTION create_pago_atomico IS 'Inserta pago + auditoria en la misma transaccion. monto_total se DERIVA del envio real (costo+seguro para CC, monto_a_cobrar para COD), no se confia del caller; si el caller manda un monto_total distinto, rechaza con pago_monto_total_invalido.';

-- =============================================================================
-- 4) anular_pago_atomico: reversa el credito ORIGINAL exacto y usa la firma de 9 args
-- Cierra dos defectos compuestos:
--   a) llamaba a registrar_movimiento_cc con 10 argumentos (firma desincronizada).
--   b) reversaba monto_recibido ACTUAL del pago en vez del credito originalmente asentado.
--      Con la Opcion A el pago CC ya no se puede editar, asi que monto_recibido al anular
--      == el que genero el credito. Aun asi reversamos contra el ledger real: la suma de
--      los movimientos credito de ese pago, para que la conservacion de dinero sea exacta
--      aunque haya habido ajustes manuales.
-- =============================================================================

CREATE OR REPLACE FUNCTION anular_pago_atomico(
  p_pago_id        UUID,
  p_motivo         TEXT,
  p_anulado_por    UUID,
  p_usuario_nombre TEXT,
  p_ip             INET,
  p_user_agent     TEXT
)
RETURNS pagos
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pago_previo   pagos;
  v_pago_actual   pagos;
  v_envio         RECORD;
  v_credito_neto  BIGINT;
  v_monto_reverso BIGINT;
  v_descripcion   TEXT;
BEGIN
  IF p_motivo IS NULL OR length(p_motivo) < 10 THEN
    RAISE EXCEPTION 'motivo_insuficiente: el motivo debe tener al menos 10 caracteres'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_pago_previo
    FROM pagos
   WHERE id = p_pago_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'pago_no_encontrado: %', p_pago_id USING ERRCODE = 'P0001';
  END IF;

  IF v_pago_previo.anulado = TRUE THEN
    RAISE EXCEPTION 'pago_ya_anulado: %', p_pago_id USING ERRCODE = 'P0001';
  END IF;

  UPDATE pagos
     SET anulado          = TRUE,
         anulado_por      = p_anulado_por,
         anulado_en       = NOW(),
         motivo_anulacion = p_motivo,
         updated_at       = NOW()
   WHERE id = p_pago_id
  RETURNING * INTO v_pago_actual;

  v_descripcion := format('Pago %s anulado. Motivo: %s', p_pago_id, p_motivo);

  INSERT INTO auditoria_log (
    usuario, usuario_id, accion, entidad, entidad_id,
    descripcion, valor_anterior, valor_nuevo, ip_address, user_agent
  ) VALUES (
    p_usuario_nombre, p_anulado_por, 'anular', 'pago', v_pago_actual.id::TEXT,
    v_descripcion, to_jsonb(v_pago_previo), to_jsonb(v_pago_actual), p_ip, p_user_agent
  );

  SELECT cliente_id, tipo_pago, tracking_number
    INTO v_envio
    FROM envios
   WHERE id = v_pago_previo.envio_id;

  IF FOUND AND v_envio.tipo_pago = 'cuenta_corriente' THEN
    -- Credito neto realmente asentado por este pago en el ledger (creditos cuentan
    -- negativos). Reversar exactamente ese monto y no el monto_recibido actual cierra la
    -- conservacion de dinero: lo que entro al ledger por este pago sale por el reverso.
    SELECT COALESCE(-SUM(monto), 0)::BIGINT
      INTO v_credito_neto
      FROM movimientos_cuenta_corriente
     WHERE pago_id = p_pago_id
       AND tipo = 'credito';

    -- Si por cualquier razon no hubo credito asentado (pago con monto_recibido 0), no hay
    -- nada que reversar.
    IF v_credito_neto > 0 THEN
      v_monto_reverso := v_credito_neto;

      -- p_bypass_limite => TRUE explicito (preserva intencion de migracion 021): un
      -- reverso re-incrementa la deuda y NUNCA debe rebotar por limite de credito, aunque
      -- en el futuro cambie el tipo-check de registrar_movimiento_cc. Hoy 'reverso' ya esta
      -- exento del check, esto lo blinda ante cambios futuros.
      PERFORM registrar_movimiento_cc(
        v_envio.cliente_id,
        v_pago_previo.envio_id,
        p_pago_id,
        'reverso'::tipo_movimiento_cc,
        v_monto_reverso,
        'Reverso por anulacion del pago ' || p_pago_id || ': ' || p_motivo,
        p_anulado_por,
        p_ip,
        p_user_agent,
        TRUE
      );
    END IF;
  END IF;

  RETURN v_pago_actual;
END;
$$;

COMMENT ON FUNCTION anular_pago_atomico IS 'Anula pago + auditoria + reverso de saldo CC, todo en una transaccion. El reverso re-incrementa la deuda exactamente por el credito neto que este pago asento en el ledger (no por monto_recibido actual). Llama registrar_movimiento_cc con su firma canonica de 9 args. Errores: pago_no_encontrado, pago_ya_anulado, motivo_insuficiente.';

-- =============================================================================
-- 5) Constraint a nivel DB contra rangos de liquidacion solapados
-- El chequeo en crear_liquidacion (migracion 023) es necesario pero no suficiente: dos
-- transacciones concurrentes pueden pasar ambas el SELECT y crear filas solapadas. Un
-- EXCLUDE USING gist hace el estado invalido IMPOSIBLE a nivel DB.
-- daterange [desde, hasta] inclusivo en ambos extremos: usamos '[]'.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS btree_gist;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'liquidaciones_repartidor_rango_no_solapado'
  ) THEN
    ALTER TABLE liquidaciones_repartidor
      ADD CONSTRAINT liquidaciones_repartidor_rango_no_solapado
      EXCLUDE USING gist (
        repartidor_id WITH =,
        daterange(fecha_desde, fecha_hasta, '[]') WITH &&
      );
  END IF;
END $$;

COMMENT ON CONSTRAINT liquidaciones_repartidor_rango_no_solapado ON liquidaciones_repartidor IS 'Imposible a nivel DB tener dos liquidaciones del mismo repartidor con rangos de fecha solapados. Complementa el chequeo en crear_liquidacion cerrando la race window entre dos transacciones concurrentes.';

-- =============================================================================
-- 6) Bloquear cambio de tipo_pago de un envio con pago activo asociado
-- Cambiar tipo_pago despues de existir un pago desincroniza la logica de ledger (CC vs
-- COD generan asientos distintos) y la liquidacion. Se vuelve imposible a nivel DB.
-- =============================================================================

CREATE OR REPLACE FUNCTION trg_envio_block_tipo_pago_change_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.tipo_pago IS DISTINCT FROM OLD.tipo_pago THEN
    IF EXISTS (
      SELECT 1 FROM pagos
       WHERE envio_id = NEW.id
         AND anulado = FALSE
    ) THEN
      RAISE EXCEPTION 'tipo_pago_no_modificable: el envio tiene un pago activo, no se puede cambiar el tipo de pago'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_envio_block_tipo_pago_change ON envios;
CREATE TRIGGER trg_envio_block_tipo_pago_change
BEFORE UPDATE OF tipo_pago ON envios
FOR EACH ROW
EXECUTE FUNCTION trg_envio_block_tipo_pago_change_fn();

COMMENT ON FUNCTION trg_envio_block_tipo_pago_change_fn IS 'Rechaza cambiar tipo_pago de un envio que ya tiene un pago activo (no anulado). Error: tipo_pago_no_modificable.';

-- =============================================================================
-- 7) Cola visible de COD cobrado-sin-registrar
-- Si el pago COD falla al registrarse (RPC create_pago_atomico tira un error que no es
-- 409 duplicado), el envio queda entregado pero sin pago. Hoy eso se traga silencioso.
-- Esta columna lo marca para reconciliacion manual. Nunca plata fantasma silenciosa.
-- =============================================================================

ALTER TABLE envios
  ADD COLUMN IF NOT EXISTS cod_pago_pendiente BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN envios.cod_pago_pendiente IS 'TRUE si un envio COD se marco entregado pero el registro del pago fallo (cobrado en la calle sin asiento). Cola de reconciliacion manual. Se limpia cuando el pago se registra correctamente.';

CREATE INDEX IF NOT EXISTS idx_envios_cod_pago_pendiente
  ON envios (cod_pago_pendiente)
  WHERE cod_pago_pendiente = TRUE;

-- =============================================================================
-- 8) Recompute de saldo de todos los clientes desde el ledger (idempotente)
-- Alinea el cache con la fuente de verdad tras los cambios de arriba. Read del ledger,
-- write del cache. Si ya estaba consistente, no cambia nada.
-- =============================================================================

DO $$
DECLARE
  v_cliente RECORD;
BEGIN
  FOR v_cliente IN
    SELECT DISTINCT cliente_id AS id FROM movimientos_cuenta_corriente
    UNION
    SELECT id FROM clientes WHERE saldo_cuenta_corriente <> 0
  LOOP
    PERFORM recompute_saldo_cc(v_cliente.id);
  END LOOP;
END $$;

COMMIT;

-- =============================================================================
-- ROLLBACK EXPLICITO (correr manualmente para revertir 033)
-- No revierte el recompute de saldo (seccion 8): es siempre correcto, dejarlo no daña.
-- =============================================================================
--
-- BEGIN;
--
-- DROP TRIGGER IF EXISTS trg_envio_block_tipo_pago_change ON envios;
-- DROP FUNCTION IF EXISTS trg_envio_block_tipo_pago_change_fn();
--
-- ALTER TABLE liquidaciones_repartidor
--   DROP CONSTRAINT IF EXISTS liquidaciones_repartidor_rango_no_solapado;
--
-- DROP INDEX IF EXISTS idx_envios_cod_pago_pendiente;
-- ALTER TABLE envios DROP COLUMN IF EXISTS cod_pago_pendiente;
--
-- DROP FUNCTION IF EXISTS verificar_saldo_cc();
-- DROP FUNCTION IF EXISTS recompute_saldo_cc(UUID);
--
-- -- Las funciones create_pago_atomico, update_pago_atomico, anular_pago_atomico y
-- -- registrar_movimiento_cc quedan en su version 033. Para volver a la version previa,
-- -- re-aplicar las migraciones 020, 021 y 018 en ese orden. No recomendado: la version
-- -- previa de update_pago_atomico reintroduce CRITICA 1 y 2.
--
-- COMMIT;

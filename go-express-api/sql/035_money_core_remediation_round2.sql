-- 035_money_core_remediation_round2.sql
-- Paso 3 (ronda 2) de la re-arquitectura del nucleo financiero de GO EXPRESS. Cierra los 8
-- bloqueantes (3 CRITICA + 5 ALTA) que la re-auditoria adversarial independiente encontro en
-- la remediacion 034 (docs/STEP3-REAUDIT-REPORT.md), mas los no-bloqueantes B2 (incluido en
-- A3) y B4 (FK a RESTRICT) que se cierran sin riesgo adicional. B1 y B3 quedan flaggeados
-- abajo: son caminos no alcanzables por la API de hoy y su fix introduce comportamiento nuevo
-- no pedido, se posponen hasta exponer los endpoints respectivos.
--
-- Contexto legal: owner personalmente expuesto, plata de afiliados, tolerancia a error CERO.
-- Principio rector inalterado: TODA mutacion de dinero pasa por el ledger con reversa/re-debito
-- atomico bajo lock pesimista; la inmutabilidad y la exclusion se fuerzan a NIVEL DB.
--
-- La 034 cerro las 8 causas raiz en su forma directa pero abrio regresiones e interacciones:
--   C1: el filtro de liquidacion miraba el FLAG cod_pago_pendiente, no el COBRO real.
--   C2: no existia reabrir_liquidacion; los guards de 034 sellaron toda correccion.
--   C3: el sync trigger borraba la senal forense de divergencia al editar el monto del pago.
--   A1: create/update/anular_pago no lockeaban el envio (TOCTOU vs el guard de monto COD).
--   A2: el soft-delete reversaba solo (debito,ajuste,reverso), dejaba credito/nota_credito vivo.
--   A3: la rama delta de costo CC hardcodeaba bypass=TRUE y burlaba el limite de credito.
--   A4: el guard G sobre-bloqueaba 'con_diferencia' (el estado que mas necesita correccion).
--   A5: el guard G era un EXISTS no-locking; carrera con cerrar_liquidacion (locks disjuntos).
--   M1: pago CC contra envio soft-deleted asentaba credito fantasma (guard solo en TS).
--
-- IDEMPOTENCIA: CREATE OR REPLACE en funciones, DROP TRIGGER IF EXISTS antes de cada CREATE,
-- DO-guards / IF NOT EXISTS en constraints y FKs. Corre dos veces sin efecto secundario.
--
-- ROLLBACK: seccion explicita comentada al final. Revierte cada funcion a su cuerpo 034
-- (verificado contra prod con pg_get_functiondef el 2026-06-17), dropea reabrir_liquidacion y
-- su privilegio, y restaura los FK envio_id/pagos.envio_id a su ON DELETE original.
--
-- FIRMAS VERIFICADAS CONTRA PROD (pg_proc, 2026-06-17) antes de cada CREATE OR REPLACE.
-- registrar_movimiento_cc conserva sus 10 args (p_bypass_limite incluido): NO se toca.
-- Todas las funciones de pago/liquidacion conservan su firma exacta (verificado con
-- pg_get_function_identity_arguments): el backend deployado sigue llamando con los mismos args.

BEGIN;

-- ===========================================================================================
-- 'reabrir' como accion auditable de primera clase. El enum auditoria_accion no la tenia;
-- reabrir_liquidacion la audita como una accion distinta de 'editar' para que el rastro
-- forense sea inequivoco. ADD VALUE es seguro dentro de la transaccion porque el valor nuevo
-- no se USA en esta misma transaccion (solo se referencia en el cuerpo de una funcion, que se
-- ejecuta despues del COMMIT). Idempotente via IF NOT EXISTS.
-- ===========================================================================================

ALTER TYPE public.auditoria_accion ADD VALUE IF NOT EXISTS 'reabrir';

-- ===========================================================================================
-- BLOQUEANTE C2 + A4 -- reabrir_liquidacion: la operacion que 034 prometia en sus mensajes de
-- error pero que no existia en ninguna capa. Sin ella, una liquidacion cerrada o con_diferencia
-- era una trampa: la plata real que llegaba tarde no tenia via de entrada y los guards G+B
-- sellaban toda correccion. Opera sobre cerrada/con_diferencia, revierte a pendiente,
-- des-concilia los envios y vuelve a poner los campos de cierre en NULL (lo exige el CHECK
-- liquidacion_estado_coherente: pendiente => cerrada_por/cerrada_en/monto_total_recibido NULL).
-- Exige motivo >= 10 chars y audita el antes/despues completo.
-- ===========================================================================================

CREATE OR REPLACE FUNCTION public.reabrir_liquidacion(
  p_liquidacion_id uuid, p_motivo text, p_actor uuid,
  p_usuario_nombre text, p_ip inet, p_user_agent text)
 RETURNS liquidaciones_repartidor
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
DECLARE
  v_previa   liquidaciones_repartidor;
  v_actual   liquidaciones_repartidor;
  v_descrip  TEXT;
BEGIN
  IF p_motivo IS NULL OR length(trim(p_motivo)) < 10 THEN
    RAISE EXCEPTION 'motivo_insuficiente: reabrir una liquidacion requiere un motivo de al menos 10 caracteres'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_previa
    FROM liquidaciones_repartidor
   WHERE id = p_liquidacion_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'liquidacion_no_encontrada: %', p_liquidacion_id USING ERRCODE = 'P0001';
  END IF;

  IF v_previa.estado = 'pendiente' THEN
    RAISE EXCEPTION 'liquidacion_no_cerrada: la liquidacion ya esta pendiente, no hay nada que reabrir'
      USING ERRCODE = 'P0001';
  END IF;

  -- Volver a pendiente: los tres campos de cierre VUELVEN a NULL para no violar el CHECK
  -- liquidacion_estado_coherente. El monto recibido del cierre anterior se pierde a proposito:
  -- el cierre siguiente lo vuelve a pesar contra el efectivo fisico real.
  -- notas tambien vuelve a NULL: la nota del cierre anterior ('cerrada con diferencia ...') deja
  -- de aplicar al volver a pendiente. El motivo de la reapertura queda en auditoria_log, y el
  -- re-cierre escribe su propia nota. Asi el row en estado pendiente no arrastra texto obsoleto.
  UPDATE liquidaciones_repartidor
     SET estado               = 'pendiente',
         cerrada_por          = NULL,
         cerrada_en           = NULL,
         monto_total_recibido = NULL,
         notas                = NULL,
         updated_at           = NOW()
   WHERE id = p_liquidacion_id
  RETURNING * INTO v_actual;

  -- Des-conciliar los envios de esta liquidacion. Asi update/anular_pago_atomico vuelven a
  -- permitir la correccion (el guard G solo bloquea liquidaciones no-pendiente) y el envio
  -- queda elegible para re-snapshot al cerrar de nuevo.
  UPDATE liquidacion_envios
     SET conciliado = FALSE
   WHERE liquidacion_id = p_liquidacion_id;

  v_descrip := format(
    'Liquidacion reabierta (estaba %s, esperado %s Gs, recibido %s Gs). Motivo: %s',
    v_previa.estado, v_previa.monto_total_esperado,
    COALESCE(v_previa.monto_total_recibido, 0), p_motivo
  );

  INSERT INTO auditoria_log (
    usuario, usuario_id, accion, entidad, entidad_id,
    descripcion, valor_anterior, valor_nuevo, ip_address, user_agent
  ) VALUES (
    p_usuario_nombre, p_actor, 'reabrir', 'liquidacion', v_actual.id::TEXT,
    v_descrip, to_jsonb(v_previa), to_jsonb(v_actual), p_ip, p_user_agent
  );

  RETURN v_actual;
END;
$fn$;

COMMENT ON FUNCTION public.reabrir_liquidacion(uuid, text, uuid, text, inet, text) IS
  'Reabre una liquidacion cerrada o con_diferencia: la vuelve a pendiente (nulando cerrada_por/cerrada_en/monto_total_recibido para respetar liquidacion_estado_coherente), des-concilia sus envios y audita. Habilita el flujo reabrir->corregir->cerrar que los mensajes de pago_en_liquidacion_cerrada instruyen. Errores: motivo_insuficiente, liquidacion_no_encontrada, liquidacion_no_cerrada.';

-- ===========================================================================================
-- BLOQUEANTE C1 (parte 1) -- el sync trigger derivaba cod_pago_pendiente del HECHO de que
-- existe un pago activo, ignorando si ese pago cubre el monto. Un pago COD pendiente de monto 0
-- limpiaba la cola y el envio entraba a la liquidacion sin cobrar. Ahora pendiente se deriva del
-- COBRO real: si el pago no esta 'pagado', el envio sigue pendiente de reconciliar.
--
-- BLOQUEANTE C3 -- separar la senal forense del flag operacional. El trigger SOLO limpia/marca
-- cod_pago_pendiente en el INSERT del pago (cobro asentado por primera vez). En UPDATE del
-- pago, NO toca cod_pago_pendiente: solo sincroniza monto_cobrado. Asi la divergencia de calle
-- que el handler de entrega marca a mano (cod_pago_pendiente=TRUE) solo se limpia por una
-- accion humana auditada, nunca como efecto colateral de editar el monto.
--
-- Firma del trigger conservada (AFTER INSERT OR UPDATE OF monto_recibido, anulado).
-- ===========================================================================================

CREATE OR REPLACE FUNCTION public.trg_pago_sync_envio_cobrado_fn()
  RETURNS trigger
  LANGUAGE plpgsql
AS $fn$
DECLARE
  v_envio_tipo_pago  TEXT;
  v_efectivo_cobrado BIGINT;
  v_pendiente        BOOLEAN;
BEGIN
  SELECT tipo_pago INTO v_envio_tipo_pago
    FROM envios
   WHERE id = NEW.envio_id;

  IF v_envio_tipo_pago IS NULL OR v_envio_tipo_pago <> 'contra_entrega' THEN
    RETURN NEW;
  END IF;

  IF NEW.anulado = TRUE THEN
    v_efectivo_cobrado := 0;
  ELSE
    v_efectivo_cobrado := NEW.monto_recibido;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Primer asiento del cobro. El envio sale de la cola SOLO si el cobro es real (pagado).
    -- Un pago anulado, parcial o de monto 0 deja el envio pendiente de reconciliar y, por C1,
    -- fuera de la liquidacion hasta tener cobro completo.
    IF NEW.anulado = TRUE THEN
      v_pendiente := TRUE;
    ELSE
      v_pendiente := (NEW.estado_pago <> 'pagado');
    END IF;

    UPDATE envios
       SET monto_cobrado      = v_efectivo_cobrado,
           cod_pago_pendiente = v_pendiente
     WHERE id = NEW.envio_id;

    RETURN NEW;
  END IF;

  -- TG_OP = 'UPDATE'. Sincroniza el efectivo cobrado, pero NO toca cod_pago_pendiente: esa
  -- bandera es la senal forense de divergencia de calle (la setea el handler de entrega a mano)
  -- y se limpia por accion humana auditada (anular+rehacer el pago, o cerrar la liquidacion),
  -- nunca como efecto lateral de un ajuste de monto.
  IF NEW.anulado = TRUE AND OLD.anulado = FALSE THEN
    -- Anular un pago SI reabre la cola: el cobro asentado dejo de existir.
    UPDATE envios
       SET monto_cobrado      = 0,
           cod_pago_pendiente = TRUE
     WHERE id = NEW.envio_id;
  ELSE
    UPDATE envios
       SET monto_cobrado = v_efectivo_cobrado
     WHERE id = NEW.envio_id;
  END IF;

  RETURN NEW;
END;
$fn$;

-- ===========================================================================================
-- BLOQUEANTE C1 (parte 2) -- crear_liquidacion gatea por COBRO REAL, no por el flag. Se agrega
-- a ambas ramas (count y snapshot) la exigencia de un pago activo 'pagado' que cubra el monto.
-- Asi un COD cobrado parcial/cero NUNCA entra a la liquidacion: queda visible en la cola y es
-- recuperable cuando llega la plata. El filtro cod_pago_pendiente=FALSE se conserva (defensa en
-- profundidad), pero la verdad ahora la dice el pago.
--
-- CAUSA H conservada: el handler exclusion_violation -> liquidacion_rango_solapado se mantiene.
-- Firma verificada contra prod, se conserva intacta.
-- ===========================================================================================

CREATE OR REPLACE FUNCTION public.crear_liquidacion(
  p_repartidor_id uuid, p_fecha_desde date, p_fecha_hasta date, p_creado_por uuid,
  p_usuario_nombre text, p_ip inet, p_user_agent text)
 RETURNS liquidaciones_repartidor
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
DECLARE
  v_liquidacion       liquidaciones_repartidor;
  v_monto_esperado    BIGINT;
  v_count             INT;
  v_descripcion       TEXT;
  v_repartidor_nombre TEXT;
  v_solapada_id       UUID;
BEGIN
  IF p_fecha_hasta < p_fecha_desde THEN
    RAISE EXCEPTION 'rango_invalido: fecha_hasta debe ser >= fecha_desde'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT id INTO v_solapada_id
    FROM liquidaciones_repartidor
   WHERE repartidor_id = p_repartidor_id
     AND fecha_desde <= p_fecha_hasta
     AND fecha_hasta >= p_fecha_desde
   ORDER BY created_at ASC
   LIMIT 1;

  IF v_solapada_id IS NOT NULL THEN
    RAISE EXCEPTION 'liquidacion_rango_solapado: ya existe una liquidacion del repartidor (%) que solapa con el rango', v_solapada_id
      USING ERRCODE = 'P0001';
  END IF;

  SELECT nombre INTO v_repartidor_nombre
    FROM repartidores
   WHERE id = p_repartidor_id AND eliminado = FALSE;

  IF v_repartidor_nombre IS NULL THEN
    RAISE EXCEPTION 'repartidor_no_encontrado: %', p_repartidor_id
      USING ERRCODE = 'P0001';
  END IF;

  SELECT COUNT(*), COALESCE(SUM(e.monto_a_cobrar), 0)
    INTO v_count, v_monto_esperado
    FROM envios e
   WHERE e.repartidor_id = p_repartidor_id
     AND e.estado = 'entregado'
     AND e.tipo_pago = 'contra_entrega'
     AND e.eliminado = FALSE
     AND e.cod_pago_pendiente = FALSE
     AND e.fecha_entrega_real IS NOT NULL
     AND (e.fecha_entrega_real AT TIME ZONE 'America/Asuncion')::date
         BETWEEN p_fecha_desde AND p_fecha_hasta
     -- BLOQUEANTE C1: cobro real, no solo el flag. Debe existir un pago activo 'pagado'.
     AND EXISTS (
       SELECT 1 FROM pagos p
        WHERE p.envio_id = e.id
          AND p.anulado = FALSE
          AND p.estado_pago = 'pagado'
     )
     AND NOT EXISTS (
       SELECT 1
         FROM liquidacion_envios le
        WHERE le.envio_id = e.id
          AND le.conciliado = TRUE
     );

  INSERT INTO liquidaciones_repartidor (
    repartidor_id, fecha_desde, fecha_hasta,
    monto_total_esperado, creado_por
  ) VALUES (
    p_repartidor_id, p_fecha_desde, p_fecha_hasta,
    v_monto_esperado, p_creado_por
  )
  RETURNING * INTO v_liquidacion;

  IF v_count > 0 THEN
    INSERT INTO liquidacion_envios (liquidacion_id, envio_id, monto_esperado, monto_cobrado)
    SELECT v_liquidacion.id, e.id, e.monto_a_cobrar, COALESCE(e.monto_cobrado, 0)
      FROM envios e
     WHERE e.repartidor_id = p_repartidor_id
       AND e.estado = 'entregado'
       AND e.tipo_pago = 'contra_entrega'
       AND e.eliminado = FALSE
       AND e.cod_pago_pendiente = FALSE
       AND e.fecha_entrega_real IS NOT NULL
       AND (e.fecha_entrega_real AT TIME ZONE 'America/Asuncion')::date
           BETWEEN p_fecha_desde AND p_fecha_hasta
       AND EXISTS (
         SELECT 1 FROM pagos p
          WHERE p.envio_id = e.id
            AND p.anulado = FALSE
            AND p.estado_pago = 'pagado'
       )
       AND NOT EXISTS (
         SELECT 1
           FROM liquidacion_envios le
          WHERE le.envio_id = e.id
            AND le.conciliado = TRUE
       );
  END IF;

  v_descripcion := format(
    'Liquidacion creada para %s (rango %s a %s): %s envios, %s Gs esperados',
    v_repartidor_nombre, p_fecha_desde, p_fecha_hasta, v_count, v_monto_esperado
  );

  INSERT INTO auditoria_log (
    usuario, usuario_id, accion, entidad, entidad_id,
    descripcion, valor_anterior, valor_nuevo, ip_address, user_agent
  ) VALUES (
    p_usuario_nombre, p_creado_por, 'crear', 'liquidacion', v_liquidacion.id::TEXT,
    v_descripcion, NULL, to_jsonb(v_liquidacion), p_ip, p_user_agent
  );

  RETURN v_liquidacion;

EXCEPTION
  WHEN exclusion_violation THEN
    RAISE EXCEPTION 'liquidacion_rango_solapado: ya existe una liquidacion del repartidor cuyo rango solapa con el solicitado'
      USING ERRCODE = 'P0001';
END;
$fn$;

-- ===========================================================================================
-- BLOQUEANTE A2 -- soft-delete reversa el NETO COMPLETO del envio. La 034 reversaba solo
-- (debito,ajuste,reverso), excluyendo credito/nota_credito; un envio con NC scoped quedaba con
-- saldo negativo a favor del afiliado por un envio inexistente. Ahora reversa SUM sobre TODOS
-- los tipos del envio_id, de modo que SUM(movimientos del envio) == 0 post-anulacion.
--
-- BLOQUEANTE A3 (+ no-bloqueante B2) -- la rama delta de costo CC pasaba bypass=TRUE hardcoded,
-- saltando el limite de credito en cada edicion de costo al alza. Se pasa
-- COALESCE(NEW.bypass_limite_credito, FALSE), consistente con el INSERT y la rama tasar-0.
-- ===========================================================================================

CREATE OR REPLACE FUNCTION public.trg_envio_cc_debito_fn()
  RETURNS trigger
  LANGUAGE plpgsql
AS $fn$
DECLARE
  v_monto        BIGINT;
  v_monto_old    BIGINT;
  v_delta        BIGINT;
  v_actor        UUID := '00000000-0000-4000-a000-000000000001';
  v_debito_neto  BIGINT;
  v_neto_total   BIGINT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.tipo_pago <> 'cuenta_corriente' OR NEW.eliminado = TRUE THEN
      RETURN NEW;
    END IF;

    v_monto := NEW.costo + COALESCE(NEW.costo_seguro, 0);
    IF v_monto <= 0 THEN
      RETURN NEW;
    END IF;

    PERFORM registrar_movimiento_cc(
      NEW.cliente_id, NEW.id, NULL, 'debito', v_monto,
      'Envio ' || NEW.tracking_number, v_actor, NULL, NULL,
      COALESCE(NEW.bypass_limite_credito, FALSE)
    );
    RETURN NEW;
  END IF;

  IF NEW.tipo_pago <> 'cuenta_corriente' THEN
    RETURN NEW;
  END IF;

  -- Debito neto realmente asentado (debito + ajustes - reversos previos): base para el ajuste
  -- por delta de costo, que solo concierne a la cara de DEUDA del envio.
  SELECT COALESCE(SUM(monto), 0)::BIGINT
    INTO v_debito_neto
    FROM movimientos_cuenta_corriente
   WHERE envio_id = NEW.id
     AND tipo IN ('debito', 'ajuste', 'reverso');

  -- Caso 1: soft-delete. BLOQUEANTE A2: reversar el NETO COMPLETO del envio (TODOS los tipos,
  -- incluidos credito/nota_credito), no solo la cara de deuda. Asi el envio anulado deja
  -- SUM(movimientos del envio) == 0 y no queda saldo fantasma a favor ni en contra.
  IF NEW.eliminado = TRUE AND OLD.eliminado = FALSE THEN
    SELECT COALESCE(SUM(monto), 0)::BIGINT
      INTO v_neto_total
      FROM movimientos_cuenta_corriente
     WHERE envio_id = NEW.id;

    IF v_neto_total <> 0 THEN
      PERFORM registrar_movimiento_cc(
        NEW.cliente_id, NEW.id, NULL, 'reverso', -v_neto_total,
        'Reverso por anulacion del envio ' || NEW.tracking_number,
        v_actor, NULL, NULL, TRUE
      );
    END IF;
    RETURN NEW;
  END IF;

  -- Restauracion (eliminado TRUE -> FALSE): re-debitar el costo vigente si no quedo debito
  -- vivo. La app no expone restore hoy (no-bloqueante B1); el limite se respeta por defecto
  -- (bypass desde la bandera del envio).
  IF NEW.eliminado = FALSE AND OLD.eliminado = TRUE THEN
    v_monto := NEW.costo + COALESCE(NEW.costo_seguro, 0);
    IF v_debito_neto = 0 AND v_monto > 0 THEN
      PERFORM registrar_movimiento_cc(
        NEW.cliente_id, NEW.id, NULL, 'ajuste', v_monto,
        'Re-debito por restauracion del envio ' || NEW.tracking_number,
        v_actor, NULL, NULL, COALESCE(NEW.bypass_limite_credito, FALSE)
      );
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.eliminado = TRUE THEN
    RETURN NEW;
  END IF;

  -- Caso 2: cambio de costo/costo_seguro en envio CC vivo. Ajuste por delta exacto.
  v_monto     := NEW.costo + COALESCE(NEW.costo_seguro, 0);
  v_monto_old := OLD.costo + COALESCE(OLD.costo_seguro, 0);

  IF v_monto <> v_monto_old THEN
    IF v_debito_neto = 0 AND v_monto > 0 THEN
      PERFORM registrar_movimiento_cc(
        NEW.cliente_id, NEW.id, NULL, 'debito', v_monto,
        'Debito por costo asignado al envio ' || NEW.tracking_number,
        v_actor, NULL, NULL, COALESCE(NEW.bypass_limite_credito, FALSE)
      );
      RETURN NEW;
    END IF;

    v_delta := v_monto - v_debito_neto;
    IF v_delta <> 0 THEN
      -- BLOQUEANTE A3 + B2: el limite de credito se respeta tambien al ajustar costo al alza.
      -- El bypass viene de la bandera del envio (override admin auditado), nunca hardcodeado.
      PERFORM registrar_movimiento_cc(
        NEW.cliente_id, NEW.id, NULL, 'ajuste', v_delta,
        'Ajuste de costo del envio ' || NEW.tracking_number
          || ' (' || v_debito_neto || ' -> ' || v_monto || ')',
        v_actor, NULL, NULL, COALESCE(NEW.bypass_limite_credito, FALSE)
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$fn$;

-- ===========================================================================================
-- BLOQUEANTE M1 -- credito fantasma contra envio soft-deleted, a nivel DB. El guard vivia solo
-- en TS (ventana TOCTOU). Se lleva a la DB: trg_pago_cc_credito_fn rechaza asentar el credito
-- si el envio esta eliminado. La verificacion corre dentro del mismo INSERT del pago, asi que
-- no hay ventana entre el check y el asiento.
-- ===========================================================================================

CREATE OR REPLACE FUNCTION public.trg_pago_cc_credito_fn()
  RETURNS trigger
  LANGUAGE plpgsql
AS $fn$
DECLARE
  v_envio       RECORD;
  v_descripcion TEXT;
BEGIN
  IF NEW.monto_recibido <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT cliente_id, tipo_pago, tracking_number, eliminado
    INTO v_envio
    FROM envios
   WHERE id = NEW.envio_id
   FOR UPDATE;

  IF NOT FOUND OR v_envio.tipo_pago <> 'cuenta_corriente' THEN
    RETURN NEW;
  END IF;

  -- BLOQUEANTE M1: un envio anulado no puede generar credito de cuenta corriente. Bloqueo a
  -- nivel DB bajo el lock del envio: cierra la ventana TOCTOU que el check TS dejaba abierta.
  IF v_envio.eliminado = TRUE THEN
    RAISE EXCEPTION 'pago_envio_eliminado: no se puede asentar credito de un pago contra un envio anulado (envio %)', NEW.envio_id
      USING ERRCODE = 'P0001';
  END IF;

  v_descripcion := 'Pago envio ' || v_envio.tracking_number;

  PERFORM registrar_movimiento_cc(
    v_envio.cliente_id, NEW.envio_id, NEW.id, 'credito', -NEW.monto_recibido,
    v_descripcion, NEW.creado_por, NULL, NULL
  );

  RETURN NEW;
END;
$fn$;

-- ===========================================================================================
-- BLOQUEANTE A1 + A4 + A5 -- update_pago_atomico:
--   A1: FOR UPDATE del envio antes de leer su monto. Serializa contra
--       trg_envio_block_cod_monto_change y elimina el TOCTOU monto_a_cobrar vs create/update.
--   A4: el guard G permite editar/anular en 'con_diferencia'; bloquea SOLO 'cerrada'. El estado
--       que mas necesita correccion deja de ser inmutable. El flujo correcto en cerrada es
--       reabrir_liquidacion -> corregir -> cerrar.
--   A5: el guard G ahora lockea la liquidacion (FOR UPDATE OF l) con el mismo orden de lock que
--       cerrar_liquidacion, cerrando el TOCTOU de locks disjuntos.
-- Firma conservada intacta (verificada contra prod).
-- ===========================================================================================

CREATE OR REPLACE FUNCTION public.update_pago_atomico(
  p_pago_id uuid, p_monto_recibido bigint, p_metodo_pago metodo_pago, p_fecha_pago date,
  p_referencia text, p_notas text, p_apply_metodo boolean, p_apply_fecha boolean,
  p_apply_referencia boolean, p_apply_notas boolean, p_actualizado_por uuid,
  p_usuario_nombre text, p_ip inet, p_user_agent text)
 RETURNS pagos
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
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

  -- A5: lockear la(s) liquidacion(es) del envio en el mismo orden que cerrar_liquidacion
  -- (la liquidacion primero) antes de leer su estado. Si un cierre concurrente esta corriendo,
  -- esto espera a que commitee y entonces ve el estado real, eliminando el TOCTOU.
  PERFORM 1
     FROM liquidacion_envios le
     JOIN liquidaciones_repartidor l ON l.id = le.liquidacion_id
    WHERE le.envio_id = v_pago_previo.envio_id
    FOR UPDATE OF l;

  -- A4: bloquear SOLO 'cerrada'. 'con_diferencia' es un problema abierto y debe poder corregirse.
  IF EXISTS (
    SELECT 1
      FROM liquidacion_envios le
      JOIN liquidaciones_repartidor l ON l.id = le.liquidacion_id
     WHERE le.envio_id = v_pago_previo.envio_id
       AND l.estado = 'cerrada'
  ) THEN
    RAISE EXCEPTION 'pago_en_liquidacion_cerrada: el envio pertenece a una liquidacion cerrada; reabrir la liquidacion antes de editar el pago'
      USING ERRCODE = 'P0001';
  END IF;

  -- A1: lock del envio. Serializa contra el guard de cambio de monto COD y contra otros pagos.
  SELECT tipo_pago,
         CASE
           WHEN tipo_pago = 'contra_entrega' THEN monto_a_cobrar
           ELSE (costo + COALESCE(costo_seguro, 0))
         END::BIGINT
    INTO v_tipo_pago, v_monto_real
    FROM envios
   WHERE id = v_pago_previo.envio_id
   FOR UPDATE;

  IF v_tipo_pago = 'cuenta_corriente'
     AND p_monto_recibido <> v_pago_previo.monto_recibido THEN
    RAISE EXCEPTION 'pago_cc_no_editable: un pago a cuenta corriente no se edita, se anula y se rehace'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_monto_recibido < 0 THEN
    RAISE EXCEPTION 'pago_monto_recibido_invalido: monto_recibido debe ser >= 0'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_monto_real IS NOT NULL AND p_monto_recibido > v_monto_real THEN
    RAISE EXCEPTION 'pago_monto_recibido_invalido: monto_recibido % excede el importe del envio %',
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
$fn$;

-- ===========================================================================================
-- BLOQUEANTE A1 + A4 + A5 -- anular_pago_atomico: mismos tres fixes. Lock de liquidacion
-- (FOR UPDATE OF l) antes de leer estado, guard solo sobre 'cerrada', y lock del envio antes de
-- tocarlo. El reverso de credito CC se conserva exacto. Firma conservada intacta.
-- ===========================================================================================

CREATE OR REPLACE FUNCTION public.anular_pago_atomico(
  p_pago_id uuid, p_motivo text, p_anulado_por uuid, p_usuario_nombre text,
  p_ip inet, p_user_agent text)
 RETURNS pagos
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
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

  -- A5: lock de liquidacion en orden canonico antes de leer estado.
  PERFORM 1
     FROM liquidacion_envios le
     JOIN liquidaciones_repartidor l ON l.id = le.liquidacion_id
    WHERE le.envio_id = v_pago_previo.envio_id
    FOR UPDATE OF l;

  -- A4: bloquear SOLO 'cerrada'. 'con_diferencia' admite correccion (anular y rehacer).
  IF EXISTS (
    SELECT 1
      FROM liquidacion_envios le
      JOIN liquidaciones_repartidor l ON l.id = le.liquidacion_id
     WHERE le.envio_id = v_pago_previo.envio_id
       AND l.estado = 'cerrada'
  ) THEN
    RAISE EXCEPTION 'pago_en_liquidacion_cerrada: el COD ya fue liquidado al repartidor; reabrir la liquidacion antes de anular el pago'
      USING ERRCODE = 'P0001';
  END IF;

  -- A1: lock del envio antes de mutar su cobro (via el trigger de sync) y leer su tipo.
  SELECT cliente_id, tipo_pago, tracking_number
    INTO v_envio
    FROM envios
   WHERE id = v_pago_previo.envio_id
   FOR UPDATE;

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

  IF FOUND AND v_envio.tipo_pago = 'cuenta_corriente' THEN
    SELECT COALESCE(-SUM(monto), 0)::BIGINT
      INTO v_credito_neto
      FROM movimientos_cuenta_corriente
     WHERE pago_id = p_pago_id
       AND tipo = 'credito';

    IF v_credito_neto > 0 THEN
      v_monto_reverso := v_credito_neto;
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
$fn$;

-- ===========================================================================================
-- BLOQUEANTE A1 (parte create) -- create_pago_atomico: FOR UPDATE del envio antes de leer
-- monto_a_cobrar. Serializa contra un UPDATE concurrente de monto_a_cobrar cuyo guard corre
-- cuando el pago aun no existe; sin el lock, el pago snapshotea el monto viejo y descuadra.
-- Firma conservada intacta (verificada contra prod).
-- ===========================================================================================

CREATE OR REPLACE FUNCTION public.create_pago_atomico(
  p_envio_id uuid, p_monto_total bigint, p_monto_recibido bigint, p_metodo_pago metodo_pago,
  p_fecha_pago date, p_referencia text, p_notas text, p_creado_por uuid, p_usuario_nombre text,
  p_tracking_number text, p_ip inet, p_user_agent text)
 RETURNS pagos
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
DECLARE
  v_estado       estado_pago;
  v_pago         pagos;
  v_descripcion  TEXT;
  v_tipo_pago    tipo_pago;
  v_monto_total  BIGINT;
  v_eliminado    BOOLEAN;
BEGIN
  -- A1: lock del envio. Fuente de verdad del importe. Para COD es monto_a_cobrar, para CC
  -- costo+seguro. El lock serializa contra trg_envio_block_cod_monto_change.
  SELECT tipo_pago, eliminado,
         CASE
           WHEN tipo_pago = 'contra_entrega' THEN monto_a_cobrar
           ELSE (costo + COALESCE(costo_seguro, 0))
         END::BIGINT
    INTO v_tipo_pago, v_eliminado, v_monto_total
    FROM envios
   WHERE id = p_envio_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'envio_no_encontrado: %', p_envio_id USING ERRCODE = 'P0001';
  END IF;

  -- M1 (defensa en profundidad, lado create): un envio anulado no admite pago nuevo. El check
  -- TS de pago.service ya lo cubre, pero bajo el lock del envio el bloqueo es atomico.
  IF v_eliminado = TRUE THEN
    RAISE EXCEPTION 'pago_envio_eliminado: no se puede crear un pago para un envio anulado (envio %)', p_envio_id
      USING ERRCODE = 'P0001';
  END IF;

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
$fn$;

-- ===========================================================================================
-- NO-BLOQUEANTE B4 -- FK del ledger a RESTRICT. movimientos.envio_id estaba en SET NULL y
-- pagos.envio_id en CASCADE: un hard-delete de un envio orfanaria movimientos (perdiendo el
-- vinculo del dinero) o cascadearia pagos contra el trigger append-only. No hay hard-delete por
-- via normal (todo es soft-delete), pero la garantia debe ser declarativa. Se migran ambas a
-- RESTRICT. Idempotente: solo actua si el confdeltype actual no es 'r'.
-- ===========================================================================================

DO $$
DECLARE
  v_conname TEXT;
BEGIN
  SELECT conname INTO v_conname
    FROM pg_constraint
   WHERE conrelid = 'public.movimientos_cuenta_corriente'::regclass
     AND contype = 'f'
     AND confrelid = 'public.envios'::regclass
     AND confdeltype <> 'r';
  IF v_conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.movimientos_cuenta_corriente DROP CONSTRAINT %I', v_conname);
    ALTER TABLE public.movimientos_cuenta_corriente
      ADD CONSTRAINT movimientos_cuenta_corriente_envio_id_fkey
      FOREIGN KEY (envio_id) REFERENCES public.envios(id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
DECLARE
  v_conname TEXT;
BEGIN
  SELECT conname INTO v_conname
    FROM pg_constraint
   WHERE conrelid = 'public.pagos'::regclass
     AND contype = 'f'
     AND confrelid = 'public.envios'::regclass
     AND confdeltype <> 'r';
  IF v_conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.pagos DROP CONSTRAINT %I', v_conname);
    ALTER TABLE public.pagos
      ADD CONSTRAINT pagos_envio_id_fkey
      FOREIGN KEY (envio_id) REFERENCES public.envios(id) ON DELETE RESTRICT;
  END IF;
END $$;

COMMIT;

-- ===========================================================================================
-- NO-BLOQUEANTES POSPUESTOS (flaggeados, no incluidos):
--   B1: re-debito de restauracion enforza limite (asimetrico). No alcanzable (no hay endpoint
--       de restore). Decidir la politica de limite en restore junto al endpoint cuando se cree.
--   B3: transicion tipo_pago COD->CC sin tocar costo crea envio CC vivo con ZERO debito. No
--       alcanzable (PUT omite tipoPago, envioService no lo copia). Cerrar al exponer ajuste de
--       tipo de pago: agregar tipo_pago a la clausula UPDATE OF del trigger de debito + asentar
--       el debito en la transicion. Incluirlo ahora agrega un camino de mutacion de dinero no
--       ejercitado por ningun caller, mayor riesgo que beneficio para el onboarding de hoy.
-- ===========================================================================================

-- ===========================================================================================
-- ROLLBACK (ejecutar manualmente dentro de su propio BEGIN/COMMIT para revertir 035 a 034)
-- ===========================================================================================
-- BEGIN;
--   DROP FUNCTION IF EXISTS public.reabrir_liquidacion(uuid, text, uuid, text, inet, text);
--   -- Restaurar trg_pago_sync_envio_cobrado_fn, crear_liquidacion, trg_envio_cc_debito_fn,
--   -- trg_pago_cc_credito_fn, update_pago_atomico, anular_pago_atomico y create_pago_atomico a
--   -- su cuerpo 034: copiar los bloques CREATE OR REPLACE de 034_money_core_remediation.sql
--   -- (sync trigger, crear_liquidacion, trg_envio_cc_debito_fn, update/anular_pago_atomico) y de
--   -- 000_baseline_prod_schema.sql (trg_pago_cc_credito_fn, create_pago_atomico). El diff 035->034:
--   --   sync trigger vuelve a limpiar/marcar cod_pago_pendiente en UPDATE (pierde C3) y a
--   --     v_pendiente := FALSE incondicional en activo (pierde C1 sync).
--   --   crear_liquidacion pierde el EXISTS pago pagado (pierde C1 filtro).
--   --   trg_envio_cc_debito_fn vuelve a reversar solo (debito,ajuste,reverso) (pierde A2) y a
--   --     bypass TRUE en la rama delta (pierde A3).
--   --   trg_pago_cc_credito_fn pierde el guard envio.eliminado (pierde M1).
--   --   update/anular_pago_atomico pierden FOR UPDATE OF l y FOR UPDATE del envio (pierden A1/A5)
--   --     y el guard vuelve a l.estado <> 'pendiente' (pierde A4).
--   --   create_pago_atomico pierde el FOR UPDATE del envio y el guard eliminado (pierde A1/M1).
--   -- Restaurar los FK a su tipo previo:
--   ALTER TABLE public.movimientos_cuenta_corriente DROP CONSTRAINT IF EXISTS movimientos_cuenta_corriente_envio_id_fkey;
--   ALTER TABLE public.movimientos_cuenta_corriente
--     ADD CONSTRAINT movimientos_cuenta_corriente_envio_id_fkey
--     FOREIGN KEY (envio_id) REFERENCES public.envios(id) ON DELETE SET NULL;
--   ALTER TABLE public.pagos DROP CONSTRAINT IF EXISTS pagos_envio_id_fkey;
--   ALTER TABLE public.pagos
--     ADD CONSTRAINT pagos_envio_id_fkey
--     FOREIGN KEY (envio_id) REFERENCES public.envios(id) ON DELETE CASCADE;
-- COMMIT;

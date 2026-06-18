-- 034_money_core_remediation.sql
-- Paso 3 de la re-arquitectura del nucleo financiero de GO EXPRESS. Cierra las 8 causas
-- raiz que la auditoria adversarial del Paso 2 confirmo (docs/STEP2-AUDIT-REPORT.md):
-- los caminos de EDICION (UPDATE), BORRADO (soft-delete), IMPORT MASIVO (bulk) y la cadena
-- COD -> liquidacion no se habian traido a la disciplina append-only que el Paso 1 aplico
-- solo al INSERT.
--
-- Contexto legal: el owner esta personalmente expuesto, es plata de afiliados, tolerancia
-- a error CERO. Principio rector: TODA mutacion de dinero (UPDATE, DELETE, bulk, COD) pasa
-- por el ledger con reversa/re-debito atomico; la inmutabilidad se fuerza a NIVEL DB (no por
-- convencion); cero monto del caller se confia sin recalculo/validacion server-side.
--
-- Esta migracion NO declara el sistema listo para produccion. Eso lo decide la re-auditoria
-- adversarial del Paso 4.
--
-- IDEMPOTENCIA: CREATE OR REPLACE en funciones, DO-guards / IF NOT EXISTS en constraints,
-- indices y FKs, DROP TRIGGER IF EXISTS antes de cada CREATE TRIGGER. Corre dos veces sin
-- efecto secundario.
--
-- ROLLBACK: seccion explicita comentada al final. Revierte funciones a la firma previa
-- (Paso 1/baseline), dropea triggers/indices/constraints nuevos y restaura el FK a su
-- ON DELETE SET NULL original.
--
-- FIRMAS VERIFICADAS CONTRA PROD (pg_proc, 2026-06-17) antes de cada CREATE OR REPLACE.
-- registrar_movimiento_cc conserva sus 10 args (p_bypass_limite incluido): no se toca.

BEGIN;

-- ===========================================================================================
-- CAUSA F (parte 1) -- Inmutabilidad del ledger a nivel DB.
-- movimientos_cuenta_corriente es append-only por COMMENT pero no por enforcement. Un solo
-- UPDATE/DELETE directo (ORM mal usado, PUT mal ruteado, migracion futura) desincroniza la
-- deuda del afiliado en silencio. Se prohibe ambos a nivel DB salvo en una sesion de
-- reparacion marcada (recompute_saldo_cc es la unica via legitima).
-- ===========================================================================================

CREATE OR REPLACE FUNCTION public.trg_movcc_append_only_fn()
  RETURNS trigger
  LANGUAGE plpgsql
AS $fn$
BEGIN
  IF current_setting('app.allow_ledger_repair', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  RAISE EXCEPTION 'ledger_append_only: movimientos_cuenta_corriente es append-only, no se permite % (anular via registrar_movimiento_cc tipo reverso)', TG_OP
    USING ERRCODE = 'P0001';
END;
$fn$;

DROP TRIGGER IF EXISTS trg_movcc_append_only ON public.movimientos_cuenta_corriente;
CREATE TRIGGER trg_movcc_append_only
  BEFORE UPDATE OR DELETE ON public.movimientos_cuenta_corriente
  FOR EACH ROW EXECUTE FUNCTION public.trg_movcc_append_only_fn();

-- pagos declarado inmutable (solo anulable via anular_pago_atomico) pero DELETE-able a nivel
-- DB. Un DELETE orfana su credito del ledger. Se prohibe el DELETE fisico.
CREATE OR REPLACE FUNCTION public.trg_pagos_no_delete_fn()
  RETURNS trigger
  LANGUAGE plpgsql
AS $fn$
BEGIN
  RAISE EXCEPTION 'pago_no_eliminable: un pago no se borra, se anula via anular_pago_atomico'
    USING ERRCODE = 'P0001';
END;
$fn$;

DROP TRIGGER IF EXISTS trg_pagos_no_delete ON public.pagos;
CREATE TRIGGER trg_pagos_no_delete
  BEFORE DELETE ON public.pagos
  FOR EACH ROW EXECUTE FUNCTION public.trg_pagos_no_delete_fn();

-- ===========================================================================================
-- CAUSA F (parte 2) -- FK del ledger a RESTRICT y UNIQUE un-credito-por-pago.
-- El FK movimientos.pago_id era ON DELETE SET NULL: una cascada futura orfanaria el credito.
-- Lo pasamos a RESTRICT (consistente con cliente_id). Con trg_pagos_no_delete ya no hay
-- DELETE de pagos por via normal, esto es defensa en profundidad.
-- ===========================================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'movimientos_cuenta_corriente_pago_id_fkey'
       AND confdeltype = 'n'  -- 'n' = SET NULL
  ) THEN
    ALTER TABLE public.movimientos_cuenta_corriente
      DROP CONSTRAINT movimientos_cuenta_corriente_pago_id_fkey;
    ALTER TABLE public.movimientos_cuenta_corriente
      ADD CONSTRAINT movimientos_cuenta_corriente_pago_id_fkey
      FOREIGN KEY (pago_id) REFERENCES public.pagos(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- Un credito por pago como maximo. Hoy el unico camino es trg_pago_cc_credito_fn AFTER INSERT,
-- pero la garantia debe ser de la DB: un doble disparo o INSERT manual no puede duplicar el
-- credito y subvaluar la deuda del cliente.
CREATE UNIQUE INDEX IF NOT EXISTS movcc_un_credito_por_pago
  ON public.movimientos_cuenta_corriente (pago_id)
  WHERE tipo = 'credito' AND pago_id IS NOT NULL;

-- Un debito por envio CC como maximo (hace explicito el invariante un-debito-por-envio y
-- atrapa cualquier doble disparo del trigger de debito a nivel DB).
CREATE UNIQUE INDEX IF NOT EXISTS movcc_un_debito_por_envio
  ON public.movimientos_cuenta_corriente (envio_id)
  WHERE tipo = 'debito' AND envio_id IS NOT NULL;

-- ===========================================================================================
-- CAUSA A -- El trigger de debito CC era AFTER INSERT only. Se extiende a AFTER UPDATE para
-- cubrir cambio de costo/costo_seguro (ajuste por delta) y soft-delete (reverso). Asi
-- SUM(movimientos del envio) == costo+seguro vigente, no el del INSERT.
--
-- Se reescribe trg_envio_cc_debito_fn para distinguir TG_OP. Conserva el actor sistema y el
-- COALESCE(NEW.bypass_limite_credito, FALSE) del original.
-- ===========================================================================================

CREATE OR REPLACE FUNCTION public.trg_envio_cc_debito_fn()
  RETURNS trigger
  LANGUAGE plpgsql
AS $fn$
DECLARE
  v_monto        BIGINT;
  v_monto_old    BIGINT;
  v_delta        BIGINT;
  v_descripcion  TEXT;
  v_actor        UUID := '00000000-0000-4000-a000-000000000001';
  v_debito_neto  BIGINT;
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

  -- TG_OP = 'UPDATE'. Solo actuamos sobre envios cuenta_corriente. Tres casos:
  --   1) soft-delete (eliminado FALSE -> TRUE): reverso del debito neto asentado.
  --   2) cambio de costo/costo_seguro en envio vivo: ajuste por delta.
  --   3) un envio que nace eliminado o no-CC: nada que hacer.
  IF NEW.tipo_pago <> 'cuenta_corriente' THEN
    RETURN NEW;
  END IF;

  -- Debito neto realmente asentado para este envio (debito + ajustes - reversos previos).
  SELECT COALESCE(SUM(monto), 0)::BIGINT
    INTO v_debito_neto
    FROM movimientos_cuenta_corriente
   WHERE envio_id = NEW.id
     AND tipo IN ('debito', 'ajuste', 'reverso');

  -- Caso 1: soft-delete. Reversar todo el debito neto vivo. El debito vive POSITIVO en el
  -- ledger (sube deuda); el reverso debe ser NEGATIVO para neutralizarlo exactamente.
  IF NEW.eliminado = TRUE AND OLD.eliminado = FALSE THEN
    IF v_debito_neto <> 0 THEN
      PERFORM registrar_movimiento_cc(
        NEW.cliente_id, NEW.id, NULL, 'reverso', -v_debito_neto,
        'Reverso por anulacion del envio ' || NEW.tracking_number,
        v_actor, NULL, NULL, TRUE
      );
    END IF;
    RETURN NEW;
  END IF;

  -- Restauracion (eliminado TRUE -> FALSE): re-debitar el costo vigente si no quedo debito
  -- vivo. Hoy la app no expone restore de envios, pero un restore futuro o una correccion
  -- manual no debe perder la deuda en silencio.
  IF NEW.eliminado = FALSE AND OLD.eliminado = TRUE THEN
    v_monto := NEW.costo + COALESCE(NEW.costo_seguro, 0);
    -- Se re-debita como 'ajuste' (no 'debito'): el debito original sigue fisicamente en el
    -- ledger (lo neutralizo un reverso al borrar), y movcc_un_debito_por_envio impide un
    -- segundo 'debito'. Un 'ajuste' positivo restaura la deuda y cuenta en v_debito_neto.
    IF v_debito_neto = 0 AND v_monto > 0 THEN
      PERFORM registrar_movimiento_cc(
        NEW.cliente_id, NEW.id, NULL, 'ajuste', v_monto,
        'Re-debito por restauracion del envio ' || NEW.tracking_number,
        v_actor, NULL, NULL, COALESCE(NEW.bypass_limite_credito, FALSE)
      );
    END IF;
    RETURN NEW;
  END IF;

  -- Si el envio esta eliminado, no se ajustan montos (ya quedo reversado).
  IF NEW.eliminado = TRUE THEN
    RETURN NEW;
  END IF;

  -- Caso 2: cambio de costo o costo_seguro en envio CC vivo. Ajuste por delta exacto.
  v_monto     := NEW.costo + COALESCE(NEW.costo_seguro, 0);
  v_monto_old := OLD.costo + COALESCE(OLD.costo_seguro, 0);

  IF v_monto <> v_monto_old THEN
    -- Si nunca se asento debito (costo original era 0) y ahora es positivo, asentar el debito
    -- como en un INSERT; caso normal de "tasar despues".
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
      PERFORM registrar_movimiento_cc(
        NEW.cliente_id, NEW.id, NULL, 'ajuste', v_delta,
        'Ajuste de costo del envio ' || NEW.tracking_number
          || ' (' || v_debito_neto || ' -> ' || v_monto || ')',
        v_actor, NULL, NULL, TRUE
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$fn$;

-- El trigger de debito ahora cubre INSERT y los UPDATE de costo/costo_seguro/eliminado.
DROP TRIGGER IF EXISTS trg_envio_cuenta_corriente_debito ON public.envios;
CREATE TRIGGER trg_envio_cuenta_corriente_debito
  AFTER INSERT OR UPDATE OF costo, costo_seguro, eliminado ON public.envios
  FOR EACH ROW EXECUTE FUNCTION public.trg_envio_cc_debito_fn();

-- ===========================================================================================
-- CAUSA B -- Blindaje DB de la edicion de montos COD. La capa TS deja de mandar
-- costo/monto_a_cobrar/tipoPago/tarifaId por el PUT general (fix en envio.schema.ts/admin),
-- pero a nivel DB cerramos monto_a_cobrar de un envio COD que ya tiene pago activo o ya esta
-- en una liquidacion: editar el snapshot despues de cobrado poisona el cierre del repartidor.
-- (costo/costo_seguro CC quedan cubiertos por el ajuste delta de la causa A, que mantiene la
-- conservacion; monto_a_cobrar COD no tiene ledger, asi que su edicion post-cobro se bloquea.)
-- ===========================================================================================

CREATE OR REPLACE FUNCTION public.trg_envio_block_cod_monto_change_fn()
  RETURNS trigger
  LANGUAGE plpgsql
AS $fn$
BEGIN
  IF NEW.tipo_pago <> 'contra_entrega' THEN
    RETURN NEW;
  END IF;
  IF NEW.monto_a_cobrar = OLD.monto_a_cobrar THEN
    RETURN NEW;
  END IF;

  IF EXISTS (SELECT 1 FROM pagos WHERE envio_id = NEW.id AND anulado = FALSE) THEN
    RAISE EXCEPTION 'cod_monto_no_modificable: el envio ya tiene un pago COD activo, anular el pago antes de cambiar el monto a cobrar'
      USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (SELECT 1 FROM liquidacion_envios WHERE envio_id = NEW.id) THEN
    RAISE EXCEPTION 'cod_monto_no_modificable: el envio ya esta en una liquidacion, no se puede cambiar el monto a cobrar'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_envio_block_cod_monto_change ON public.envios;
CREATE TRIGGER trg_envio_block_cod_monto_change
  BEFORE UPDATE OF monto_a_cobrar ON public.envios
  FOR EACH ROW EXECUTE FUNCTION public.trg_envio_block_cod_monto_change_fn();

-- ===========================================================================================
-- CAUSA E -- update_pago_atomico topaba todo pago por costo+seguro, ignorando tipo_pago. Para
-- COD el tope correcto es monto_a_cobrar (lo que el repartidor levanta en la calle). Se
-- espeja la logica de create_pago_atomico. Ademas (CAUSA G) se agrega guard de liquidacion
-- cerrada: un envio ya conciliado en una liquidacion cerrada no admite editar su pago.
--
-- Firma verificada contra prod, se conserva intacta.
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

  -- CAUSA G: un pago cuyo envio ya fue conciliado en una liquidacion cerrada (o con
  -- diferencia) no se edita; reabrir/ajustar la liquidacion primero. Evita que la caja
  -- cerrada y el estado vivo del cobro diverjan en silencio.
  IF EXISTS (
    SELECT 1
      FROM liquidacion_envios le
      JOIN liquidaciones_repartidor l ON l.id = le.liquidacion_id
     WHERE le.envio_id = v_pago_previo.envio_id
       AND l.estado <> 'pendiente'
  ) THEN
    RAISE EXCEPTION 'pago_en_liquidacion_cerrada: el envio pertenece a una liquidacion cerrada; reabrir la liquidacion antes de editar el pago'
      USING ERRCODE = 'P0001';
  END IF;

  -- CAUSA E: tope por tipo_pago, igual que create_pago_atomico. monto_total no se confia del
  -- caller: la fuente de verdad del importe es el envio.
  SELECT tipo_pago,
         CASE
           WHEN tipo_pago = 'contra_entrega' THEN monto_a_cobrar
           ELSE (costo + COALESCE(costo_seguro, 0))
         END::BIGINT
    INTO v_tipo_pago, v_monto_real
    FROM envios
   WHERE id = v_pago_previo.envio_id;

  -- Opcion A (Paso 1): pago a cuenta corriente es inmutable. Cambiar el monto exige anular y
  -- rehacer. Editar otros campos tampoco se permite por la misma puerta.
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
-- CAUSA G (parte 2) -- anular_pago_atomico: mismo guard de liquidacion cerrada. Anular un
-- pago COD ya liquidado dejaba al repartidor liquidado por plata que el sistema marca como
-- no cobrada. Firma verificada contra prod, se conserva intacta. El reverso de credito CC se
-- conserva exactamente como en el baseline.
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

  -- CAUSA G: bloquear la anulacion si el envio ya esta conciliado en una liquidacion cerrada.
  IF EXISTS (
    SELECT 1
      FROM liquidacion_envios le
      JOIN liquidaciones_repartidor l ON l.id = le.liquidacion_id
     WHERE le.envio_id = v_pago_previo.envio_id
       AND l.estado <> 'pendiente'
  ) THEN
    RAISE EXCEPTION 'pago_en_liquidacion_cerrada: el COD ya fue liquidado al repartidor; reabrir/ajustar la liquidacion antes de anular el pago'
      USING ERRCODE = 'P0001';
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
-- CAUSA D (parte 1) -- trg_pago_sync_envio_cobrado_fn limpia cod_pago_pendiente cuando el
-- pago COD activo se asienta, y lo re-marca al anularse. La cola de reconciliacion deja de
-- mentir permanentemente. Firma de trigger conservada (AFTER INSERT OR UPDATE OF
-- monto_recibido, anulado).
-- ===========================================================================================

CREATE OR REPLACE FUNCTION public.trg_pago_sync_envio_cobrado_fn()
  RETURNS trigger
  LANGUAGE plpgsql
AS $fn$
DECLARE
  v_envio_tipo_pago TEXT;
  v_efectivo_cobrado BIGINT;
  v_pendiente BOOLEAN;
BEGIN
  SELECT tipo_pago INTO v_envio_tipo_pago
    FROM envios
   WHERE id = NEW.envio_id;

  IF v_envio_tipo_pago IS NULL OR v_envio_tipo_pago <> 'contra_entrega' THEN
    RETURN NEW;
  END IF;

  IF NEW.anulado = TRUE THEN
    -- Pago anulado: el COD vuelve a no estar cobrado y, por tanto, pendiente de reconciliar.
    v_efectivo_cobrado := 0;
    v_pendiente := TRUE;
  ELSE
    v_efectivo_cobrado := NEW.monto_recibido;
    -- Pago activo asentado: la cola deja de listarlo (independiente del monto recibido, el
    -- hecho registrado es lo que saca al envio de la cola de cobrado-sin-registrar).
    v_pendiente := FALSE;
  END IF;

  UPDATE envios
     SET monto_cobrado      = v_efectivo_cobrado,
         cod_pago_pendiente = v_pendiente
   WHERE id = NEW.envio_id;

  RETURN NEW;
END;
$fn$;

-- ===========================================================================================
-- CAUSA D (parte 2) + CAUSA H -- crear_liquidacion:
--   D2: EXCLUYE envios con cod_pago_pendiente = TRUE (cobro fallido) para que un envio cuyo
--       cobro no se asento NUNCA entre a una liquidacion hasta tener el pago real.
--   H : EXCEPTION handler que mapea exclusion_violation (23P01, doble submit concurrente) a un
--       error de negocio liquidacion_rango_solapado, en vez de 500 opaco.
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
    -- CAUSA H: dos crear_liquidacion concurrentes con rangos solapados; el EXCLUDE gist
    -- bloqueo el segundo INSERT (cero plata mal movida). Se mapea al mismo error de negocio
    -- que el pre-check, no a 500.
    RAISE EXCEPTION 'liquidacion_rango_solapado: ya existe una liquidacion del repartidor cuyo rango solapa con el solicitado'
      USING ERRCODE = 'P0001';
END;
$fn$;

COMMIT;

-- ===========================================================================================
-- ROLLBACK (ejecutar manualmente dentro de su propio BEGIN/COMMIT para revertir 034)
-- ===========================================================================================
-- BEGIN;
--   DROP TRIGGER IF EXISTS trg_movcc_append_only ON public.movimientos_cuenta_corriente;
--   DROP FUNCTION IF EXISTS public.trg_movcc_append_only_fn();
--   DROP TRIGGER IF EXISTS trg_pagos_no_delete ON public.pagos;
--   DROP FUNCTION IF EXISTS public.trg_pagos_no_delete_fn();
--   DROP TRIGGER IF EXISTS trg_envio_block_cod_monto_change ON public.envios;
--   DROP FUNCTION IF EXISTS public.trg_envio_block_cod_monto_change_fn();
--   DROP INDEX IF EXISTS public.movcc_un_credito_por_pago;
--   DROP INDEX IF EXISTS public.movcc_un_debito_por_envio;
--   ALTER TABLE public.movimientos_cuenta_corriente
--     DROP CONSTRAINT IF EXISTS movimientos_cuenta_corriente_pago_id_fkey;
--   ALTER TABLE public.movimientos_cuenta_corriente
--     ADD CONSTRAINT movimientos_cuenta_corriente_pago_id_fkey
--     FOREIGN KEY (pago_id) REFERENCES public.pagos(id) ON DELETE SET NULL;
--
--   -- Restaurar las funciones a su cuerpo baseline (Paso 1). Bodies verificados contra prod
--   -- (pg_get_functiondef) el 2026-06-17 antes de 034.
--
--   CREATE OR REPLACE FUNCTION public.trg_envio_cc_debito_fn()
--     RETURNS trigger LANGUAGE plpgsql AS $body$
--   DECLARE v_monto BIGINT; v_descripcion TEXT; v_actor UUID;
--   BEGIN
--     IF NEW.tipo_pago <> 'cuenta_corriente' OR NEW.eliminado = TRUE THEN RETURN NEW; END IF;
--     v_monto := NEW.costo + COALESCE(NEW.costo_seguro, 0);
--     IF v_monto <= 0 THEN RETURN NEW; END IF;
--     v_descripcion := 'Envio ' || NEW.tracking_number;
--     v_actor := '00000000-0000-4000-a000-000000000001';
--     PERFORM registrar_movimiento_cc(NEW.cliente_id, NEW.id, NULL, 'debito', v_monto,
--       v_descripcion, v_actor, NULL, NULL, COALESCE(NEW.bypass_limite_credito, FALSE));
--     RETURN NEW;
--   END; $body$;
--
--   DROP TRIGGER IF EXISTS trg_envio_cuenta_corriente_debito ON public.envios;
--   CREATE TRIGGER trg_envio_cuenta_corriente_debito
--     AFTER INSERT ON public.envios
--     FOR EACH ROW EXECUTE FUNCTION public.trg_envio_cc_debito_fn();
--
--   -- update_pago_atomico, anular_pago_atomico, crear_liquidacion y trg_pago_sync_envio_cobrado_fn:
--   -- restaurar el cuerpo baseline copiando el bloque CREATE OR REPLACE correspondiente desde
--   -- 000_baseline_prod_schema.sql (los cuerpos previos estan ahi, sin los guards de 034). El
--   -- diff exacto: update/anular pierden el guard pago_en_liquidacion_cerrada y el cap por
--   -- monto_a_cobrar; crear_liquidacion pierde el filtro cod_pago_pendiente=FALSE y el handler
--   -- exclusion_violation; el sync trigger pierde el manejo de cod_pago_pendiente.
--   -- El recompute de saldo es idempotente; no requiere rollback.
-- COMMIT;

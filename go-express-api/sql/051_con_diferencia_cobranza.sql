-- 051: M2 + B4 (Step6). Politica decidida por Gaston: el faltante de caja es DEUDA DEL
-- REPARTIDOR. La tienda cobra su producto completo (payout_tienda = esperado - tarifa, 041) y
-- GO EXPRESS retiene su tarifa completa; hasta hoy el faltante quedaba solo en la columna
-- derivada `diferencia`, sin asiento contable propio, y el dia que el settlement de tienda lea
-- payout_tienda ese gap se paga con plata que no entro (M2).
--
-- Fix: liquidacion_ajustes, asiento contable explicito por cierre con_diferencia.
--   - recibido < esperado -> tipo 'cobranza_repartidor', monto = esperado - recibido (cuenta
--     por cobrar al repartidor).
--   - recibido > esperado -> tipo 'sobrante_a_investigar', monto = recibido - esperado (efectivo
--     excedente sin duenio conocido, a investigar antes de asignarlo).
--
-- Conservacion total (la que el settlement debe leer): el efectivo rendido mas la cobranza al
-- repartidor menos el sobrante cubre exactamente tarifa + payout:
--     tarifa_retenida + payout_tienda + sobrante = monto_total_recibido + cobranza_repartidor
-- En faltante: tarifa + payout = recibido + cobranza (la cobranza financia el gap del payout).
-- En sobrante: tarifa + payout + sobrante = recibido (el exceso queda asentado, no se reparte).
-- cerrar_liquidacion la enforcea con un assert interno: si el asiento no cierra la ecuacion, el
-- cierre entero aborta. El CHECK 041 (tarifa + payout = esperado) sigue vigente y es coherente.
--
-- B4: el comentario de sql/041 (lineas 112-116) describe un clamp contra el efectivo real que el
-- codigo nunca tuvo. 041 ya esta aplicada: no se edita el archivo, se corrige la documentacion
-- viva via COMMENT ON FUNCTION aca.
--
-- Idempotente (guards DO $$, IF NOT EXISTS, CREATE OR REPLACE). Transaccional.
BEGIN;

DO $$
BEGIN
  CREATE TYPE public.tipo_ajuste_liquidacion AS ENUM ('cobranza_repartidor', 'sobrante_a_investigar');
EXCEPTION WHEN duplicate_object THEN
  NULL;
END;
$$;

CREATE TABLE IF NOT EXISTS public.liquidacion_ajustes (
  id                 uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  liquidacion_id     uuid NOT NULL REFERENCES public.liquidaciones_repartidor(id),
  tipo               public.tipo_ajuste_liquidacion NOT NULL,
  monto              bigint NOT NULL,
  motivo             text NOT NULL,
  creado_por         uuid NOT NULL REFERENCES public.usuarios(id),
  eliminado          boolean NOT NULL DEFAULT FALSE,
  eliminado_por      uuid REFERENCES public.usuarios(id),
  eliminado_en       timestamptz,
  motivo_eliminacion text,
  created_at         timestamptz NOT NULL DEFAULT NOW(),
  updated_at         timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT liquidacion_ajustes_monto_positivo CHECK (monto > 0)
);

COMMENT ON TABLE public.liquidacion_ajustes IS
  'Asientos contables de la diferencia de caja al cerrar una liquidacion (M2 Step6). cobranza_repartidor = faltante que el repartidor debe a GO EXPRESS (esperado - recibido). sobrante_a_investigar = efectivo excedente sin duenio conocido (recibido - esperado). Un cierre con_diferencia genera exactamente un asiento activo; reabrir la liquidacion lo anula (soft-delete) porque pertenece al cierre anterior.';
COMMENT ON COLUMN public.liquidacion_ajustes.monto IS
  'BIGINT Gs, siempre positivo. El signo lo da el tipo: cobranza_repartidor suma como cuenta por cobrar, sobrante_a_investigar resta del efectivo repartible.';

CREATE INDEX IF NOT EXISTS idx_liquidacion_ajustes_liquidacion
  ON public.liquidacion_ajustes (liquidacion_id) WHERE eliminado = FALSE;
CREATE INDEX IF NOT EXISTS idx_liquidacion_ajustes_creado_por
  ON public.liquidacion_ajustes (creado_por);
CREATE INDEX IF NOT EXISTS idx_liquidacion_ajustes_tipo
  ON public.liquidacion_ajustes (tipo) WHERE eliminado = FALSE;

DROP TRIGGER IF EXISTS trg_liquidacion_ajustes_updated_at ON public.liquidacion_ajustes;
CREATE TRIGGER trg_liquidacion_ajustes_updated_at
  BEFORE UPDATE ON public.liquidacion_ajustes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- La tabla nace sin escritura directa desde los roles de request: los asientos los generan las
-- RPCs (SECURITY DEFINER). Lectura si (el service la expone en el detalle de liquidacion).
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.liquidacion_ajustes FROM anon, authenticated, service_role;
GRANT SELECT ON public.liquidacion_ajustes TO service_role;

-- cerrar_liquidacion: cuerpo 048 (orden de lock E -> L) + asiento contable de la diferencia +
-- assert de conservacion total.
CREATE OR REPLACE FUNCTION public.cerrar_liquidacion(p_liquidacion_id uuid, p_monto_recibido bigint, p_notas text, p_cerrado_por uuid, p_usuario_nombre text, p_ip inet, p_user_agent text)
 RETURNS liquidaciones_repartidor
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_snap           liquidaciones_repartidor;
  v_previa         liquidaciones_repartidor;
  v_actual         liquidaciones_repartidor;
  v_estado         estado_liquidacion;
  v_esperado       BIGINT := 0;
  v_tarifa         BIGINT := 0;
  v_payout         BIGINT := 0;
  v_diferencia     BIGINT;
  v_cobranza       BIGINT := 0;
  v_sobrante       BIGINT := 0;
  v_descripcion    TEXT;
BEGIN
  IF p_monto_recibido < 0 THEN
    RAISE EXCEPTION 'monto_invalido: monto_recibido debe ser >= 0'
      USING ERRCODE = 'P0001';
  END IF;

  -- Snapshot del header SIN lock: solo para armar el predicado del set elegible. El lock del
  -- header va DESPUES de los envios (orden canonico E -> L, alineado con las RPCs de pago, 048).
  SELECT * INTO v_snap
    FROM liquidaciones_repartidor
   WHERE id = p_liquidacion_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'liquidacion_no_encontrada: %', p_liquidacion_id
      USING ERRCODE = 'P0001';
  END IF;

  IF v_snap.estado <> 'pendiente' THEN
    RAISE EXCEPTION 'liquidacion_ya_cerrada: %', p_liquidacion_id
      USING ERRCODE = 'P0001';
  END IF;

  -- E: lockear el set elegible vigente (mismo predicado que crear_liquidacion).
  DROP TABLE IF EXISTS tmp_elegibles;
  CREATE TEMP TABLE tmp_elegibles ON COMMIT DROP AS
  SELECT e.id AS envio_id,
         e.monto_a_cobrar AS monto_esperado,
         COALESCE(e.monto_cobrado, 0) AS monto_cobrado,
         (e.costo + COALESCE(e.costo_seguro, 0))::BIGINT AS tarifa
    FROM envios e
   WHERE e.repartidor_id = v_snap.repartidor_id
     AND e.estado = 'entregado'
     AND e.tipo_pago IN ('anticipado', 'contra_entrega')
     AND e.eliminado = FALSE
     AND e.fecha_entrega_real IS NOT NULL
     AND (e.fecha_entrega_real AT TIME ZONE 'America/Asuncion')::date
         BETWEEN v_snap.fecha_desde AND v_snap.fecha_hasta
     AND EXISTS (
       SELECT 1 FROM pagos p
        WHERE p.envio_id = e.id
          AND p.anulado = FALSE
          AND p.estado_pago = 'pagado'
     )
     AND NOT EXISTS (
       SELECT 1 FROM liquidacion_envios le
        WHERE le.envio_id = e.id
          AND le.conciliado = TRUE
          AND le.liquidacion_id <> p_liquidacion_id
     )
   ORDER BY e.id
   FOR UPDATE OF e;

  -- L: lock del header DESPUES de los envios; re-validar contra el snapshot (048). Si el header
  -- cambio entre snapshot y lock, abortar con 40001 para que el retry del caller re-ejecute.
  SELECT * INTO v_previa
    FROM liquidaciones_repartidor
   WHERE id = p_liquidacion_id
   FOR UPDATE;

  IF v_previa.estado <> 'pendiente' THEN
    RAISE EXCEPTION 'liquidacion_ya_cerrada: %', p_liquidacion_id
      USING ERRCODE = 'P0001';
  END IF;

  IF v_previa.repartidor_id IS DISTINCT FROM v_snap.repartidor_id
     OR v_previa.fecha_desde IS DISTINCT FROM v_snap.fecha_desde
     OR v_previa.fecha_hasta IS DISTINCT FROM v_snap.fecha_hasta THEN
    RAISE EXCEPTION 'liquidacion_snapshot_stale: el header % cambio durante el cierre, reintentar', p_liquidacion_id
      USING ERRCODE = '40001';
  END IF;

  -- DELETE las filas de ESTA liq que ya no califican (cobro anulado tras crear, etc).
  DELETE FROM liquidacion_envios le
   WHERE le.liquidacion_id = p_liquidacion_id
     AND NOT EXISTS (
       SELECT 1 FROM tmp_elegibles t WHERE t.envio_id = le.envio_id
     );

  -- UPSERT las que ahora califican; re-snapshot de monto_esperado y monto_cobrado reales.
  INSERT INTO liquidacion_envios (liquidacion_id, envio_id, monto_esperado, monto_cobrado, conciliado)
  SELECT p_liquidacion_id, t.envio_id, t.monto_esperado, t.monto_cobrado, FALSE
    FROM tmp_elegibles t
  ON CONFLICT (liquidacion_id, envio_id)
  DO UPDATE SET monto_esperado = EXCLUDED.monto_esperado,
                monto_cobrado  = EXCLUDED.monto_cobrado;

  -- Recompute sobre el set vigente. tarifa_retenida = SUM(costo+seguro).
  SELECT COALESCE(SUM(monto_esperado), 0)::BIGINT,
         COALESCE(SUM(tarifa), 0)::BIGINT
    INTO v_esperado, v_tarifa
    FROM tmp_elegibles;

  v_diferencia := p_monto_recibido - v_esperado;

  -- 041: la tienda cobra su payout completo en ambas ramas; el faltante es del repartidor.
  v_payout := v_esperado - v_tarifa;

  IF v_diferencia = 0 THEN
    v_estado := 'cerrada';
  ELSE
    v_estado := 'con_diferencia';
    IF p_notas IS NULL OR length(trim(p_notas)) < 10 THEN
      RAISE EXCEPTION 'notas_requeridas: cerrar con diferencia requiere notas de al menos 10 caracteres'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  UPDATE liquidaciones_repartidor
     SET monto_total_esperado = v_esperado,
         monto_total_recibido = p_monto_recibido,
         tarifa_retenida      = v_tarifa,
         payout_tienda        = v_payout,
         estado               = v_estado,
         cerrada_por          = p_cerrado_por,
         cerrada_en           = NOW(),
         notas                = p_notas,
         updated_at           = NOW()
   WHERE id = p_liquidacion_id
  RETURNING * INTO v_actual;

  -- M2: asiento contable de la diferencia. Faltante = deuda del repartidor (cuenta por cobrar);
  -- sobrante = efectivo sin duenio, a investigar. Exactamente un asiento activo por cierre.
  IF v_diferencia < 0 THEN
    v_cobranza := -v_diferencia;
    INSERT INTO liquidacion_ajustes (liquidacion_id, tipo, monto, motivo, creado_por)
    VALUES (
      p_liquidacion_id, 'cobranza_repartidor', v_cobranza,
      format('Faltante de caja al cerrar: esperado %s Gs, recibido %s Gs. Deuda del repartidor. Notas del cierre: %s',
             v_esperado, p_monto_recibido, p_notas),
      p_cerrado_por
    );
  ELSIF v_diferencia > 0 THEN
    v_sobrante := v_diferencia;
    INSERT INTO liquidacion_ajustes (liquidacion_id, tipo, monto, motivo, creado_por)
    VALUES (
      p_liquidacion_id, 'sobrante_a_investigar', v_sobrante,
      format('Sobrante de caja al cerrar: esperado %s Gs, recibido %s Gs. Investigar origen antes de asignar. Notas del cierre: %s',
             v_esperado, p_monto_recibido, p_notas),
      p_cerrado_por
    );
  END IF;

  -- Conservacion total (M2): tarifa + payout + sobrante = recibido + cobranza, SIEMPRE. Si el
  -- asiento no cierra la ecuacion el cierre entero aborta: mejor un 500 que un ledger que no
  -- cuadra al guarani.
  IF v_tarifa + v_payout + v_sobrante <> p_monto_recibido + v_cobranza THEN
    RAISE EXCEPTION 'conservacion_rota: tarifa % + payout % + sobrante % <> recibido % + cobranza %',
      v_tarifa, v_payout, v_sobrante, p_monto_recibido, v_cobranza
      USING ERRCODE = 'P0001';
  END IF;

  -- RECIEN AHI sella: conciliado=TRUE sobre el set vigente (re-validado contra cobro real).
  UPDATE liquidacion_envios
     SET conciliado = TRUE
   WHERE liquidacion_id = p_liquidacion_id;

  v_descripcion := format(
    'Liquidacion cerrada: esperado %s Gs, recibido %s Gs, tarifa %s Gs, payout %s Gs, diferencia %s (%s)',
    v_esperado, p_monto_recibido, v_tarifa, v_payout, v_diferencia, v_estado
  );

  INSERT INTO auditoria_log (
    usuario, usuario_id, accion, entidad, entidad_id,
    descripcion, valor_anterior, valor_nuevo, ip_address, user_agent
  ) VALUES (
    p_usuario_nombre, p_cerrado_por, 'editar', 'liquidacion', v_actual.id::TEXT,
    v_descripcion, to_jsonb(v_previa), to_jsonb(v_actual), p_ip, p_user_agent
  );

  RETURN v_actual;
END;
$function$;

-- B4: documentacion viva correcta de la politica de conservacion (el comentario inline de
-- sql/041 describia un clamp contra efectivo real que el codigo nunca tuvo; 041 ya esta
-- aplicada y no se edita, la fuente de verdad es este COMMENT).
COMMENT ON FUNCTION public.cerrar_liquidacion(uuid, bigint, text, uuid, text, inet, text) IS
  'Cierra la liquidacion sobre el set elegible vigente, orden de lock E -> L (048). Politica de diferencia (M2, decision Gaston): la tienda cobra su payout completo (payout_tienda = esperado - tarifa, SIN clamp contra el efectivo); el faltante (esperado - recibido) se asienta en liquidacion_ajustes como cobranza_repartidor (deuda del repartidor) y el sobrante como sobrante_a_investigar. Conservacion total: tarifa_retenida + payout_tienda + sobrante = monto_total_recibido + cobranza_repartidor, verificada con assert interno en cada cierre. CHECK complementario 041: tarifa_retenida + payout_tienda = monto_total_esperado.';

-- reabrir_liquidacion: cuerpo 040 + anulacion (soft-delete) de los asientos del cierre que se
-- des-sella. El asiento pertenece a ESE cierre; el re-cierre genera el suyo si corresponde.
CREATE OR REPLACE FUNCTION public.reabrir_liquidacion(p_liquidacion_id uuid, p_motivo text, p_actor uuid, p_usuario_nombre text, p_ip inet, p_user_agent text)
 RETURNS liquidaciones_repartidor
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- Habilita la unica via legitima de nular el sello (040). El flag es transaccion-local.
  PERFORM set_config('app.reabrir_rpc', '1', true);

  -- Vuelta a pendiente. Los campos de cierre + montos finales VUELVEN a NULL: el re-cierre los
  -- reconstruye desde el set vigente. monto_total_esperado queda como estaba: cerrar lo
  -- sobrescribe; no se nulea porque el CHECK no lo exige y no se lee en pendiente.
  UPDATE liquidaciones_repartidor
     SET estado               = 'pendiente',
         cerrada_por          = NULL,
         cerrada_en           = NULL,
         monto_total_recibido = NULL,
         tarifa_retenida      = NULL,
         payout_tienda        = NULL,
         notas                = NULL,
         updated_at           = NOW()
   WHERE id = p_liquidacion_id
  RETURNING * INTO v_actual;

  -- Cierra el flag apenas pasa el UPDATE legitimo: ningun statement posterior puede reabrir.
  PERFORM set_config('app.reabrir_rpc', '0', true);

  -- Des-conciliar: update/anular_pago vuelven a permitir correccion y el envio queda elegible
  -- para re-snapshot al cerrar de nuevo.
  UPDATE liquidacion_envios
     SET conciliado = FALSE
   WHERE liquidacion_id = p_liquidacion_id;

  -- M2: los asientos del cierre que se des-sella quedan anulados (soft-delete, jamas DELETE):
  -- documentaban ESE cierre. Si el re-cierre vuelve a dar diferencia, genera asientos nuevos.
  UPDATE liquidacion_ajustes
     SET eliminado          = TRUE,
         eliminado_por      = p_actor,
         eliminado_en       = NOW(),
         motivo_eliminacion = format('Liquidacion reabierta: el asiento pertenece al cierre anterior. Motivo de reapertura: %s', p_motivo)
   WHERE liquidacion_id = p_liquidacion_id
     AND eliminado = FALSE;

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
$function$;

COMMIT;
-- ROLLBACK: re-aplicar sql/048 (cerrar sin asientos) y la definicion 040 de reabrir_liquidacion
-- (sin la anulacion de asientos); DROP TABLE liquidacion_ajustes y DROP TYPE
-- tipo_ajuste_liquidacion solo si se decide descartar el historial contable.

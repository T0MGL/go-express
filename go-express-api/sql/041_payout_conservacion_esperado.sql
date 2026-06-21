-- 041: cierra el ALTA "liquidacion con faltante no se puede cerrar".
-- cerrar_liquidacion: payout_tienda = esperado - tarifa en AMBAS ramas (cerrada y con_diferencia).
-- La tienda cobra su valor de producto completo; el faltante del repartidor (esperado - recibido)
-- queda como diferencia a reclamarle al repartidor, NO lo absorbe la tienda ni rompe el cierre.
-- CHECK de conservacion contra ESPERADO (no recibido): tarifa + payout = esperado, siempre cumple
-- por I1 (monto_a_cobrar >= costo+seguro => payout >= 0). Idempotente.
BEGIN;
ALTER TABLE public.liquidaciones_repartidor DROP CONSTRAINT IF EXISTS liquidacion_payout_conservacion;
ALTER TABLE public.liquidaciones_repartidor ADD CONSTRAINT liquidacion_payout_conservacion
  CHECK (estado = 'pendiente' OR (tarifa_retenida IS NOT NULL AND payout_tienda IS NOT NULL AND (tarifa_retenida + payout_tienda) = monto_total_esperado));
CREATE OR REPLACE FUNCTION public.cerrar_liquidacion(p_liquidacion_id uuid, p_monto_recibido bigint, p_notas text, p_cerrado_por uuid, p_usuario_nombre text, p_ip inet, p_user_agent text)
 RETURNS liquidaciones_repartidor
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_previa         liquidaciones_repartidor;
  v_actual         liquidaciones_repartidor;
  v_estado         estado_liquidacion;
  v_esperado       BIGINT := 0;
  v_tarifa         BIGINT := 0;
  v_payout         BIGINT := 0;
  v_diferencia     BIGINT;
  v_descripcion    TEXT;
BEGIN
  IF p_monto_recibido < 0 THEN
    RAISE EXCEPTION 'monto_invalido: monto_recibido debe ser >= 0'
      USING ERRCODE = 'P0001';
  END IF;

  -- L: lock de la liquidacion.
  SELECT * INTO v_previa
    FROM liquidaciones_repartidor
   WHERE id = p_liquidacion_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'liquidacion_no_encontrada: %', p_liquidacion_id
      USING ERRCODE = 'P0001';
  END IF;

  IF v_previa.estado <> 'pendiente' THEN
    RAISE EXCEPTION 'liquidacion_ya_cerrada: %', p_liquidacion_id
      USING ERRCODE = 'P0001';
  END IF;

  -- E: lockear bajo el set elegible vigente (mismo predicado que 4.1). Materializa los envio_id
  -- ELEGIBLES de ESTE rango/repartidor que NO esten conciliados en OTRA liquidacion.
  DROP TABLE IF EXISTS tmp_elegibles;
  CREATE TEMP TABLE tmp_elegibles ON COMMIT DROP AS
  SELECT e.id AS envio_id,
         e.monto_a_cobrar AS monto_esperado,
         COALESCE(e.monto_cobrado, 0) AS monto_cobrado,
         (e.costo + COALESCE(e.costo_seguro, 0))::BIGINT AS tarifa
    FROM envios e
   WHERE e.repartidor_id = v_previa.repartidor_id
     AND e.estado = 'entregado'
     AND e.tipo_pago IN ('anticipado', 'contra_entrega')
     AND e.eliminado = FALSE
     AND e.fecha_entrega_real IS NOT NULL
     AND (e.fecha_entrega_real AT TIME ZONE 'America/Asuncion')::date
         BETWEEN v_previa.fecha_desde AND v_previa.fecha_hasta
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

  IF v_diferencia = 0 THEN
    v_estado := 'cerrada';
    -- Sin diferencia: payout = esperado - tarifa = recibido - tarifa. Conservacion exacta.
    v_payout := v_esperado - v_tarifa;
  ELSE
    v_estado := 'con_diferencia';
    IF p_notas IS NULL OR length(trim(p_notas)) < 10 THEN
      RAISE EXCEPTION 'notas_requeridas: cerrar con diferencia requiere notas de al menos 10 caracteres'
        USING ERRCODE = 'P0001';
    END IF;
    -- Con diferencia: el payout sale del EFECTIVO REAL rendido, no del esperado. La tienda no
    -- absorbe el faltante del repartidor por sobre-pago. Clamp a 0 si lo rendido no cubre la
    -- tarifa GO EXPRESS (el faltante queda como diferencia a reclamar al repartidor, no como payout
    -- negativo a la tienda). Conservacion: tarifa_retenida + payout_tienda = monto_total_recibido.
    v_payout := v_esperado - v_tarifa;  -- 041: store cobra payout completo; faltante del repartidor = diferencia, no lo absorbe la tienda
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
COMMIT;
-- ROLLBACK: restaurar CHECK contra monto_total_recibido y el clamp GREATEST(p_monto_recibido - v_tarifa, 0).

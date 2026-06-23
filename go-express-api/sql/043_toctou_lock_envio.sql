-- 043: cierra TOCTOU C1+C2 (cerrar-vs-anular concurrente). El lock de liquidacion via detalle no
-- protege cuando el detalle aun no existe; se agrega lock del envio (recurso comun, siempre existe)
-- ANTES del guard, mismo orden que crear/cerrar_liquidacion (FOR UPDATE OF e). Idempotente.
BEGIN;

CREATE OR REPLACE FUNCTION public.anular_pago_atomico(p_pago_id uuid, p_motivo text, p_anulado_por uuid, p_usuario_nombre text, p_ip inet, p_user_agent text)
 RETURNS pagos
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pago_previo   pagos;
  v_pago_actual   pagos;
  v_descripcion   TEXT;
BEGIN
  PERFORM set_config('app.pago_rpc', '1', true);

  IF p_motivo IS NULL OR length(p_motivo) < 10 THEN
    RAISE EXCEPTION 'motivo_insuficiente: el motivo debe tener al menos 10 caracteres'
      USING ERRCODE = 'P0001';
  END IF;

  -- P: lock del pago.
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

  PERFORM 1 FROM envios WHERE id = v_pago_previo.envio_id FOR UPDATE;  -- E: lock del envio (recurso comun) ANTES del guard; serializa contra crear/cerrar_liquidacion aunque el detalle aun no exista (cierra TOCTOU C1/C2)
  -- L: lock de liquidacion en orden canonico antes de leer estado.
  PERFORM 1
     FROM liquidacion_envios le
     JOIN liquidaciones_repartidor l ON l.id = le.liquidacion_id
    WHERE le.envio_id = v_pago_previo.envio_id
    FOR UPDATE OF l;

  -- 4.4: ambos estados settled bloquean.
  IF EXISTS (
    SELECT 1
      FROM liquidacion_envios le
      JOIN liquidaciones_repartidor l ON l.id = le.liquidacion_id
     WHERE le.envio_id = v_pago_previo.envio_id
       AND l.estado IN ('cerrada', 'con_diferencia')
  ) THEN
    RAISE EXCEPTION 'pago_en_liquidacion_cerrada: el COD ya fue liquidado al repartidor; reabrir la liquidacion antes de anular el pago'
      USING ERRCODE = 'P0001';
  END IF;

  -- E: lock del envio antes de que el sync trigger mute su cobro.
  PERFORM 1 FROM envios WHERE id = v_pago_previo.envio_id FOR UPDATE;

  UPDATE pagos
     SET anulado          = TRUE,
         anulado_por      = p_anulado_por,
         anulado_en       = NOW(),
         motivo_anulacion = p_motivo,
         updated_at       = NOW()
   WHERE id = p_pago_id
  RETURNING * INTO v_pago_actual;

  -- Cierra el flag apenas pasa el UPDATE legitimo.
  PERFORM set_config('app.pago_rpc', '0', true);

  v_descripcion := format('Pago %s anulado. Motivo: %s', p_pago_id, p_motivo);

  INSERT INTO auditoria_log (
    usuario, usuario_id, accion, entidad, entidad_id,
    descripcion, valor_anterior, valor_nuevo, ip_address, user_agent
  ) VALUES (
    p_usuario_nombre, p_anulado_por, 'anular', 'pago', v_pago_actual.id::TEXT,
    v_descripcion, to_jsonb(v_pago_previo), to_jsonb(v_pago_actual), p_ip, p_user_agent
  );

  RETURN v_pago_actual;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_pago_atomico(p_pago_id uuid, p_monto_recibido bigint, p_metodo_pago metodo_pago, p_fecha_pago date, p_referencia text, p_notas text, p_apply_metodo boolean, p_apply_fecha boolean, p_apply_referencia boolean, p_apply_notas boolean, p_actualizado_por uuid, p_usuario_nombre text, p_ip inet, p_user_agent text)
 RETURNS pagos
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pago_previo  pagos;
  v_pago_actual  pagos;
  v_estado       estado_pago;
  v_tipo_pago    tipo_pago;
  v_monto_real   BIGINT;
  v_descripcion  TEXT;
BEGIN
  PERFORM set_config('app.pago_rpc', '1', true);

  -- P: lock del pago.
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

  PERFORM 1 FROM envios WHERE id = v_pago_previo.envio_id FOR UPDATE;  -- E: lock del envio (recurso comun) ANTES del guard; serializa contra crear/cerrar_liquidacion aunque el detalle aun no exista (cierra TOCTOU C1/C2)
  -- L: lock de la liquidacion del envio en el orden canonico antes de leer su estado.
  PERFORM 1
     FROM liquidacion_envios le
     JOIN liquidaciones_repartidor l ON l.id = le.liquidacion_id
    WHERE le.envio_id = v_pago_previo.envio_id
    FOR UPDATE OF l;

  -- 4.4: ambos estados settled bloquean. La correccion pasa por reabrir_liquidacion.
  IF EXISTS (
    SELECT 1
      FROM liquidacion_envios le
      JOIN liquidaciones_repartidor l ON l.id = le.liquidacion_id
     WHERE le.envio_id = v_pago_previo.envio_id
       AND l.estado IN ('cerrada', 'con_diferencia')
  ) THEN
    RAISE EXCEPTION 'pago_en_liquidacion_cerrada: el envio pertenece a una liquidacion sellada; reabrir la liquidacion antes de editar el pago'
      USING ERRCODE = 'P0001';
  END IF;

  -- E: lock del envio. Importe segun modo (COD = monto_a_cobrar; anticipado = costo+seguro).
  SELECT tipo_pago,
         CASE
           WHEN tipo_pago = 'contra_entrega' THEN monto_a_cobrar
           ELSE (costo + COALESCE(costo_seguro, 0))
         END::BIGINT
    INTO v_tipo_pago, v_monto_real
    FROM envios
   WHERE id = v_pago_previo.envio_id
   FOR UPDATE;

  IF p_monto_recibido < 0 THEN
    RAISE EXCEPTION 'pago_monto_recibido_invalido: monto_recibido debe ser >= 0'
      USING ERRCODE = 'P0001';
  END IF;

  -- Tope (I7).
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
         -- Re-sync del total al importe real del envio cuando difiere (MEDIA 8): evita quedar
         -- 'pagado' con un monto_total stale que no refleja el envio. Si no hay importe real
         -- legible, conserva el previo.
         monto_total    = COALESCE(v_monto_real, monto_total),
         estado_pago    = v_estado,
         metodo_pago    = CASE WHEN p_apply_metodo     THEN p_metodo_pago ELSE metodo_pago END,
         fecha_pago     = CASE WHEN p_apply_fecha      THEN p_fecha_pago   ELSE fecha_pago  END,
         referencia     = CASE WHEN p_apply_referencia THEN p_referencia   ELSE referencia  END,
         notas          = CASE WHEN p_apply_notas      THEN p_notas        ELSE notas       END,
         updated_at     = NOW()
   WHERE id = p_pago_id
  RETURNING * INTO v_pago_actual;

  -- Cierra el flag apenas pasa el UPDATE legitimo: ningun statement posterior puede mutar pagos.
  PERFORM set_config('app.pago_rpc', '0', true);

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
$function$;

COMMIT;
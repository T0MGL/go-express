-- 045: A1. Cuando el admin marca un envio como 'entregado' via update_envio_estado_atomico, la
-- funcion NO seteaba fecha_entrega_real. El COD se cobra pero crear_liquidacion gatea por
-- (fecha_entrega_real IS NOT NULL AND (fecha_entrega_real AT TIME ZONE 'America/Asuncion')::date
-- BETWEEN rango), asi que el envio queda fuera de TODA liquidacion para siempre (viola I5: plata
-- de tercero retenida sin traza). El flujo del repartidor (repartidor/envios.ts:277) si setea
-- fecha_entrega_real al entregar; el path admin atomico era el unico que la dejaba NULL.
-- Fix: en el mismo UPDATE bajo lock OCC, setear fecha_entrega_real = NOW() al transicionar a
-- 'entregado' si esta NULL, espejando el patron de recolectado_en. Idempotente (si ya tiene fecha
-- no la pisa). Recrea la funcion viva byte a byte agregando solo ese CASE.
BEGIN;
CREATE OR REPLACE FUNCTION public.update_envio_estado_atomico(p_envio_id uuid, p_nuevo_estado envio_estado, p_descripcion text, p_ubicacion text, p_problema_descr text, p_repartidor_id uuid, p_apply_repartidor boolean, p_actor_id uuid, p_actor_nombre text, p_audit_actor_id uuid, p_extra_descr text, p_ip inet, p_user_agent text)
 RETURNS envios
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_envio_previo  envios;
  v_envio_actual  envios;
  v_allowed       envio_estado[];
  v_descripcion_audit TEXT;
BEGIN
  IF p_descripcion IS NULL OR length(p_descripcion) = 0 THEN
    RAISE EXCEPTION 'descripcion_requerida: la descripcion no puede ser vacia'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_envio_previo
    FROM envios
   WHERE id = p_envio_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'envio_no_encontrado: %', p_envio_id
      USING ERRCODE = 'P0001';
  END IF;

  IF v_envio_previo.eliminado THEN
    RAISE EXCEPTION 'envio_eliminado: % esta eliminado, no se puede modificar', v_envio_previo.tracking_number
      USING ERRCODE = 'P0001';
  END IF;

  v_allowed := CASE v_envio_previo.estado
    WHEN 'pendiente'    THEN ARRAY['recolectado', 'problema']::envio_estado[]
    WHEN 'recolectado'  THEN ARRAY['en_transito', 'problema']::envio_estado[]
    WHEN 'en_transito'  THEN ARRAY['en_deposito', 'en_reparto', 'problema']::envio_estado[]
    WHEN 'en_deposito'  THEN ARRAY['en_reparto', 'problema']::envio_estado[]
    WHEN 'en_reparto'   THEN ARRAY['entregado', 'fallido', 'problema']::envio_estado[]
    WHEN 'fallido'      THEN ARRAY['en_reparto', 'problema']::envio_estado[]
    WHEN 'entregado'    THEN ARRAY[]::envio_estado[]
    WHEN 'problema'     THEN ARRAY['pendiente', 'recolectado', 'en_transito', 'en_deposito', 'en_reparto', 'fallido']::envio_estado[]
    ELSE ARRAY[]::envio_estado[]
  END;

  IF NOT (p_nuevo_estado = ANY(v_allowed)) THEN
    RAISE EXCEPTION 'transicion_invalida: % a % no es una transicion valida desde % (allowed: %)',
      v_envio_previo.estado, p_nuevo_estado, v_envio_previo.tracking_number, v_allowed
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE envios
     SET estado                  = p_nuevo_estado,
         problema_descripcion    = CASE
           WHEN p_nuevo_estado = 'problema' THEN p_problema_descr
           WHEN v_envio_previo.estado = 'problema' AND p_nuevo_estado <> 'problema' THEN NULL
           ELSE problema_descripcion
         END,
         problema_fecha          = CASE
           WHEN p_nuevo_estado = 'problema' THEN NOW()
           WHEN v_envio_previo.estado = 'problema' AND p_nuevo_estado <> 'problema' THEN NULL
           ELSE problema_fecha
         END,
         repartidor_id           = CASE
           WHEN p_apply_repartidor THEN p_repartidor_id
           ELSE repartidor_id
         END,
         repartidor_asignado_en  = CASE
           WHEN p_apply_repartidor AND p_repartidor_id IS NOT NULL THEN NOW()
           ELSE repartidor_asignado_en
         END,
         recolectado_en          = CASE
           WHEN p_nuevo_estado = 'recolectado' AND v_envio_previo.recolectado_en IS NULL THEN NOW()
           ELSE recolectado_en
         END,
         -- A1: marcar entregado por admin debe sellar la fecha de entrega, igual que el flujo
         -- del repartidor. Sin esto el envio entregado nunca entra a una liquidacion.
         fecha_entrega_real      = CASE
           WHEN p_nuevo_estado = 'entregado' AND v_envio_previo.fecha_entrega_real IS NULL THEN NOW()
           ELSE fecha_entrega_real
         END,
         updated_at              = NOW()
   WHERE id = p_envio_id
  RETURNING * INTO v_envio_actual;

  INSERT INTO eventos_envio (envio_id, estado, descripcion, ubicacion, registrado_por_nombre)
  VALUES (p_envio_id, p_nuevo_estado, p_descripcion, p_ubicacion, p_actor_nombre);

  v_descripcion_audit := format(
    'Envio %s: "%s" a "%s". %s%s',
    v_envio_actual.tracking_number,
    v_envio_previo.estado,
    p_nuevo_estado,
    p_descripcion,
    CASE WHEN p_extra_descr IS NOT NULL THEN ' ' || p_extra_descr ELSE '' END
  );

  INSERT INTO auditoria_log (
    usuario, usuario_id, accion, entidad, entidad_id,
    descripcion, valor_anterior, valor_nuevo, ip_address, user_agent
  ) VALUES (
    p_actor_nombre, p_audit_actor_id, 'cambio_estado', 'envio', p_envio_id::TEXT,
    v_descripcion_audit,
    jsonb_build_object('estado', v_envio_previo.estado, 'repartidor_id', v_envio_previo.repartidor_id),
    jsonb_build_object('estado', v_envio_actual.estado, 'repartidor_id', v_envio_actual.repartidor_id),
    p_ip, p_user_agent
  );

  RETURN v_envio_actual;
END;
$function$;
COMMIT;
-- ROLLBACK: re-aplicar 030_envio_estado_atomico.sql (definicion previa de
-- update_envio_estado_atomico sin el CASE de fecha_entrega_real), o restaurar desde el
-- baseline 000 anterior a 045. La funcion es la unica entidad tocada por esta migracion.

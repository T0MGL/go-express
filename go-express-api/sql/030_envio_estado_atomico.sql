-- 030_envio_estado_atomico.sql
-- RPC atomico para transiciones de estado de envio. Cierra el ultimo gap de race
-- conditions identificado antes del go-live con clientes 100 envios/dia.
--
-- Problema previo:
--   * envio.service.ts.updateEstado hacia un UPDATE con eq('estado', previousEstado)
--     que es OCC correcto, pero los INSERT en eventos_envio y auditoria_log corrian
--     fuera de la transaccion. Si falla el insert de eventos, queda el estado nuevo
--     sin entrada en el timeline ni en el log forense.
--   * Las rutas /api/repartidor/mis-envios/:id/{recolectado,entregado,almacen} y
--     warehouse.service.{despacho,devolucion} hacian UPDATE sin OCC. Dos taps
--     simultaneos del mismo repartidor (red intermitente -> doble tap), o repartidor
--     marcando entregado mientras admin marca problema, podian pisar estados.
--
-- Modelo:
--   * Funcion publica update_envio_estado_atomico ejecuta SELECT FOR UPDATE sobre
--     el envio, valida la transicion contra una matriz hardcodeada que matchea la
--     de TS, ejecuta UPDATE + INSERT eventos_envio + INSERT auditoria_log en una
--     unica transaccion plpgsql. Si cualquiera falla, todo se rollbackea.
--   * Errores estables (SQLSTATE 'P0001') que el TS service mapea a AppError:
--       envio_no_encontrado          -> 404 NOT_FOUND
--       envio_eliminado              -> 400 BAD_REQUEST
--       transicion_invalida          -> 422 UNPROCESSABLE_ENTITY
--       estado_modificado            -> 409 CONFLICT (concurrent transition perdio el race)
--   * SECURITY DEFINER porque auditoria_log REVOKE INSERT de roles publicos. El
--     service_role bypassea RLS, pero el SECURITY DEFINER mantiene el comportamiento
--     si en el futuro se invoca desde otro rol.
--
-- Backwards compatible: la funcion previa (sin RPC) sigue funcionando en TS para
-- otros code paths que aun no fueron migrados. La migracion solo agrega la funcion.

CREATE OR REPLACE FUNCTION update_envio_estado_atomico(
  p_envio_id        UUID,
  p_nuevo_estado    envio_estado,
  p_descripcion     TEXT,
  p_ubicacion       TEXT,
  p_problema_descr  TEXT,
  p_repartidor_id   UUID,
  p_apply_repartidor BOOLEAN,
  p_actor_id        UUID,
  p_actor_nombre    TEXT,
  p_audit_actor_id  UUID,
  p_extra_descr     TEXT,
  p_ip              INET,
  p_user_agent      TEXT
)
RETURNS envios
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
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

  -- Matriz de transiciones validas. Mantener sincronizada con VALID_TRANSITIONS en
  -- src/services/envio.service.ts. Si una se actualiza la otra debe seguir.
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

  -- UPDATE atomico. La columna estado se setea, los campos opcionales (problema_*,
  -- repartidor_id) solo se aplican cuando corresponden.
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
         updated_at              = NOW()
   WHERE id = p_envio_id
  RETURNING * INTO v_envio_actual;

  -- Insert en eventos_envio en la misma transaccion. Si falla, rollback de todo.
  INSERT INTO eventos_envio (envio_id, estado, descripcion, ubicacion, registrado_por_nombre)
  VALUES (p_envio_id, p_nuevo_estado, p_descripcion, p_ubicacion, p_actor_nombre);

  -- Insert en auditoria_log en la misma transaccion. usuario_id requiere FK a usuarios,
  -- por eso recibimos p_audit_actor_id que el caller resuelve (admin -> userId, repartidor
  -- -> SISTEMA_USER_ID porque repartidores no son usuarios).
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
$$;

COMMENT ON FUNCTION update_envio_estado_atomico IS
  'Transiciona el estado de un envio bajo SELECT FOR UPDATE, valida la transicion contra la matriz hardcodeada (sincronizada con TS), inserta eventos_envio y auditoria_log en la misma transaccion. Errores estables: envio_no_encontrado, envio_eliminado, transicion_invalida.';

REVOKE ALL ON FUNCTION update_envio_estado_atomico(
  UUID, envio_estado, TEXT, TEXT, TEXT, UUID, BOOLEAN, UUID, TEXT, UUID, TEXT, INET, TEXT
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION update_envio_estado_atomico(
  UUID, envio_estado, TEXT, TEXT, TEXT, UUID, BOOLEAN, UUID, TEXT, UUID, TEXT, INET, TEXT
) TO service_role;

-- Indexes adicionales para queries calientes del driver portal y dashboards.
-- 100 envios/dia/cliente x 5+ clientes potenciales = volumen manejable, pero los
-- indexes parciales reducen el costo de cada GET de mis-envios y el dashboard admin.

-- Driver portal mis-envios: filtra por (repartidor_id, estado) para "pendientes"
-- y (repartidor_id, fecha_entrega_real) para "entregados". El primero ya cubre
-- ambos casos de pendientes y agrupa con el index existente repartidor + fecha.
CREATE INDEX IF NOT EXISTS idx_envios_repartidor_estado
  ON envios (repartidor_id, estado)
  WHERE eliminado = FALSE AND repartidor_id IS NOT NULL;

COMMENT ON INDEX idx_envios_repartidor_estado IS
  'Driver portal mis-envios: filtro por (repartidor_id, estado) para listas pendientes/entregados. Parcial sobre no eliminados con repartidor asignado.';

-- Auditoria reciente por entidad: el admin abre un envio y consulta
-- valor_anterior/valor_nuevo de los ultimos cambios.
CREATE INDEX IF NOT EXISTS idx_auditoria_entidad_fecha
  ON auditoria_log (entidad, entidad_id, created_at DESC);

COMMENT ON INDEX idx_auditoria_entidad_fecha IS
  'Acelera la consulta del log de auditoria de una entidad ordenado por fecha. Reemplaza el plan que combinaba idx_auditoria_entidad + filesort.';

-- 020_pago_rpc_atomico.sql
-- RPCs atomicos para mutacion de pagos: envuelven INSERT/UPDATE en pagos + INSERT en
-- auditoria_log dentro de una unica transaccion plpgsql. Cierra el hallazgo 1.2 del
-- hard debug original: antes el pago se persistia primero y la auditoria despues, sin
-- transaccion compartida. Si la auditoria fallaba quedaba un pago sin rastro forense.
--
-- Ambas funciones son SECURITY DEFINER para que la insercion en auditoria_log no
-- dependa de las policies RLS del caller (tabla auditoria_log rechaza inserts de
-- roles no privilegiados por disenio). El service_role ya bypassa RLS, el SECURITY
-- DEFINER mantiene el comportamiento si en el futuro se llaman desde otro rol.
--
-- Idempotente: CREATE OR REPLACE FUNCTION. La aplicacion puede repetir la migracion
-- sin efectos secundarios.
--
-- Errores custom usan SQLSTATE 'P0001' con mensajes estables que el service en TS
-- mapea a AppError:
--   pago_no_encontrado          -> 404 NOT_FOUND
--   pago_monto_recibido_invalido -> 400 BAD_REQUEST
--
-- El service sigue validando en TS antes del RPC (envio existe, cliente, monto
-- razonable) porque AppError es mas limpio que exception mapping. Los errores del RPC
-- son la ultima linea de defensa para consistencia de datos.

-- 1) create_pago_atomico
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
  v_estado     estado_pago;
  v_pago       pagos;
  v_descripcion TEXT;
BEGIN
  IF p_monto_recibido < 0 THEN
    RAISE EXCEPTION 'pago_monto_recibido_invalido: monto_recibido debe ser >= 0'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_monto_recibido > p_monto_total THEN
    RAISE EXCEPTION 'pago_monto_recibido_invalido: monto_recibido % excede monto_total %',
      p_monto_recibido, p_monto_total
      USING ERRCODE = 'P0001';
  END IF;

  IF p_monto_recibido >= p_monto_total THEN
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
    p_envio_id, p_monto_total, p_monto_recibido, p_metodo_pago, v_estado,
    p_fecha_pago, p_referencia, p_notas, p_creado_por
  )
  RETURNING * INTO v_pago;

  v_descripcion := format(
    'Pago creado para envio %s: %s/%s Gs. (%s)',
    p_tracking_number, p_monto_recibido, p_monto_total, v_estado
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

COMMENT ON FUNCTION create_pago_atomico IS
  'Inserta pago y fila en auditoria_log en la misma transaccion. Si cualquiera de los dos INSERT falla, ambos se rollbackean. SECURITY DEFINER para persistir en auditoria_log sin depender de RLS del caller.';

-- 2) update_pago_atomico
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
  v_descripcion  TEXT;
BEGIN
  SELECT * INTO v_pago_previo
    FROM pagos
   WHERE id = p_pago_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'pago_no_encontrado: %', p_pago_id
      USING ERRCODE = 'P0001';
  END IF;

  IF p_monto_recibido < 0 THEN
    RAISE EXCEPTION 'pago_monto_recibido_invalido: monto_recibido debe ser >= 0'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_monto_recibido > v_pago_previo.monto_total THEN
    RAISE EXCEPTION 'pago_monto_recibido_invalido: monto_recibido % excede monto_total %',
      p_monto_recibido, v_pago_previo.monto_total
      USING ERRCODE = 'P0001';
  END IF;

  IF p_monto_recibido >= v_pago_previo.monto_total THEN
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

COMMENT ON FUNCTION update_pago_atomico IS
  'Actualiza pago con lock pesimista y registra auditoria en la misma transaccion. Los parametros p_apply_* indican que campos opcionales aplicar para emular PATCH parcial sin perder la atomicidad.';

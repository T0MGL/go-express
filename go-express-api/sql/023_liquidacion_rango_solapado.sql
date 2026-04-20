-- 023_liquidacion_rango_solapado.sql
-- Bloqueo de rangos solapados en crear_liquidacion. Cierra una deuda identificada en el
-- smoke test de Fase 5 (sprint-pagos/FASE_5_SMOKE_TEST_REPORT.md): crear una segunda
-- liquidacion del mismo repartidor con rango solapado al de una liquidacion existente
-- devolvia una liquidacion vacia con monto 0 y 0 envios en lugar de rechazar. El spec
-- original de Fase 5 requeria el check pero no estaba implementado en el RPC.
--
-- Criterio: dos rangos [a, b] y [c, d] solapan cuando a <= d AND c <= b. Usamos ese
-- predicado contra cualquier liquidacion existente del mismo repartidor (sin importar
-- estado: pendiente, cerrada o con_diferencia bloquean por igual). Evita:
--   * liquidaciones vacias fantasma cuando todos los envios del rango ya estan conciliados
--   * carreras entre dos admins creando liquidaciones del mismo repartidor y rango
--   * regression semantica del spec
--
-- No hay cambio de firma. CREATE OR REPLACE permite sobrescribir la definicion previa de
-- la migracion 022. El resto del cuerpo queda identico al original (snapshot por TZ PY,
-- exclusion de envios ya conciliados, audit en la misma transaccion).

CREATE OR REPLACE FUNCTION crear_liquidacion(
  p_repartidor_id   UUID,
  p_fecha_desde     DATE,
  p_fecha_hasta     DATE,
  p_creado_por      UUID,
  p_usuario_nombre  TEXT,
  p_ip              INET,
  p_user_agent      TEXT
)
RETURNS liquidaciones_repartidor
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
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
END;
$$;

COMMENT ON FUNCTION crear_liquidacion IS 'Crea una liquidacion pendiente snapshoteando los envios COD entregados por el repartidor en el rango (zona horaria PY). Rechaza si el rango solapa con otra liquidacion existente del mismo repartidor. Excluye envios ya conciliados. Audita en la misma transaccion. Errores: rango_invalido, liquidacion_rango_solapado, repartidor_no_encontrado.';

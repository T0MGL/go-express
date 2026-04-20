-- 022_liquidaciones_repartidor.sql
-- Liquidaciones de repartidor (cierre de caja fisico por rango de fechas).
-- Cierra los hallazgos 3.1, 3.2, 3.3 y 3.4 del hard debug original:
--   3.1: la "Conciliacion" previa era un reporte de COD sin cierre formal. Ahora hay una
--        tabla liquidaciones_repartidor donde cada cierre queda asentado con auditoria,
--        monto esperado, monto recibido, diferencia y estado.
--   3.2: doble fuente de verdad entre pagos.monto_recibido y envios.monto_cobrado. El
--        trigger trg_pago_sync_envio_cobrado mantiene envios.monto_cobrado como CACHE
--        sincronizado desde pagos. La fuente de verdad pasa a ser pagos.
--   3.3: envios.monto_cobrado podia ser cualquier numero sin validar contra monto_a_cobrar.
--        A partir de Fase 5 el set directo se elimina. El repartidor crea un Pago COD
--        via create_pago_atomico y el trigger actualiza el cache. La validacion de 10%
--        se hace en el service TS antes del RPC.
--   3.4: filtros de fecha en UTC implicito. El RPC crear_liquidacion filtra por
--        (fecha_entrega_real AT TIME ZONE 'America/Asuncion')::date para capturar
--        entregas de 22:30 PY en el dia correcto.
--
-- Modelo conceptual:
--   * Un repartidor cobra COD en la calle.
--   * Al volver a la oficina entrega el efectivo fisico.
--   * Admin crea una liquidacion para el rango [fecha_desde, fecha_hasta], snapshotea los
--     envios COD entregados del repartidor en ese rango.
--   * Admin pesa el efectivo, lo ingresa y cierra la liquidacion.
--   * Si el monto coincide -> estado = 'cerrada'. Si hay diferencia -> 'con_diferencia'
--     con nota obligatoria.
--   * Un envio no puede entrar a dos liquidaciones cerradas simultaneas (unique parcial).

-- 1) Enum estado_liquidacion
DO $$ BEGIN
  CREATE TYPE estado_liquidacion AS ENUM ('pendiente', 'cerrada', 'con_diferencia');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Extender auditoria_entidad para identificar al nuevo recurso
ALTER TYPE auditoria_entidad ADD VALUE IF NOT EXISTS 'liquidacion';

-- 3) Tabla liquidaciones_repartidor
CREATE TABLE IF NOT EXISTS liquidaciones_repartidor (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  repartidor_id         UUID NOT NULL REFERENCES repartidores(id),
  fecha_desde           DATE NOT NULL,
  fecha_hasta           DATE NOT NULL,
  monto_total_esperado  BIGINT NOT NULL DEFAULT 0,
  monto_total_recibido  BIGINT NULL,
  diferencia            BIGINT GENERATED ALWAYS AS (COALESCE(monto_total_recibido, 0) - monto_total_esperado) STORED,
  estado                estado_liquidacion NOT NULL DEFAULT 'pendiente',
  cerrada_por           UUID NULL REFERENCES usuarios(id),
  cerrada_en            TIMESTAMPTZ NULL,
  notas                 TEXT NULL,
  creado_por            UUID NOT NULL REFERENCES usuarios(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT liquidacion_rango_valido CHECK (fecha_hasta >= fecha_desde),
  CONSTRAINT liquidacion_estado_coherente CHECK (
    (estado = 'pendiente'
      AND cerrada_por IS NULL
      AND cerrada_en IS NULL
      AND monto_total_recibido IS NULL)
    OR
    (estado IN ('cerrada', 'con_diferencia')
      AND cerrada_por IS NOT NULL
      AND cerrada_en IS NOT NULL
      AND monto_total_recibido IS NOT NULL)
  )
);

COMMENT ON TABLE liquidaciones_repartidor IS 'Cierre de caja fisico por repartidor y rango de fechas. Cada fila representa la reconciliacion entre el COD esperado (suma de monto_a_cobrar de envios entregados) y el COD efectivamente entregado por el repartidor en oficina. Cuando estado = cerrada la liquidacion es inmutable.';
COMMENT ON COLUMN liquidaciones_repartidor.monto_total_esperado IS 'Suma de monto_a_cobrar de los envios COD entregados por el repartidor en el rango. Se calcula al crear y no se recalcula.';
COMMENT ON COLUMN liquidaciones_repartidor.monto_total_recibido IS 'Efectivo fisico que el admin pesa y recibe del repartidor al cerrar. NULL mientras la liquidacion esta pendiente.';
COMMENT ON COLUMN liquidaciones_repartidor.diferencia IS 'Columna generada: monto_total_recibido - monto_total_esperado. Positivo significa el repartidor entrego mas de lo esperado (anomalia). Negativo, entrego menos (faltante).';
COMMENT ON COLUMN liquidaciones_repartidor.notas IS 'Justificacion obligatoria si cierra con diferencia. Libre si cierra sin diferencia.';

CREATE INDEX IF NOT EXISTS idx_liquidaciones_repartidor_fecha
  ON liquidaciones_repartidor (repartidor_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_liquidaciones_estado
  ON liquidaciones_repartidor (estado, created_at DESC);

-- 4) Tabla liquidacion_envios: snapshot de los envios incluidos
CREATE TABLE IF NOT EXISTS liquidacion_envios (
  liquidacion_id  UUID NOT NULL REFERENCES liquidaciones_repartidor(id) ON DELETE CASCADE,
  envio_id        UUID NOT NULL REFERENCES envios(id),
  monto_esperado  BIGINT NOT NULL,
  monto_cobrado   BIGINT NOT NULL,
  conciliado      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (liquidacion_id, envio_id)
);

COMMENT ON TABLE liquidacion_envios IS 'Snapshot de los envios incluidos en una liquidacion. monto_esperado y monto_cobrado se congelan en el momento de crear la liquidacion para que cierres tardios no se vean afectados por ediciones posteriores del pago.';
COMMENT ON COLUMN liquidacion_envios.monto_esperado IS 'Snapshot de envios.monto_a_cobrar al momento de crear la liquidacion.';
COMMENT ON COLUMN liquidacion_envios.monto_cobrado IS 'Snapshot de envios.monto_cobrado al momento de crear la liquidacion.';
COMMENT ON COLUMN liquidacion_envios.conciliado IS 'Marca que el envio ya paso por una liquidacion cerrada. Usado por el unique parcial para bloquear doble-liquidacion.';

CREATE INDEX IF NOT EXISTS idx_liquidacion_envios_envio
  ON liquidacion_envios (envio_id);

-- 5) Unique partial: un envio no puede aparecer en dos liquidaciones cerradas.
-- Cuando una liquidacion se cierra, todos sus envios pasan a conciliado = TRUE. Si otro
-- admin intenta crear una liquidacion que incluya ese envio, el INSERT fallara con 23505.
CREATE UNIQUE INDEX IF NOT EXISTS liquidacion_envios_unique_conciliado
  ON liquidacion_envios (envio_id)
  WHERE conciliado = TRUE;

COMMENT ON INDEX liquidacion_envios_unique_conciliado IS 'Un envio solo puede aparecer en una liquidacion cerrada. El INSERT del crear_liquidacion se corre primero, el UPDATE a conciliado = TRUE se hace al cerrar. Esto permite liquidaciones pendientes solapadas (caso raro) pero bloquea cualquier cierre duplicado.';

-- 6) Trigger: sync de pagos -> envios.monto_cobrado (cache).
-- La fuente de verdad pasa a ser pagos. envios.monto_cobrado es un cache que queries
-- existentes (dashboard, reportes) pueden seguir usando sin refactor.
-- Comportamiento:
--   * INSERT de pago contra un envio COD -> envios.monto_cobrado = pago.monto_recibido
--   * UPDATE de pago COD con cambio de monto_recibido -> mismo
--   * UPDATE de pago COD transicionando anulado = TRUE -> envios.monto_cobrado = 0
--   * Si el envio no es contra_entrega, el trigger no hace nada (envios.monto_cobrado
--     sigue siendo seteado por el trigger de entrega en flujos no-COD si llegara a existir,
--     pero por ahora el unico set remanente es via trigger de pagos).
CREATE OR REPLACE FUNCTION trg_pago_sync_envio_cobrado_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_envio_tipo_pago TEXT;
  v_efectivo_cobrado BIGINT;
BEGIN
  -- Solo actuamos sobre pagos de envios contra_entrega
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

  UPDATE envios
     SET monto_cobrado = v_efectivo_cobrado
   WHERE id = NEW.envio_id;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION trg_pago_sync_envio_cobrado_fn IS 'Sincroniza envios.monto_cobrado desde pagos.monto_recibido para envios contra_entrega. Cache unidireccional: pagos es la fuente de verdad, envios.monto_cobrado es derivado. Anular un pago resetea el cache a 0.';

DROP TRIGGER IF EXISTS trg_pago_sync_envio_cobrado ON pagos;
CREATE TRIGGER trg_pago_sync_envio_cobrado
AFTER INSERT OR UPDATE OF monto_recibido, anulado ON pagos
FOR EACH ROW
EXECUTE FUNCTION trg_pago_sync_envio_cobrado_fn();

-- 7) Index para acelerar la query del RPC crear_liquidacion, filtrando por repartidor_id
-- + estado = 'entregado' + fecha_entrega_real NOT NULL. El filtro de TZ no se indexa
-- porque el set resultante de entregados por repartidor suele ser chico (decenas).
CREATE INDEX IF NOT EXISTS idx_envios_repartidor_entregado_fecha
  ON envios (repartidor_id, fecha_entrega_real DESC)
  WHERE estado = 'entregado' AND tipo_pago = 'contra_entrega' AND eliminado = FALSE;

-- 8) RPC crear_liquidacion
-- Filtra los envios COD entregados por el repartidor en el rango PY y toma snapshot.
-- Un envio que ya esta en una liquidacion cerrada (conciliado = TRUE) quedaria excluido
-- por el index unique parcial al intentar insertarlo, pero lo filtramos tambien en la
-- query explicitamente para dar un error de dominio claro en lugar de 23505 opaco.
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
BEGIN
  IF p_fecha_hasta < p_fecha_desde THEN
    RAISE EXCEPTION 'rango_invalido: fecha_hasta debe ser >= fecha_desde'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT nombre INTO v_repartidor_nombre
    FROM repartidores
   WHERE id = p_repartidor_id AND eliminado = FALSE;

  IF v_repartidor_nombre IS NULL THEN
    RAISE EXCEPTION 'repartidor_no_encontrado: %', p_repartidor_id
      USING ERRCODE = 'P0001';
  END IF;

  -- Calcular monto total esperado y cantidad sobre la misma query que luego
  -- produce las filas de liquidacion_envios. Evitamos temp tables para sortear
  -- triggers globales de proteccion contra full-delete.
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

COMMENT ON FUNCTION crear_liquidacion IS 'Crea una liquidacion pendiente snapshoteando los envios COD entregados por el repartidor en el rango (zona horaria PY). Excluye envios ya conciliados en otra liquidacion cerrada. Audita en la misma transaccion. Errores: rango_invalido, repartidor_no_encontrado.';

-- 9) RPC cerrar_liquidacion
-- Lock pesimista via SELECT FOR UPDATE. Rechaza si ya esta cerrada. Si hay diferencia
-- requiere notas (validado en TS tambien, pero lo reforzamos aca como ultima defensa).
-- Marca conciliado = TRUE en todos los envios de la liquidacion, lo que dispara el
-- unique parcial liquidacion_envios_unique_conciliado y bloquea doble cierre del mismo
-- envio en otra liquidacion.
CREATE OR REPLACE FUNCTION cerrar_liquidacion(
  p_liquidacion_id  UUID,
  p_monto_recibido  BIGINT,
  p_notas           TEXT,
  p_cerrado_por     UUID,
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
  v_previa      liquidaciones_repartidor;
  v_actual      liquidaciones_repartidor;
  v_estado      estado_liquidacion;
  v_diferencia  BIGINT;
  v_descripcion TEXT;
BEGIN
  IF p_monto_recibido < 0 THEN
    RAISE EXCEPTION 'monto_invalido: monto_recibido debe ser >= 0'
      USING ERRCODE = 'P0001';
  END IF;

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

  v_diferencia := p_monto_recibido - v_previa.monto_total_esperado;

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
     SET monto_total_recibido = p_monto_recibido,
         estado               = v_estado,
         cerrada_por          = p_cerrado_por,
         cerrada_en           = NOW(),
         notas                = p_notas,
         updated_at           = NOW()
   WHERE id = p_liquidacion_id
  RETURNING * INTO v_actual;

  UPDATE liquidacion_envios
     SET conciliado = TRUE
   WHERE liquidacion_id = p_liquidacion_id;

  v_descripcion := format(
    'Liquidacion cerrada: esperado %s Gs, recibido %s Gs, diferencia %s (%s)',
    v_actual.monto_total_esperado, v_actual.monto_total_recibido, v_diferencia, v_estado
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
$$;

COMMENT ON FUNCTION cerrar_liquidacion IS 'Cierra una liquidacion pendiente: calcula diferencia, setea estado (cerrada / con_diferencia), marca envios conciliados, audita. Todo en una sola transaccion con lock pesimista. Errores: liquidacion_no_encontrada, liquidacion_ya_cerrada, notas_requeridas, monto_invalido.';

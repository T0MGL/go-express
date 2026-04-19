-- 021_pago_anulacion.sql
-- Anulacion de pagos con reversion de saldo de cuenta corriente.
-- Cierra el hallazgo 1.1 del hard debug: un pago mal asignado quedaba permanente
-- porque la tabla pagos no tenia columnas de anulacion y el unique (envio_id) impedia
-- recobrar sobre el mismo envio luego del error. La edicion del monto rompia trazabilidad.
--
-- Modelo:
--   * Anulacion logica: flag anulado + anulado_por + anulado_en + motivo_anulacion.
--     Nunca DELETE. El pago original se conserva intacto con sus montos y metodo.
--   * El unique constraint pasa a ser parcial (WHERE anulado = FALSE), para que un envio
--     pueda recibir un nuevo pago despues de anular el previo.
--   * Para envios tipo_pago = 'cuenta_corriente', la anulacion genera un movimiento
--     'reverso' que re-incrementa la deuda del cliente al registrar_movimiento_cc bajo
--     su lock pesimista. El movimiento original credito queda en el ledger (append-only)
--     y el reverso es el asiento compensador.
--   * La accion 'anular' se registra en auditoria_log en la misma transaccion plpgsql
--     del RPC. Si la auditoria falla, Postgres rollbackea el UPDATE de pagos y el
--     movimiento de reverso, manteniendo consistencia.
--
-- Errores mapeados (SQLSTATE P0001) con mensajes estables que el service en TS mapea a
-- AppError:
--   pago_no_encontrado      -> 404 NOT_FOUND
--   pago_ya_anulado         -> 409 CONFLICT
--   motivo_insuficiente     -> 400 BAD_REQUEST

-- 1) Extender auditoria_accion con 'anular'.
ALTER TYPE auditoria_accion ADD VALUE IF NOT EXISTS 'anular';

-- 2) Columnas de anulacion en pagos.
ALTER TABLE pagos
  ADD COLUMN IF NOT EXISTS anulado BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS anulado_por UUID NULL REFERENCES usuarios(id),
  ADD COLUMN IF NOT EXISTS anulado_en TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS motivo_anulacion TEXT NULL;

COMMENT ON COLUMN pagos.anulado IS 'TRUE si el pago fue anulado. El pago original queda inmutable; la anulacion se refleja con anulado_por, anulado_en y motivo_anulacion. Los GETs por default filtran anulado = FALSE.';
COMMENT ON COLUMN pagos.motivo_anulacion IS 'Justificacion de la anulacion (>= 10 caracteres). Requerida si anulado = TRUE por CHECK constraint pagos_anulacion_coherente.';

-- 3) CHECK de coherencia: los 4 campos de anulacion van todos o ninguno.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pagos_anulacion_coherente'
  ) THEN
    ALTER TABLE pagos
      ADD CONSTRAINT pagos_anulacion_coherente
      CHECK (
        (anulado = FALSE
          AND anulado_por IS NULL
          AND anulado_en IS NULL
          AND motivo_anulacion IS NULL)
        OR
        (anulado = TRUE
          AND anulado_por IS NOT NULL
          AND anulado_en IS NOT NULL
          AND motivo_anulacion IS NOT NULL
          AND length(motivo_anulacion) >= 10)
      );
  END IF;
END $$;

-- 4) Reemplazar unique (envio_id) por unique parcial sobre pagos activos.
-- Permite registrar un nuevo pago para un envio cuyo pago previo fue anulado, sin
-- permitir duplicados sobre un mismo envio en simultaneo. La constraint vieja cae por
-- nombre (definida en 010_pago_unique_envio.sql) y se recrea como partial UNIQUE INDEX.
ALTER TABLE pagos DROP CONSTRAINT IF EXISTS pagos_envio_id_unique;

CREATE UNIQUE INDEX IF NOT EXISTS pagos_envio_id_unique_active
  ON pagos (envio_id)
  WHERE anulado = FALSE;

COMMENT ON INDEX pagos_envio_id_unique_active IS 'Un unico pago activo por envio. Anular un pago libera la clave para que el mismo envio pueda recibir un nuevo cobro.';

-- 5) Index de apoyo para listados filtrados por anulado = FALSE ordenados por fecha.
CREATE INDEX IF NOT EXISTS idx_pagos_activos_fecha
  ON pagos (fecha_pago DESC)
  WHERE anulado = FALSE;

-- 6) RPC anular_pago_atomico: anula + audita + reversa saldo CC si aplica, en una sola
-- transaccion plpgsql. Si el envio no es cuenta_corriente, no hay movimiento de reverso.
CREATE OR REPLACE FUNCTION anular_pago_atomico(
  p_pago_id       UUID,
  p_motivo        TEXT,
  p_anulado_por   UUID,
  p_usuario_nombre TEXT,
  p_ip            INET,
  p_user_agent    TEXT
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
  v_envio        RECORD;
  v_monto_reverso BIGINT;
  v_descripcion  TEXT;
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
    RAISE EXCEPTION 'pago_no_encontrado: %', p_pago_id
      USING ERRCODE = 'P0001';
  END IF;

  IF v_pago_previo.anulado = TRUE THEN
    RAISE EXCEPTION 'pago_ya_anulado: %', p_pago_id
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

  v_descripcion := format(
    'Pago %s anulado. Motivo: %s',
    p_pago_id, p_motivo
  );

  INSERT INTO auditoria_log (
    usuario, usuario_id, accion, entidad, entidad_id,
    descripcion, valor_anterior, valor_nuevo, ip_address, user_agent
  ) VALUES (
    p_usuario_nombre, p_anulado_por, 'anular', 'pago', v_pago_actual.id::TEXT,
    v_descripcion, to_jsonb(v_pago_previo), to_jsonb(v_pago_actual), p_ip, p_user_agent
  );

  -- Reversion de saldo cuenta corriente. Solo si el envio es CC y el pago original
  -- habia generado un movimiento credito (monto_recibido > 0). No dependemos de la
  -- existencia del movimiento en el ledger para decidir: el trigger de pago CC solo
  -- inserta credito si monto_recibido > 0, asi que replicamos la condicion.
  SELECT cliente_id, tipo_pago, tracking_number
    INTO v_envio
    FROM envios
   WHERE id = v_pago_previo.envio_id;

  IF FOUND
     AND v_envio.tipo_pago = 'cuenta_corriente'
     AND v_pago_previo.monto_recibido > 0 THEN

    v_monto_reverso := v_pago_previo.monto_recibido;

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

  RETURN v_pago_actual;
END;
$$;

COMMENT ON FUNCTION anular_pago_atomico IS 'Anula un pago, registra auditoria y, si el envio es cuenta_corriente, genera un movimiento reverso que re-incrementa la deuda del cliente. Todo en una unica transaccion plpgsql. Errores estables: pago_no_encontrado, pago_ya_anulado, motivo_insuficiente.';

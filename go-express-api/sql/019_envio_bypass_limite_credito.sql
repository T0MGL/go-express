-- 019_envio_bypass_limite_credito.sql
-- Soporte para override admin de limite de credito al crear envio cuenta_corriente.
-- La validacion de limite vive en registrar_movimiento_cc (lock pesimista en cliente).
-- Para que un admin pueda forzar la creacion sobre el limite con motivo justificado,
-- el envio lleva una bandera persistente que el trigger lee y propaga al RPC.
-- La justificacion textual queda en auditoria_log via envio.service.ts (no se duplica
-- aca por DRY: la columna en envios solo tracquea la decision tecnica).

-- 1) Columna bypass en envios. Default FALSE para mantener comportamiento normal.
ALTER TABLE envios
  ADD COLUMN IF NOT EXISTS bypass_limite_credito BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN envios.bypass_limite_credito IS 'TRUE solo cuando el admin invoco POST con forzarSobreLimite=true + motivoOverride. El trigger trg_envio_cc_debito_fn lee esta bandera y la propaga al RPC registrar_movimiento_cc para saltar la validacion de limite. La justificacion textual queda en auditoria_log.';

-- 2) Reemplazar registrar_movimiento_cc para aceptar p_bypass_limite.
-- DROP explicito de la signatura vieja (9 params): Postgres trata el cambio de
-- signatura como overload distinta y CREATE OR REPLACE solo no alcanza. Ambas
-- coexistirian y CALL fallaria por ambiguedad.
--
-- Orden:
--   a. Drop triggers que referencian la funcion vieja (libera dependencias).
--   b. Drop funciones de trigger viejas (referencian la RPC vieja).
--   c. Drop RPC vieja.
--   d. Crear RPC nueva con p_bypass_limite.
--   e. Recrear funciones de trigger.
--   f. Recrear triggers.
-- Idempotente y sin CASCADE (que tendria efectos no deseados sobre dependencias
-- desconocidas).
DROP TRIGGER IF EXISTS trg_envio_cuenta_corriente_debito ON envios;
DROP TRIGGER IF EXISTS trg_pago_cuenta_corriente_credito ON pagos;
DROP FUNCTION IF EXISTS trg_envio_cc_debito_fn();
DROP FUNCTION IF EXISTS trg_pago_cc_credito_fn();
DROP FUNCTION IF EXISTS registrar_movimiento_cc(
  UUID, UUID, UUID, tipo_movimiento_cc, BIGINT, TEXT, UUID, INET, TEXT
);

-- El parametro p_bypass_limite es opcional (DEFAULT FALSE) para mantener call
-- sites existentes (notas de credito, ajustes manuales) sin cambios.
CREATE OR REPLACE FUNCTION registrar_movimiento_cc(
  p_cliente_id     UUID,
  p_envio_id       UUID,
  p_pago_id        UUID,
  p_tipo           tipo_movimiento_cc,
  p_monto          BIGINT,
  p_descripcion    TEXT,
  p_creado_por     UUID,
  p_ip             INET,
  p_user_agent     TEXT,
  p_bypass_limite  BOOLEAN DEFAULT FALSE
)
RETURNS movimientos_cuenta_corriente
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_saldo_actual    BIGINT;
  v_limite_credito  BIGINT;
  v_nuevo_saldo     BIGINT;
  v_movimiento      movimientos_cuenta_corriente;
BEGIN
  IF p_monto = 0 THEN
    RAISE EXCEPTION 'monto no puede ser cero' USING ERRCODE = 'P0001';
  END IF;

  SELECT saldo_cuenta_corriente, limite_credito
    INTO v_saldo_actual, v_limite_credito
    FROM clientes
   WHERE id = p_cliente_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'cliente % no existe', p_cliente_id USING ERRCODE = 'P0002';
  END IF;

  v_nuevo_saldo := v_saldo_actual + p_monto;

  -- Validacion atomica del limite. Saltea cuando el caller pasa p_bypass_limite=TRUE
  -- (override admin con motivo en auditoria_log). Aplica solo a movimientos que
  -- aumentan deuda y cuando hay limite configurado.
  IF NOT p_bypass_limite
     AND v_limite_credito > 0
     AND p_tipo IN ('debito', 'ajuste')
     AND p_monto > 0
     AND v_nuevo_saldo > v_limite_credito THEN
    RAISE EXCEPTION 'limite_credito_excedido: saldo proyectado % excede limite %',
      v_nuevo_saldo, v_limite_credito
      USING ERRCODE = 'P0003';
  END IF;

  INSERT INTO movimientos_cuenta_corriente (
    cliente_id, envio_id, pago_id, tipo, monto, saldo_posterior,
    descripcion, creado_por, ip_address, user_agent
  ) VALUES (
    p_cliente_id, p_envio_id, p_pago_id, p_tipo, p_monto, v_nuevo_saldo,
    p_descripcion, p_creado_por, p_ip, p_user_agent
  )
  RETURNING * INTO v_movimiento;

  UPDATE clientes
     SET saldo_cuenta_corriente = v_nuevo_saldo
   WHERE id = p_cliente_id;

  RETURN v_movimiento;
END;
$$;

COMMENT ON FUNCTION registrar_movimiento_cc IS 'Registra un movimiento de cuenta corriente y actualiza el saldo del cliente atomicamente bajo SELECT FOR UPDATE. Valida limite de credito bajo lock para movimientos que aumentan deuda. p_bypass_limite=TRUE saltea la validacion (override admin con motivo asentado en auditoria_log). Unica via permitida para mutar saldo_cuenta_corriente.';

-- 3) Recrear funcion de trigger trg_envio_cc_debito_fn.
-- Propaga NEW.bypass_limite_credito al RPC.
CREATE FUNCTION trg_envio_cc_debito_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_monto       BIGINT;
  v_descripcion TEXT;
  v_actor       UUID;
BEGIN
  IF NEW.tipo_pago <> 'cuenta_corriente' OR NEW.eliminado = TRUE THEN
    RETURN NEW;
  END IF;

  v_monto := NEW.costo + COALESCE(NEW.costo_seguro, 0);

  IF v_monto <= 0 THEN
    RETURN NEW;
  END IF;

  v_descripcion := 'Envio ' || NEW.tracking_number;
  v_actor := '00000000-0000-4000-a000-000000000001';

  PERFORM registrar_movimiento_cc(
    NEW.cliente_id, NEW.id, NULL, 'debito', v_monto,
    v_descripcion, v_actor, NULL, NULL,
    COALESCE(NEW.bypass_limite_credito, FALSE)
  );

  RETURN NEW;
END;
$$;

-- 4) Recrear funcion de trigger trg_pago_cc_credito_fn.
-- Sin cambios respecto a la version original de 018, solo re-creada porque la
-- dropeamos en el paso 2 para liberar la dependencia sobre la RPC vieja.
CREATE FUNCTION trg_pago_cc_credito_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_envio       RECORD;
  v_descripcion TEXT;
BEGIN
  IF NEW.monto_recibido <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT cliente_id, tipo_pago, tracking_number
    INTO v_envio
    FROM envios
   WHERE id = NEW.envio_id;

  IF NOT FOUND OR v_envio.tipo_pago <> 'cuenta_corriente' THEN
    RETURN NEW;
  END IF;

  v_descripcion := 'Pago envio ' || v_envio.tracking_number;

  PERFORM registrar_movimiento_cc(
    v_envio.cliente_id, NEW.envio_id, NEW.id, 'credito', -NEW.monto_recibido,
    v_descripcion, NEW.creado_por, NULL, NULL
  );

  RETURN NEW;
END;
$$;

-- 5) Recrear triggers (apuntan a las funciones recien creadas).
CREATE TRIGGER trg_envio_cuenta_corriente_debito
AFTER INSERT ON envios
FOR EACH ROW
EXECUTE FUNCTION trg_envio_cc_debito_fn();

CREATE TRIGGER trg_pago_cuenta_corriente_credito
AFTER INSERT ON pagos
FOR EACH ROW
EXECUTE FUNCTION trg_pago_cc_credito_fn();

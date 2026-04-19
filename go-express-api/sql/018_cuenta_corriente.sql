-- 018_cuenta_corriente.sql
-- Ledger de cuenta corriente B2B. Registra cada debito (envio facturado a cuenta) y cada credito
-- (pago recibido) con saldo posterior por movimiento. Snapshot historico para reconstruir libro mayor
-- sin recalcular. Sustituye al campo clientes.saldo_cuenta_corriente que existia pero nunca se actualizaba.
--
-- Convencion de signo:
--   monto > 0 = aumenta deuda del cliente (debito)
--   monto < 0 = reduce deuda del cliente (credito)
-- saldo_cuenta_corriente positivo = el cliente le debe a GoExpress.
-- Puede quedar negativo si el cliente paga de mas (saldo a favor).

-- 0) Usuario sistema GoExpress. Identidad fija usada por triggers automaticos
-- (registrar_movimiento_cc, debito por envio, credito por pago) cuando no hay
-- usuario humano en el contexto. Insertar antes que los triggers para evitar
-- FK violation en el primer envio cuenta_corriente.
INSERT INTO usuarios (id, nombre, email, rol, estado)
VALUES (
  '00000000-0000-4000-a000-000000000001',
  'Sistema GoExpress',
  'sistema@goexpress.internal',
  'admin',
  'activo'
)
ON CONFLICT (id) DO NOTHING;

-- 1) Enum tipo_movimiento_cc
DO $$ BEGIN
  CREATE TYPE tipo_movimiento_cc AS ENUM (
    'debito', 'credito', 'ajuste', 'nota_credito', 'reverso'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Extender auditoria_accion para soportar ajuste y nota_credito sobre cuenta corriente
ALTER TYPE auditoria_accion ADD VALUE IF NOT EXISTS 'ajuste';
ALTER TYPE auditoria_accion ADD VALUE IF NOT EXISTS 'nota_credito';

-- 3) Extender auditoria_entidad para identificar al ledger como entidad propia
ALTER TYPE auditoria_entidad ADD VALUE IF NOT EXISTS 'cuenta_corriente';

-- 4) Tabla de movimientos
CREATE TABLE IF NOT EXISTS movimientos_cuenta_corriente (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cliente_id      UUID NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
  envio_id        UUID NULL REFERENCES envios(id) ON DELETE SET NULL,
  pago_id         UUID NULL REFERENCES pagos(id) ON DELETE SET NULL,
  tipo            tipo_movimiento_cc NOT NULL,
  monto           BIGINT NOT NULL CHECK (monto != 0),
  saldo_posterior BIGINT NOT NULL,
  descripcion     TEXT NOT NULL,
  creado_por      UUID NOT NULL REFERENCES usuarios(id),
  ip_address      INET NULL,
  user_agent      TEXT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE movimientos_cuenta_corriente IS 'Libro mayor de cuenta corriente B2B. Append-only. Cada fila registra un movimiento con saldo posterior calculado bajo lock para evitar race conditions.';
COMMENT ON COLUMN movimientos_cuenta_corriente.monto IS 'Gs. Convencion: positivo aumenta deuda del cliente (debito), negativo reduce deuda (credito). Nunca cero.';
COMMENT ON COLUMN movimientos_cuenta_corriente.saldo_posterior IS 'Snapshot del saldo del cliente despues de aplicar este movimiento. Permite reconstruir libro mayor sin recalcular.';
COMMENT ON COLUMN movimientos_cuenta_corriente.envio_id IS 'Envio asociado cuando aplica (debito automatico por envio cuenta_corriente). NULL para ajustes y notas de credito sin envio.';
COMMENT ON COLUMN movimientos_cuenta_corriente.pago_id IS 'Pago asociado cuando aplica (credito automatico por pago de envio cuenta_corriente). NULL en caso contrario.';
COMMENT ON COLUMN movimientos_cuenta_corriente.creado_por IS 'Usuario que origino el movimiento. En triggers automaticos refleja el usuario que creo el envio o el pago.';

-- Append-only: revocar UPDATE/DELETE
REVOKE UPDATE, DELETE ON movimientos_cuenta_corriente FROM PUBLIC;
REVOKE UPDATE, DELETE ON movimientos_cuenta_corriente FROM authenticated;
REVOKE ALL ON movimientos_cuenta_corriente FROM anon;

CREATE INDEX IF NOT EXISTS idx_movcc_cliente_fecha
  ON movimientos_cuenta_corriente (cliente_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_movcc_envio
  ON movimientos_cuenta_corriente (envio_id) WHERE envio_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_movcc_pago
  ON movimientos_cuenta_corriente (pago_id) WHERE pago_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_movcc_tipo_fecha
  ON movimientos_cuenta_corriente (tipo, created_at DESC);

-- RLS: bloquear todo excepto service_role
ALTER TABLE movimientos_cuenta_corriente ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deny_anon" ON movimientos_cuenta_corriente;
CREATE POLICY "deny_anon" ON movimientos_cuenta_corriente FOR ALL TO anon USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "deny_authenticated" ON movimientos_cuenta_corriente;
CREATE POLICY "deny_authenticated" ON movimientos_cuenta_corriente FOR ALL TO authenticated USING (false) WITH CHECK (false);

-- 5) Limite de credito en clientes
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS limite_credito BIGINT NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'clientes_limite_credito_nonneg'
  ) THEN
    ALTER TABLE clientes ADD CONSTRAINT clientes_limite_credito_nonneg CHECK (limite_credito >= 0);
  END IF;
END $$;

COMMENT ON COLUMN clientes.limite_credito IS 'Tope de saldo de cuenta corriente que el cliente puede acumular (Gs). 0 = sin limite configurado (no se aplica restriccion). Se valida en creacion de envios cuenta_corriente.';
COMMENT ON COLUMN clientes.saldo_cuenta_corriente IS 'Saldo actual de cuenta corriente (Gs). Positivo: el cliente debe a GoExpress. Negativo: GoExpress debe al cliente (saldo a favor por sobrepago). Mantenido por trigger via registrar_movimiento_cc.';

-- 6) Funcion atomica para registrar movimiento + actualizar saldo bajo lock
CREATE OR REPLACE FUNCTION registrar_movimiento_cc(
  p_cliente_id  UUID,
  p_envio_id    UUID,
  p_pago_id     UUID,
  p_tipo        tipo_movimiento_cc,
  p_monto       BIGINT,
  p_descripcion TEXT,
  p_creado_por  UUID,
  p_ip          INET,
  p_user_agent  TEXT
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

  -- Lock de la fila del cliente para serializar movimientos concurrentes
  SELECT saldo_cuenta_corriente, limite_credito
    INTO v_saldo_actual, v_limite_credito
    FROM clientes
   WHERE id = p_cliente_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'cliente % no existe', p_cliente_id USING ERRCODE = 'P0002';
  END IF;

  v_nuevo_saldo := v_saldo_actual + p_monto;

  -- Validacion atomica del limite de credito bajo lock. Aplica solo a movimientos
  -- que aumentan deuda (debito automatico por envio, ajuste positivo) y cuando hay
  -- limite configurado (> 0). Reverso, credito y nota_credito reducen deuda y siempre
  -- se permiten. La validacion en TS (verificarLimiteCredito) es advisory para UX,
  -- esta es la garantia real que cierra la race window.
  IF v_limite_credito > 0
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

COMMENT ON FUNCTION registrar_movimiento_cc IS 'Registra un movimiento de cuenta corriente y actualiza el saldo del cliente atomicamente bajo SELECT FOR UPDATE. Valida limite de credito bajo lock para movimientos que aumentan deuda. Unica via permitida para mutar saldo_cuenta_corriente.';

-- 7) Trigger debito al crear envio cuenta_corriente
CREATE OR REPLACE FUNCTION trg_envio_cc_debito_fn()
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
    -- Envio sin costo, no afecta cuenta corriente
    RETURN NEW;
  END IF;

  v_descripcion := 'Envio ' || NEW.tracking_number;

  -- Triggers no tienen creador propio: tomar creador desde envio si esta disponible,
  -- caer al admin del sistema en su defecto. Es la convencion del schema (envios no
  -- tiene columna creado_por, asi que usamos el admin sistema).
  v_actor := '00000000-0000-4000-a000-000000000001';

  PERFORM registrar_movimiento_cc(
    NEW.cliente_id, NEW.id, NULL, 'debito', v_monto,
    v_descripcion, v_actor, NULL, NULL
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_envio_cuenta_corriente_debito ON envios;
CREATE TRIGGER trg_envio_cuenta_corriente_debito
AFTER INSERT ON envios
FOR EACH ROW
EXECUTE FUNCTION trg_envio_cc_debito_fn();

-- 8) Trigger credito al registrar pago de envio cuenta_corriente
CREATE OR REPLACE FUNCTION trg_pago_cc_credito_fn()
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

DROP TRIGGER IF EXISTS trg_pago_cuenta_corriente_credito ON pagos;
CREATE TRIGGER trg_pago_cuenta_corriente_credito
AFTER INSERT ON pagos
FOR EACH ROW
EXECUTE FUNCTION trg_pago_cc_credito_fn();

-- 9) Backfill historico (idempotente). Usa sistema admin como creador.
-- Nota: no se usa registrar_movimiento_cc dentro del backfill porque queremos
-- consistencia eventual y queremos evitar reentrar al lock por cada fila. Se
-- inserta el movimiento con saldo_posterior reconstruido por orden cronologico
-- y se setea el saldo final en una sola pasada.
DO $$
DECLARE
  v_admin     UUID := '00000000-0000-4000-a000-000000000001';
  v_cliente   RECORD;
  v_mov       RECORD;
  v_saldo     BIGINT;
BEGIN
  FOR v_cliente IN
    SELECT id FROM clientes WHERE eliminado = FALSE
  LOOP
    -- Solo si no hay movimientos previos para ese cliente, generamos backfill.
    IF EXISTS (
      SELECT 1 FROM movimientos_cuenta_corriente WHERE cliente_id = v_cliente.id
    ) THEN
      CONTINUE;
    END IF;

    v_saldo := 0;

    -- Construir lista cronologica unificada de eventos (envios y pagos)
    FOR v_mov IN
      WITH eventos AS (
        SELECT
          e.created_at AS ts,
          'debito'::tipo_movimiento_cc AS tipo,
          e.id AS envio_id,
          NULL::UUID AS pago_id,
          (e.costo + COALESCE(e.costo_seguro, 0))::BIGINT AS monto,
          'Envio ' || e.tracking_number AS descripcion
        FROM envios e
        WHERE e.cliente_id = v_cliente.id
          AND e.tipo_pago = 'cuenta_corriente'
          AND e.eliminado = FALSE
          AND (e.costo + COALESCE(e.costo_seguro, 0)) > 0
        UNION ALL
        SELECT
          p.created_at AS ts,
          'credito'::tipo_movimiento_cc AS tipo,
          p.envio_id AS envio_id,
          p.id AS pago_id,
          (-p.monto_recibido)::BIGINT AS monto,
          'Pago envio ' || e.tracking_number AS descripcion
        FROM pagos p
        JOIN envios e ON e.id = p.envio_id
        WHERE e.cliente_id = v_cliente.id
          AND e.tipo_pago = 'cuenta_corriente'
          AND e.eliminado = FALSE
          AND p.monto_recibido > 0
      )
      SELECT * FROM eventos ORDER BY ts ASC
    LOOP
      v_saldo := v_saldo + v_mov.monto;

      INSERT INTO movimientos_cuenta_corriente (
        cliente_id, envio_id, pago_id, tipo, monto, saldo_posterior,
        descripcion, creado_por, ip_address, user_agent, created_at
      ) VALUES (
        v_cliente.id, v_mov.envio_id, v_mov.pago_id, v_mov.tipo, v_mov.monto, v_saldo,
        v_mov.descripcion, v_admin, NULL, NULL, v_mov.ts
      );
    END LOOP;

    UPDATE clientes
       SET saldo_cuenta_corriente = v_saldo
     WHERE id = v_cliente.id;
  END LOOP;
END $$;

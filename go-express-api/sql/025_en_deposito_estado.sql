-- 025_en_deposito_estado.sql
-- New logical state for envios physically held in the warehouse between
-- transit and dispatch. Transition path: en_transito → en_deposito → en_reparto.

-- 1) Add enum value.
--    IF NOT EXISTS makes this idempotent (safe to run more than once).
ALTER TYPE envio_estado ADD VALUE IF NOT EXISTS 'en_deposito';

-- 2) Replace the trigger function that keeps clientes.total_envios and
--    clientes.envios_activos in sync after any INSERT/UPDATE/DELETE on envios.
--    The function name and signature must match exactly so the existing
--    trg_envios_count trigger (created in 001_schema.sql) continues to fire
--    against the updated body with no DDL on the trigger itself.
--    Only change from the original: en_deposito added to the active-state list.
CREATE OR REPLACE FUNCTION update_cliente_envio_counts()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE clientes SET
    total_envios   = (SELECT COUNT(*) FROM envios WHERE cliente_id = COALESCE(NEW.cliente_id, OLD.cliente_id)),
    envios_activos = (SELECT COUNT(*) FROM envios WHERE cliente_id = COALESCE(NEW.cliente_id, OLD.cliente_id) AND estado IN ('pendiente', 'recolectado', 'en_transito', 'en_deposito', 'en_reparto'))
  WHERE id = COALESCE(NEW.cliente_id, OLD.cliente_id);

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

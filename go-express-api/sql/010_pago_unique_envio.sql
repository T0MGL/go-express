-- Enforce one pago per envio at the database level.
-- The application already enforces this, but without a DB constraint two concurrent
-- requests can both pass the check and create duplicates (race condition).
-- Using IF NOT EXISTS so this is safe to run multiple times.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pagos_envio_id_unique'
  ) THEN
    ALTER TABLE pagos ADD CONSTRAINT pagos_envio_id_unique UNIQUE (envio_id);
  END IF;
END $$;

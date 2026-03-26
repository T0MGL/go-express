-- ============================================
-- GO EXPRESS: Convert portal_status TEXT to ENUM, add missing index
-- Values sourced from PortalStatus type in src/types/index.ts:
--   'sin_invitar' | 'invitado' | 'activo' | 'desactivado'
-- Generated: 2026-03-25
-- ============================================

BEGIN;

-- 1. Create the ENUM type
DO $$ BEGIN
  CREATE TYPE portal_status_tipo AS ENUM ('sin_invitar', 'invitado', 'activo', 'desactivado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Convert portal_status from TEXT to ENUM
-- Must drop default, alter type, re-add default
ALTER TABLE clientes ALTER COLUMN portal_status DROP DEFAULT;

ALTER TABLE clientes
  ALTER COLUMN portal_status TYPE portal_status_tipo
  USING portal_status::portal_status_tipo;

ALTER TABLE clientes ALTER COLUMN portal_status SET DEFAULT 'sin_invitar';

-- 3. Add missing indexes on FK columns without indexes
-- inventario_almacen.envio_id: FK to envios, used in joins and ON DELETE
CREATE INDEX IF NOT EXISTS idx_inventario_envio ON inventario_almacen(envio_id)
  WHERE envio_id IS NOT NULL;

-- envios.tarifa_id: FK with ON DELETE RESTRICT, Postgres must scan on tarifa delete
CREATE INDEX IF NOT EXISTS idx_envios_tarifa ON envios(tarifa_id)
  WHERE tarifa_id IS NOT NULL;

-- picking_items.envio_id: FK with ON DELETE CASCADE, must scan on envio delete
CREATE INDEX IF NOT EXISTS idx_picking_envio ON picking_items(envio_id);

COMMIT;

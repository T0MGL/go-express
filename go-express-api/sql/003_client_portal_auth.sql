-- ================================================================
-- GO EXPRESS -- Migration 003: Client portal auth columns
-- Adds portal_activo, portal_status, and auth_id index to clientes.
-- ================================================================

-- portal_activo: true when the client has accepted the invite and can log in
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS portal_activo BOOLEAN NOT NULL DEFAULT FALSE;

-- portal_status: tracks the invite lifecycle (sin_invitar, invitado, activo, desactivado)
-- Using TEXT instead of ENUM for flexibility during early iterations
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS portal_status TEXT NOT NULL DEFAULT 'sin_invitar';

-- portal_invited_at: when the invite was last sent
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS portal_invited_at TIMESTAMPTZ;

-- Index on auth_id for fast lookups during auth middleware
CREATE INDEX IF NOT EXISTS idx_clientes_auth_id ON clientes(auth_id) WHERE auth_id IS NOT NULL;

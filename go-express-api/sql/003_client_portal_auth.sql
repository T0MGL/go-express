ALTER TABLE clientes ADD COLUMN IF NOT EXISTS portal_activo BOOLEAN NOT NULL DEFAULT FALSE;

-- TEXT instead of ENUM: flexibility during early iterations
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS portal_status TEXT NOT NULL DEFAULT 'sin_invitar';

ALTER TABLE clientes ADD COLUMN IF NOT EXISTS portal_invited_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_clientes_auth_id ON clientes(auth_id) WHERE auth_id IS NOT NULL;

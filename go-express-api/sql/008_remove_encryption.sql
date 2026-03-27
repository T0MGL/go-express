-- Migration: Remove application-level encryption
-- Security model: Supabase encryption at rest (automatic) + TLS in transit + RLS for access control
-- This migration renames _enc columns to plaintext names and drops search/hash helper columns.
-- Existing data that was stored as AES-256-GCM ciphertext needs to be decrypted BEFORE running
-- this migration. If the data is already plaintext (pre-encryption records), this is safe to run directly.

-- =============================================================================
-- STEP 1: Rename encrypted columns to plaintext names
-- =============================================================================

-- clientes
ALTER TABLE clientes RENAME COLUMN ruc_enc TO ruc;
ALTER TABLE clientes RENAME COLUMN contacto_nombre_enc TO contacto_nombre;
ALTER TABLE clientes RENAME COLUMN telefono_enc TO telefono;
ALTER TABLE clientes RENAME COLUMN email_enc TO email;
ALTER TABLE clientes RENAME COLUMN direccion_enc TO direccion;

-- envios
ALTER TABLE envios RENAME COLUMN destinatario_nombre_enc TO destinatario_nombre;
ALTER TABLE envios RENAME COLUMN destinatario_direccion_enc TO destinatario_direccion;
ALTER TABLE envios RENAME COLUMN destinatario_telefono_enc TO destinatario_telefono;
ALTER TABLE envios RENAME COLUMN destinatario_telefono2_enc TO destinatario_telefono2;
ALTER TABLE envios RENAME COLUMN destinatario_cedula_enc TO destinatario_cedula;
ALTER TABLE envios RENAME COLUMN destinatario_referencia_enc TO destinatario_referencia;

-- repartidores
ALTER TABLE repartidores RENAME COLUMN telefono_enc TO telefono;

-- pagos
ALTER TABLE pagos RENAME COLUMN referencia_enc TO referencia;

-- =============================================================================
-- STEP 2: Drop search/hash helper columns (no longer needed with plaintext)
-- =============================================================================

-- Drop hash indexes first
DROP INDEX IF EXISTS idx_clientes_ruc_hash;
DROP INDEX IF EXISTS idx_clientes_email_hash;
DROP INDEX IF EXISTS idx_clientes_ruc_unique;
DROP INDEX IF EXISTS idx_clientes_email_unique;
DROP INDEX IF EXISTS idx_envios_nombre_search;
DROP INDEX IF EXISTS idx_envios_telefono_hash;

-- Drop the columns
ALTER TABLE clientes DROP COLUMN IF EXISTS ruc_hash;
ALTER TABLE clientes DROP COLUMN IF EXISTS email_hash;
ALTER TABLE envios DROP COLUMN IF EXISTS destinatario_nombre_search;
ALTER TABLE envios DROP COLUMN IF EXISTS destinatario_telefono_hash;

-- =============================================================================
-- STEP 3: Add proper indexes for direct text search on plaintext columns
-- =============================================================================

-- clientes: unique constraints on plaintext RUC and email
CREATE UNIQUE INDEX IF NOT EXISTS idx_clientes_ruc_unique ON clientes(ruc) WHERE eliminado = FALSE;
CREATE UNIQUE INDEX IF NOT EXISTS idx_clientes_email_unique ON clientes(email) WHERE eliminado = FALSE;

-- clientes: trigram search on contacto_nombre
CREATE INDEX IF NOT EXISTS idx_clientes_contacto_nombre ON clientes USING gin(contacto_nombre gin_trgm_ops);

-- envios: trigram search on destinatario_nombre (replaces the old _search column index)
CREATE INDEX IF NOT EXISTS idx_envios_destinatario_nombre ON envios USING gin(destinatario_nombre gin_trgm_ops);

-- envios: index on destinatario_telefono for exact lookups
CREATE INDEX IF NOT EXISTS idx_envios_destinatario_telefono ON envios(destinatario_telefono);

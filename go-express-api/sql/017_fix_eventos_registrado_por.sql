-- Add registrado_por_nombre to eventos_envio
-- This column was being inserted by routes but did not exist in the table.
-- PostgREST silently dropped the data.
ALTER TABLE eventos_envio ADD COLUMN IF NOT EXISTS registrado_por_nombre TEXT;

-- Fix costo_seguro column type: INTEGER -> BIGINT for consistency with all other money columns
ALTER TABLE envios ALTER COLUMN costo_seguro TYPE BIGINT;

-- Track individual contact attempts with the recipient of a shipment.
-- Used when drivers cannot reach the destinatario: operators log each call,
-- WhatsApp message, or failed visit so the team has a clean audit trail.

DO $$ BEGIN
  CREATE TYPE intento_contacto_tipo AS ENUM ('llamada', 'whatsapp', 'visita_fallida');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS intentos_contacto (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  envio_id UUID NOT NULL REFERENCES envios(id) ON DELETE CASCADE,
  tipo intento_contacto_tipo NOT NULL,
  descripcion TEXT,
  registrado_por UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  registrado_por_nombre TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_intentos_contacto_envio
  ON intentos_contacto(envio_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_intentos_contacto_registrado_por
  ON intentos_contacto(registrado_por);

ALTER TABLE intentos_contacto ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deny_anon" ON intentos_contacto;
DROP POLICY IF EXISTS "deny_authenticated" ON intentos_contacto;

CREATE POLICY "deny_anon" ON intentos_contacto
  FOR ALL TO anon USING (false) WITH CHECK (false);

CREATE POLICY "deny_authenticated" ON intentos_contacto
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

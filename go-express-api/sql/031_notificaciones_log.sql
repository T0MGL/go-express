-- 031_notificaciones_log.sql
-- Persistencia de cada intento de notificacion outbound (email, whatsapp).
-- Permite auditar quejas tipo "nunca me llego nada" y monitorear health del canal.
--
-- Decisiones:
--   * Una fila por (envio, evento, canal, destinatario). No es un dedup constraint
--     porque puede haber reintentos manuales y queremos verlos todos.
--   * status enum acotado a lo que efectivamente reportamos: enviado, fallido, descartado.
--     "descartado" = no se intento (ej. destinatario sin email, sin telefono, opt-out).
--   * proveedor_message_id queda nullable: Resend y Meta devuelven IDs distintos, no
--     todos los paths los exponen. Util para troubleshoot pero no critico.
--   * RLS deny all: solo service_role escribe. Lectura via /api/admin/notificaciones-log
--     en el futuro si hace falta (no incluido en este sprint).
--   * Index por envio_id para el detalle, y partial por status='fallido' para alertas.
--
-- Tambien agrega el flag en_deposito al notificaciones_config existente: la transicion
-- existe en VALID_TRANSITIONS pero nunca se cableo notificacion. Default true.

BEGIN;

DO $$ BEGIN
  CREATE TYPE notif_canal AS ENUM ('email', 'whatsapp');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE notif_evento AS ENUM (
    'envio_creado',
    'recolectado',
    'en_transito',
    'en_deposito',
    'en_reparto',
    'entregado',
    'fallido',
    'problema'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE notif_status AS ENUM ('enviado', 'fallido', 'descartado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS notificaciones_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  envio_id UUID NOT NULL REFERENCES envios(id) ON DELETE CASCADE,
  evento notif_evento NOT NULL,
  canal notif_canal NOT NULL,
  destinatario TEXT NOT NULL,
  status notif_status NOT NULL,
  proveedor_message_id TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notificaciones_log_envio
  ON notificaciones_log(envio_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notificaciones_log_fallidos
  ON notificaciones_log(created_at DESC)
  WHERE status = 'fallido';

ALTER TABLE notificaciones_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deny_anon_notif_log" ON notificaciones_log;
CREATE POLICY "deny_anon_notif_log" ON notificaciones_log
  FOR ALL TO anon USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "deny_authenticated_notif_log" ON notificaciones_log;
CREATE POLICY "deny_authenticated_notif_log" ON notificaciones_log
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

COMMENT ON TABLE notificaciones_log IS 'Log inmutable de cada intento de notificacion outbound (email/whatsapp). Insert-only desde notificaciones.service.ts. RLS deny all, solo service_role.';

-- Sumar flag en_deposito al notificaciones_config existente.
-- jsonb_set con create_if_missing=true asegura idempotencia.
UPDATE configuracion
SET value = jsonb_set(value, '{en_deposito}', 'true'::jsonb, true)
WHERE key = 'notificaciones_config'
  AND NOT (value ? 'en_deposito');

COMMIT;

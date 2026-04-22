-- 024_notificaciones_config.sql
-- Notificaciones por email: toggles por evento del ciclo de vida del envio.
-- Vive en la tabla configuracion existente bajo la key `notificaciones_config`.
-- El service de email (triggerNotification en envio.service) lee esta config
-- y saltea el send cuando el flag correspondiente esta en false. Default: todo activo.
--
-- Shape del JSONB:
--   {
--     "envio_creado": boolean,   // al crear el envio (estado pendiente)
--     "recolectado":  boolean,   // al pasar a recolectado
--     "en_transito":  boolean,   // al pasar a en_transito
--     "en_reparto":   boolean,   // al pasar a en_reparto
--     "entregado":    boolean,   // al pasar a entregado
--     "fallido":      boolean,   // al pasar a fallido
--     "problema":     boolean    // al pasar a problema
--   }

INSERT INTO configuracion (key, value) VALUES
  ('notificaciones_config', '{
    "envio_creado": true,
    "recolectado": true,
    "en_transito": true,
    "en_reparto": true,
    "entregado": true,
    "fallido": true,
    "problema": true
  }'::jsonb)
ON CONFLICT (key) DO NOTHING;

COMMENT ON TABLE configuracion IS 'Key-value config global del sistema. Keys notables: seguro_config (JSONB), notificaciones_config (JSONB), empresa (JSONB), tracking_prefix, tracking_year.';

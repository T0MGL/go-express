-- 032_sistema_user_seed.sql
-- Restaura usuario SISTEMA usado por podCleanup.service, repartidor/envios,
-- envio.service y otros paths donde una accion no tiene usuario humano asociado
-- (scheduler interno, transicion automatica, audit log de sistema).
-- Fue insertado en 005_demo_seed.sql y eliminado en 006_clean_demo_data.sql.
-- El codigo activo lo asume existente; sin el row, INSERT en auditoria_log
-- viola FK constraint y rompe transiciones de estado.
-- Idempotente: ON CONFLICT DO NOTHING para no pisar produccion existente.

BEGIN;

INSERT INTO usuarios (id, nombre, email, rol, estado)
VALUES (
  '00000000-0000-4000-a000-000000000001',
  'Sistema GO EXPRESS',
  'sistema@goexpressparaguay.com',
  'admin',
  'activo'
)
ON CONFLICT (id) DO NOTHING;

COMMIT;

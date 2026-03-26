-- ============================================
-- GO EXPRESS: Clean Demo Seed Data
-- Reverses everything inserted by 005_demo_seed.sql
-- Must run in FK-safe order (children first, parents last)
-- Generated: 2026-03-25
-- ============================================

BEGIN;

-- 1. Auditoria log (seed entry)
DELETE FROM auditoria_log
WHERE usuario_id = '00000000-0000-4000-a000-000000000001'
  AND entidad = 'sistema'
  AND entidad_id = 'seed';

-- 2. Pagos (reference envios, which reference clientes)
DELETE FROM pagos
WHERE creado_por = '00000000-0000-4000-a000-000000000001'
  AND envio_id IN (
    SELECT id FROM envios
    WHERE tracking_number IN (
      'GE2026001001', 'GE2026001002', 'GE2026001003', 'GE2026001004',
      'GE2026001005', 'GE2026001006', 'GE2026001007', 'GE2026001008'
    )
  );

-- 3. Notas internas (reference envios)
DELETE FROM notas_internas
WHERE envio_id IN (
  SELECT id FROM envios
  WHERE tracking_number IN (
    'GE2026001001', 'GE2026001002', 'GE2026001003', 'GE2026001004',
    'GE2026001005', 'GE2026001006', 'GE2026001007', 'GE2026001008'
  )
);

-- 4. Eventos de envio (reference envios, CASCADE would handle but explicit is safer)
DELETE FROM eventos_envio
WHERE envio_id IN (
  SELECT id FROM envios
  WHERE tracking_number IN (
    'GE2026001001', 'GE2026001002', 'GE2026001003', 'GE2026001004',
    'GE2026001005', 'GE2026001006', 'GE2026001007', 'GE2026001008'
  )
);

-- 5. Picking items (reference envios)
DELETE FROM picking_items
WHERE envio_id IN (
  SELECT id FROM envios
  WHERE tracking_number IN (
    'GE2026001001', 'GE2026001002', 'GE2026001003', 'GE2026001004',
    'GE2026001005', 'GE2026001006', 'GE2026001007', 'GE2026001008'
  )
);

-- 6. Inventario almacen (reference envios)
DELETE FROM inventario_almacen
WHERE envio_id IN (
  SELECT id FROM envios
  WHERE tracking_number IN (
    'GE2026001001', 'GE2026001002', 'GE2026001003', 'GE2026001004',
    'GE2026001005', 'GE2026001006', 'GE2026001007', 'GE2026001008'
  )
);

-- 7. Movimientos almacen (reference inventario_almacen via paquete_id)
-- Clean any that might reference demo inventario entries
DELETE FROM movimientos_almacen
WHERE usuario_id = '00000000-0000-4000-a000-000000000001'
  AND paquete_id NOT IN (SELECT id FROM inventario_almacen);

-- 8. Envios (reference clientes and repartidores)
DELETE FROM envios
WHERE tracking_number IN (
  'GE2026001001', 'GE2026001002', 'GE2026001003', 'GE2026001004',
  'GE2026001005', 'GE2026001006', 'GE2026001007', 'GE2026001008'
);

-- 9. Tarifas (reference usuarios via creado_por)
DELETE FROM tarifas
WHERE creado_por = '00000000-0000-4000-a000-000000000001';

-- 10. Productos guardados (reference clientes)
DELETE FROM productos_guardados
WHERE cliente_id IN (
  '00000000-0000-4000-b000-000000000001',
  '00000000-0000-4000-b001-000000000001',
  '00000000-0000-4000-b002-000000000001'
);

-- 11. Tags (reference clientes)
DELETE FROM tags
WHERE cliente_id IN (
  '00000000-0000-4000-b000-000000000001',
  '00000000-0000-4000-b001-000000000001',
  '00000000-0000-4000-b002-000000000001'
);

-- 12. Clientes (demo UUIDs)
DELETE FROM clientes
WHERE id IN (
  '00000000-0000-4000-b000-000000000001',
  '00000000-0000-4000-b001-000000000001',
  '00000000-0000-4000-b002-000000000001'
);

-- 13. Repartidores (demo UUIDs)
DELETE FROM repartidores
WHERE id IN (
  '00000000-0000-4000-c000-000000000001',
  '00000000-0000-4000-c001-000000000001',
  '00000000-0000-4000-c002-000000000001'
);

-- 14. Reset tracking sequence past demo range to avoid collisions
SELECT setval('tracking_seq', 1100, true);

-- NOTE: The admin user (00000000-0000-4000-a000-000000000001) is NOT deleted.
-- It was created in 001_schema.sql as part of the base system config, not demo data.
-- The auth_id binding from 002_auth_rls_update.sql is also kept.

COMMIT;

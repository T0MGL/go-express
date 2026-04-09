-- ============================================
-- GO EXPRESS: Demo Seed Data
-- Run AFTER all schema migrations (001-008)
-- Uses post-008 schema (plaintext columns, no _enc/_hash)
-- Regenerated: 2026-03-26
-- ============================================

-- Clientes de demo
INSERT INTO clientes (id, razon_social, ruc, contacto_nombre, contacto_cargo, telefono, email, direccion, ciudad, estado, plan, portal_activo, portal_status)
VALUES (
  '00000000-0000-4000-b000-000000000001',
  'TechStore Paraguay S.A.',
  '80012345-0',
  'Carlos Mendez',
  'Gerente de Logistica',
  '+595981123456',
  'carlos@techstore.com.py',
  'Av. Espana 1234, Asuncion',
  'Asuncion',
  'activo',
  'profesional',
  FALSE,
  'sin_invitar'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO clientes (id, razon_social, ruc, contacto_nombre, contacto_cargo, telefono, email, direccion, ciudad, estado, plan, portal_activo, portal_status)
VALUES (
  '00000000-0000-4000-b001-000000000001',
  'Modas Express SRL',
  '80067890-1',
  'Laura Benitez',
  'Directora Comercial',
  '+595971654321',
  'laura@modasexpress.com.py',
  'Av. Mcal. Lopez 567, Asuncion',
  'Asuncion',
  'activo',
  'basico',
  FALSE,
  'sin_invitar'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO clientes (id, razon_social, ruc, contacto_nombre, contacto_cargo, telefono, email, direccion, ciudad, estado, plan, portal_activo, portal_status)
VALUES (
  '00000000-0000-4000-b002-000000000001',
  'Farmacia Central S.A.',
  '80045678-2',
  'Roberto Gomez',
  'Jefe de Despacho',
  '+595961789012',
  'roberto@farmaciacentral.com.py',
  'Av. Eusebio Ayala 890, Asuncion',
  'Asuncion',
  'activo',
  'enterprise',
  FALSE,
  'sin_invitar'
) ON CONFLICT (id) DO NOTHING;

-- Repartidores de demo
INSERT INTO repartidores (id, nombre, telefono, vehiculo, placa, licencia, estado)
VALUES (
  '00000000-0000-4000-c000-000000000001',
  'Juan Paredes',
  '+595982111222',
  'Moto',
  'ABC-123',
  'LIC-001',
  'activo'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO repartidores (id, nombre, telefono, vehiculo, placa, licencia, estado)
VALUES (
  '00000000-0000-4000-c001-000000000001',
  'Diego Villalba',
  '+595972333444',
  'Auto',
  'DEF-456',
  'LIC-002',
  'activo'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO repartidores (id, nombre, telefono, vehiculo, placa, licencia, estado)
VALUES (
  '00000000-0000-4000-c002-000000000001',
  'Fernando Caceres',
  '+595962555666',
  'Camioneta',
  'GHI-789',
  'LIC-003',
  'activo'
) ON CONFLICT (id) DO NOTHING;

-- Tarifas (rutas desde Asuncion)
INSERT INTO tarifas (origen, destino, tipo_servicio, precio_base, peso_base, precio_por_kg_extra, creado_por)
VALUES ('Asuncion', 'Asuncion', 'estandar', 25000, 5, 3000, '00000000-0000-4000-a000-000000000001');
INSERT INTO tarifas (origen, destino, tipo_servicio, precio_base, peso_base, precio_por_kg_extra, creado_por)
VALUES ('Asuncion', 'Asuncion', 'express', 40000, 5, 5000, '00000000-0000-4000-a000-000000000001');
INSERT INTO tarifas (origen, destino, tipo_servicio, precio_base, peso_base, precio_por_kg_extra, creado_por)
VALUES ('Asuncion', 'San Lorenzo', 'estandar', 30000, 5, 3500, '00000000-0000-4000-a000-000000000001');
INSERT INTO tarifas (origen, destino, tipo_servicio, precio_base, peso_base, precio_por_kg_extra, creado_por)
VALUES ('Asuncion', 'Luque', 'estandar', 30000, 5, 3500, '00000000-0000-4000-a000-000000000001');
INSERT INTO tarifas (origen, destino, tipo_servicio, precio_base, peso_base, precio_por_kg_extra, creado_por)
VALUES ('Asuncion', 'Capiata', 'estandar', 35000, 5, 4000, '00000000-0000-4000-a000-000000000001');
INSERT INTO tarifas (origen, destino, tipo_servicio, precio_base, peso_base, precio_por_kg_extra, creado_por)
VALUES ('Asuncion', 'Lambare', 'estandar', 25000, 5, 3000, '00000000-0000-4000-a000-000000000001');
INSERT INTO tarifas (origen, destino, tipo_servicio, precio_base, peso_base, precio_por_kg_extra, creado_por)
VALUES ('Asuncion', 'Ciudad del Este', 'estandar', 80000, 10, 6000, '00000000-0000-4000-a000-000000000001');
INSERT INTO tarifas (origen, destino, tipo_servicio, precio_base, peso_base, precio_por_kg_extra, creado_por)
VALUES ('Asuncion', 'Encarnacion', 'estandar', 75000, 10, 5500, '00000000-0000-4000-a000-000000000001');

-- Envios de ejemplo (8 shipments across various states)
INSERT INTO envios (
  tracking_number, cliente_id, cliente_nombre, origen, destino,
  destinatario_nombre, destinatario_direccion, destinatario_telefono,
  destinatario_telefono2, destinatario_cedula, destinatario_ciudad,
  destinatario_departamento, destinatario_barrio, destinatario_referencia,
  destinatario_ubicacion_url,
  cantidad, producto, peso, fragil, valor_declarado,
  estado, costo, monto_a_cobrar, tipo_pago,
  repartidor_id, repartidor_asignado_en, fecha
) VALUES (
  'GE2026' || LPAD((1001)::text, 6, '0'),
  '00000000-0000-4000-b000-000000000001',
  'TechStore Paraguay S.A.',
  'Asuncion',
  'Asuncion',
  'Ana Ruiz Diaz',
  'Av. Aviadores del Chaco 2050, Asuncion',
  '+595981234567',
  '+595215551230',
  '4567890',
  'Asuncion',
  'Central',
  'Villa Morra',
  'Frente al Shopping del Sol',
  'https://maps.google.com/?q=-25.2867,-57.5759',
  1,
  'Laptop HP Pavilion 15',
  2.5,
  FALSE,
  2500000,
  'pendiente',
  30000,
  2500000,
  'contra_entrega',
  NULL,
  NULL,
  CURRENT_DATE
);

INSERT INTO envios (
  tracking_number, cliente_id, cliente_nombre, origen, destino,
  destinatario_nombre, destinatario_direccion, destinatario_telefono,
  destinatario_telefono2, destinatario_cedula, destinatario_ciudad,
  destinatario_departamento, destinatario_barrio, destinatario_referencia,
  destinatario_ubicacion_url,
  cantidad, producto, peso, fragil, valor_declarado,
  estado, costo, monto_a_cobrar, tipo_pago,
  repartidor_id, repartidor_asignado_en, fecha
) VALUES (
  'GE2026' || LPAD((1002)::text, 6, '0'),
  '00000000-0000-4000-b001-000000000001',
  'Modas Express SRL',
  'Asuncion',
  'San Lorenzo',
  'Pedro Martinez',
  'Calle 14 de Mayo 345, San Lorenzo',
  '+595971345678',
  NULL,
  '3456789',
  'San Lorenzo',
  'Central',
  'Centro',
  'A una cuadra de la plaza principal',
  'https://maps.google.com/?q=-25.3387,-57.5096',
  1,
  'iPhone 15 Pro Max',
  0.3,
  FALSE,
  8500000,
  'recolectado',
  40000,
  8500000,
  'contra_entrega',
  '00000000-0000-4000-c001-000000000001',
  NOW() - INTERVAL '7 hours',
  CURRENT_DATE
);

INSERT INTO envios (
  tracking_number, cliente_id, cliente_nombre, origen, destino,
  destinatario_nombre, destinatario_direccion, destinatario_telefono,
  destinatario_telefono2, destinatario_cedula, destinatario_ciudad,
  destinatario_departamento, destinatario_barrio, destinatario_referencia,
  destinatario_ubicacion_url,
  cantidad, producto, peso, fragil, valor_declarado,
  estado, costo, monto_a_cobrar, tipo_pago,
  repartidor_id, repartidor_asignado_en, fecha
) VALUES (
  'GE2026' || LPAD((1003)::text, 6, '0'),
  '00000000-0000-4000-b002-000000000001',
  'Farmacia Central S.A.',
  'Asuncion',
  'Luque',
  'Lucia Fernandez',
  'Ruta 2 Km 15, Luque',
  '+595961456789',
  '+595215554560',
  '2345678',
  'Luque',
  'Central',
  'Luque Centro',
  'Al lado del Supermercado Stock',
  NULL,
  1,
  'Medicamentos (caja fragil)',
  1.2,
  TRUE,
  150000,
  'en_transito',
  25000,
  150000,
  'anticipado',
  '00000000-0000-4000-c002-000000000001',
  NOW() - INTERVAL '6 hours',
  CURRENT_DATE
);

INSERT INTO envios (
  tracking_number, cliente_id, cliente_nombre, origen, destino,
  destinatario_nombre, destinatario_direccion, destinatario_telefono,
  destinatario_telefono2, destinatario_cedula, destinatario_ciudad,
  destinatario_departamento, destinatario_barrio, destinatario_referencia,
  destinatario_ubicacion_url,
  cantidad, producto, peso, fragil, valor_declarado,
  estado, costo, monto_a_cobrar, tipo_pago,
  repartidor_id, repartidor_asignado_en, fecha
) VALUES (
  'GE2026' || LPAD((1004)::text, 6, '0'),
  '00000000-0000-4000-b000-000000000001',
  'TechStore Paraguay S.A.',
  'Asuncion',
  'Capiata',
  'Miguel Acosta',
  'Barrio San Miguel 789, Capiata',
  '+595982567890',
  NULL,
  '1234567',
  'Capiata',
  'Central',
  'Capiata Centro',
  'Casa con porton verde, esquina',
  NULL,
  1,
  'Vestido de gala',
  0.5,
  FALSE,
  350000,
  'en_reparto',
  30000,
  350000,
  'cuenta_corriente',
  '00000000-0000-4000-c000-000000000001',
  NOW() - INTERVAL '5 hours',
  CURRENT_DATE
);

INSERT INTO envios (
  tracking_number, cliente_id, cliente_nombre, origen, destino,
  destinatario_nombre, destinatario_direccion, destinatario_telefono,
  destinatario_telefono2, destinatario_cedula, destinatario_ciudad,
  destinatario_departamento, destinatario_barrio, destinatario_referencia,
  destinatario_ubicacion_url,
  cantidad, producto, peso, fragil, valor_declarado,
  estado, costo, monto_a_cobrar, tipo_pago,
  repartidor_id, repartidor_asignado_en, fecha
) VALUES (
  'GE2026' || LPAD((1005)::text, 6, '0'),
  '00000000-0000-4000-b001-000000000001',
  'Modas Express SRL',
  'Asuncion',
  'Lambare',
  'Sofia Gimenez',
  'Barrio San Pablo 234, Lambare',
  '+595971678901',
  '+595215557890',
  '5678901',
  'Lambare',
  'Central',
  'San Pablo',
  'Detras de la iglesia San Pablo',
  'https://maps.google.com/?q=-25.3333,-57.6333',
  1,
  'Suplementos vitaminicos',
  3,
  FALSE,
  0,
  'entregado',
  35000,
  0,
  'anticipado',
  '00000000-0000-4000-c001-000000000001',
  NOW() - INTERVAL '4 hours',
  CURRENT_DATE - INTERVAL '1 days'
);

INSERT INTO envios (
  tracking_number, cliente_id, cliente_nombre, origen, destino,
  destinatario_nombre, destinatario_direccion, destinatario_telefono,
  destinatario_telefono2, destinatario_cedula, destinatario_ciudad,
  destinatario_departamento, destinatario_barrio, destinatario_referencia,
  destinatario_ubicacion_url,
  cantidad, producto, peso, fragil, valor_declarado,
  estado, costo, monto_a_cobrar, tipo_pago,
  repartidor_id, repartidor_asignado_en, fecha
) VALUES (
  'GE2026' || LPAD((1006)::text, 6, '0'),
  '00000000-0000-4000-b002-000000000001',
  'Farmacia Central S.A.',
  'Asuncion',
  'Asuncion',
  'Ana Ruiz Diaz',
  'Av. Aviadores del Chaco 2050, Asuncion',
  '+595981234567',
  '+595215551230',
  '4567890',
  'Asuncion',
  'Central',
  'Villa Morra',
  'Frente al Shopping del Sol',
  'https://maps.google.com/?q=-25.2867,-57.5759',
  1,
  'Monitor Samsung 27 pulgadas',
  5.5,
  FALSE,
  0,
  'entregado',
  80000,
  0,
  'anticipado',
  '00000000-0000-4000-c002-000000000001',
  NOW() - INTERVAL '3 hours',
  CURRENT_DATE - INTERVAL '2 days'
);

INSERT INTO envios (
  tracking_number, cliente_id, cliente_nombre, origen, destino,
  destinatario_nombre, destinatario_direccion, destinatario_telefono,
  destinatario_telefono2, destinatario_cedula, destinatario_ciudad,
  destinatario_departamento, destinatario_barrio, destinatario_referencia,
  destinatario_ubicacion_url,
  cantidad, producto, peso, fragil, valor_declarado,
  estado, costo, monto_a_cobrar, tipo_pago,
  repartidor_id, repartidor_asignado_en, fecha
) VALUES (
  'GE2026' || LPAD((1007)::text, 6, '0'),
  '00000000-0000-4000-b000-000000000001',
  'TechStore Paraguay S.A.',
  'Asuncion',
  'San Lorenzo',
  'Pedro Martinez',
  'Calle 14 de Mayo 345, San Lorenzo',
  '+595971345678',
  NULL,
  '3456789',
  'San Lorenzo',
  'Central',
  'Centro',
  'A una cuadra de la plaza principal',
  'https://maps.google.com/?q=-25.3387,-57.5096',
  1,
  'Zapatillas Nike Air Max',
  1,
  FALSE,
  250000,
  'fallido',
  25000,
  250000,
  'contra_entrega',
  '00000000-0000-4000-c000-000000000001',
  NOW() - INTERVAL '2 hours',
  CURRENT_DATE - INTERVAL '3 days'
);

INSERT INTO envios (
  tracking_number, cliente_id, cliente_nombre, origen, destino,
  destinatario_nombre, destinatario_direccion, destinatario_telefono,
  destinatario_telefono2, destinatario_cedula, destinatario_ciudad,
  destinatario_departamento, destinatario_barrio, destinatario_referencia,
  destinatario_ubicacion_url,
  cantidad, producto, peso, fragil, valor_declarado,
  estado, costo, monto_a_cobrar, tipo_pago,
  repartidor_id, repartidor_asignado_en, fecha
) VALUES (
  'GE2026' || LPAD((1008)::text, 6, '0'),
  '00000000-0000-4000-b001-000000000001',
  'Modas Express SRL',
  'Asuncion',
  'Luque',
  'Lucia Fernandez',
  'Ruta 2 Km 15, Luque',
  '+595961456789',
  '+595215554560',
  '2345678',
  'Luque',
  'Central',
  'Luque Centro',
  'Al lado del Supermercado Stock',
  NULL,
  1,
  'Perfume importado',
  0.2,
  FALSE,
  450000,
  'pendiente',
  30000,
  450000,
  'contra_entrega',
  NULL,
  NULL,
  CURRENT_DATE - INTERVAL '4 days'
);

-- Advance tracking sequence past demo data
SELECT setval('tracking_seq', 1010);

-- Eventos de envio (shipment timeline history)
INSERT INTO eventos_envio (envio_id, estado, descripcion, ubicacion, created_at)
SELECT e.id, 'pendiente', 'Envio creado y registrado en el sistema', 'Asuncion',
  NOW() - INTERVAL '2 hours'
FROM envios e WHERE e.tracking_number = 'GE2026001001';

INSERT INTO eventos_envio (envio_id, estado, descripcion, ubicacion, created_at)
SELECT e.id, 'pendiente', 'Envio creado', 'Asuncion',
  NOW() - INTERVAL '4 hours'
FROM envios e WHERE e.tracking_number = 'GE2026001002';
INSERT INTO eventos_envio (envio_id, estado, descripcion, ubicacion, created_at)
SELECT e.id, 'recolectado', 'Paquete recolectado del remitente', 'Asuncion',
  NOW() - INTERVAL '2 hours'
FROM envios e WHERE e.tracking_number = 'GE2026001002';

INSERT INTO eventos_envio (envio_id, estado, descripcion, ubicacion, created_at)
SELECT e.id, 'pendiente', 'Envio creado', 'Asuncion',
  NOW() - INTERVAL '6 hours'
FROM envios e WHERE e.tracking_number = 'GE2026001003';
INSERT INTO eventos_envio (envio_id, estado, descripcion, ubicacion, created_at)
SELECT e.id, 'recolectado', 'Paquete recolectado', 'Asuncion',
  NOW() - INTERVAL '4 hours'
FROM envios e WHERE e.tracking_number = 'GE2026001003';
INSERT INTO eventos_envio (envio_id, estado, descripcion, ubicacion, created_at)
SELECT e.id, 'en_transito', 'En camino hacia destino', 'Asuncion',
  NOW() - INTERVAL '2 hours'
FROM envios e WHERE e.tracking_number = 'GE2026001003';

INSERT INTO eventos_envio (envio_id, estado, descripcion, ubicacion, created_at)
SELECT e.id, 'pendiente', 'Envio creado', 'Asuncion',
  NOW() - INTERVAL '8 hours'
FROM envios e WHERE e.tracking_number = 'GE2026001004';
INSERT INTO eventos_envio (envio_id, estado, descripcion, ubicacion, created_at)
SELECT e.id, 'recolectado', 'Paquete recolectado', 'Asuncion',
  NOW() - INTERVAL '6 hours'
FROM envios e WHERE e.tracking_number = 'GE2026001004';
INSERT INTO eventos_envio (envio_id, estado, descripcion, ubicacion, created_at)
SELECT e.id, 'en_transito', 'En transito', 'Asuncion',
  NOW() - INTERVAL '4 hours'
FROM envios e WHERE e.tracking_number = 'GE2026001004';
INSERT INTO eventos_envio (envio_id, estado, descripcion, ubicacion, created_at)
SELECT e.id, 'en_reparto', 'Repartidor en camino al destinatario', 'Asuncion',
  NOW() - INTERVAL '2 hours'
FROM envios e WHERE e.tracking_number = 'GE2026001004';

INSERT INTO eventos_envio (envio_id, estado, descripcion, ubicacion, created_at)
SELECT e.id, 'pendiente', 'Envio creado', 'Asuncion',
  NOW() - INTERVAL '10 hours'
FROM envios e WHERE e.tracking_number = 'GE2026001005';
INSERT INTO eventos_envio (envio_id, estado, descripcion, ubicacion, created_at)
SELECT e.id, 'recolectado', 'Recolectado', 'Asuncion',
  NOW() - INTERVAL '8 hours'
FROM envios e WHERE e.tracking_number = 'GE2026001005';
INSERT INTO eventos_envio (envio_id, estado, descripcion, ubicacion, created_at)
SELECT e.id, 'en_transito', 'En transito', 'Asuncion',
  NOW() - INTERVAL '6 hours'
FROM envios e WHERE e.tracking_number = 'GE2026001005';
INSERT INTO eventos_envio (envio_id, estado, descripcion, ubicacion, created_at)
SELECT e.id, 'en_reparto', 'En reparto', 'Asuncion',
  NOW() - INTERVAL '4 hours'
FROM envios e WHERE e.tracking_number = 'GE2026001005';
INSERT INTO eventos_envio (envio_id, estado, descripcion, ubicacion, created_at)
SELECT e.id, 'entregado', 'Entregado exitosamente al destinatario', 'Asuncion',
  NOW() - INTERVAL '2 hours'
FROM envios e WHERE e.tracking_number = 'GE2026001005';

INSERT INTO eventos_envio (envio_id, estado, descripcion, ubicacion, created_at)
SELECT e.id, 'pendiente', 'Envio creado', 'Asuncion',
  NOW() - INTERVAL '10 hours'
FROM envios e WHERE e.tracking_number = 'GE2026001006';
INSERT INTO eventos_envio (envio_id, estado, descripcion, ubicacion, created_at)
SELECT e.id, 'recolectado', 'Recolectado', 'Asuncion',
  NOW() - INTERVAL '8 hours'
FROM envios e WHERE e.tracking_number = 'GE2026001006';
INSERT INTO eventos_envio (envio_id, estado, descripcion, ubicacion, created_at)
SELECT e.id, 'en_transito', 'En transito', 'Asuncion',
  NOW() - INTERVAL '6 hours'
FROM envios e WHERE e.tracking_number = 'GE2026001006';
INSERT INTO eventos_envio (envio_id, estado, descripcion, ubicacion, created_at)
SELECT e.id, 'en_reparto', 'En reparto', 'Asuncion',
  NOW() - INTERVAL '4 hours'
FROM envios e WHERE e.tracking_number = 'GE2026001006';
INSERT INTO eventos_envio (envio_id, estado, descripcion, ubicacion, created_at)
SELECT e.id, 'entregado', 'Entregado exitosamente al destinatario', 'Asuncion',
  NOW() - INTERVAL '2 hours'
FROM envios e WHERE e.tracking_number = 'GE2026001006';

INSERT INTO eventos_envio (envio_id, estado, descripcion, ubicacion, created_at)
SELECT e.id, 'pendiente', 'Envio creado', 'Asuncion',
  NOW() - INTERVAL '10 hours'
FROM envios e WHERE e.tracking_number = 'GE2026001007';
INSERT INTO eventos_envio (envio_id, estado, descripcion, ubicacion, created_at)
SELECT e.id, 'recolectado', 'Recolectado', 'Asuncion',
  NOW() - INTERVAL '8 hours'
FROM envios e WHERE e.tracking_number = 'GE2026001007';
INSERT INTO eventos_envio (envio_id, estado, descripcion, ubicacion, created_at)
SELECT e.id, 'en_transito', 'En transito', 'Asuncion',
  NOW() - INTERVAL '6 hours'
FROM envios e WHERE e.tracking_number = 'GE2026001007';
INSERT INTO eventos_envio (envio_id, estado, descripcion, ubicacion, created_at)
SELECT e.id, 'en_reparto', 'En reparto', 'Asuncion',
  NOW() - INTERVAL '4 hours'
FROM envios e WHERE e.tracking_number = 'GE2026001007';
INSERT INTO eventos_envio (envio_id, estado, descripcion, ubicacion, created_at)
SELECT e.id, 'fallido', 'No se pudo entregar: destinatario ausente', 'Asuncion',
  NOW() - INTERVAL '2 hours'
FROM envios e WHERE e.tracking_number = 'GE2026001007';

INSERT INTO eventos_envio (envio_id, estado, descripcion, ubicacion, created_at)
SELECT e.id, 'pendiente', 'Envio creado y registrado en el sistema', 'Asuncion',
  NOW() - INTERVAL '2 hours'
FROM envios e WHERE e.tracking_number = 'GE2026001008';

-- Pagos para envios entregados
INSERT INTO pagos (envio_id, monto_total, monto_recibido, metodo_pago, estado_pago, fecha_pago, creado_por)
SELECT e.id, e.costo, e.costo, 'transferencia', 'pagado', CURRENT_DATE - INTERVAL '1 day', '00000000-0000-4000-a000-000000000001'
FROM envios e WHERE e.estado = 'entregado' AND e.tracking_number IN ('GE2026001005', 'GE2026001006');

-- Auditoria inicial
INSERT INTO auditoria_log (usuario, usuario_id, accion, entidad, entidad_id, descripcion)
VALUES ('Admin GoExpress', '00000000-0000-4000-a000-000000000001', 'crear', 'sistema', 'seed', 'Datos de demo cargados para presentacion');

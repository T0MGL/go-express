-- ============================================
-- GO EXPRESS: Demo Seed Data
-- Run AFTER all schema migrations (001-004)
-- Generated: 2026-03-25
-- ============================================

-- Clientes de demo
INSERT INTO clientes (id, razon_social, ruc_enc, ruc_hash, contacto_nombre_enc, contacto_cargo, telefono_enc, email_enc, email_hash, direccion_enc, ciudad, estado, plan, portal_activo, portal_status)
VALUES (
  '00000000-0000-4000-b000-000000000001',
  'TechStore Paraguay S.A.',
  'gtNYb23nDAGPGgc3SfD1Kg==:WSnxOKVmjlBBbiGtGMTFcg==:0hbB1VffuRa/gg==',
  '938574a30aa9eaf95a5ef1c38bb7a365c19f80cfe55a2d9e2857a1a63e09daa8',
  'loSA5JzvQkLSnH6Xb6ukvA==:9zqmRC0ss/iaDUbXst48Jg==:pL9BE6vVKYhZunbJ8A==',
  'Gerente de Logistica',
  'BazOYg5tpjt+faSZE2ld6g==:NsFrMFi2txCPVLWPk+ATaQ==:DxyX5nN9ZieODz9rus9H',
  'xitt+TL288VkjEbvuRpl4g==:ZoeIojnzePDAUnohAVm5BQ==:D3N3J6k3v/iix6Upz6odXEfxnTIEmkg=',
  'bf61c727358d36d1d372dc925b5fef245fc1d59f154af4faff2b5363de8d365f',
  'ncwrPZ3u7ptnOgvBHyTmcQ==:KykARFqk5D2Vj+UlWx2+tg==:UR7+HmCgxAnN4u498YlaMRbV3zWq6uOlHitToufNN/7v',
  'Asuncion',
  'activo',
  'profesional',
  FALSE,
  'sin_invitar'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO clientes (id, razon_social, ruc_enc, ruc_hash, contacto_nombre_enc, contacto_cargo, telefono_enc, email_enc, email_hash, direccion_enc, ciudad, estado, plan, portal_activo, portal_status)
VALUES (
  '00000000-0000-4000-b001-000000000001',
  'Modas Express SRL',
  'X/ODO1zh5aO52ecebfPsJw==:eM/kzTdylN/pNB0OKJ/7Zw==:ulsH4mpwR/1mAQ==',
  'a1ac0a86605581557067cd139e58b0d94146a6b30d0631968890311cf9c3b966',
  'ZUWO/6rFpU5EiFjv2apTyw==:pPWx293OhpSZfY9n67r5zQ==:ukC87mxvMgwju7L/jIk=',
  'Directora Comercial',
  '8WPWDlutQbBmlaUJkHqzMQ==:xZLG8KKafz4FAVCifE1klw==:/+HBI3ccYdBddkMUPD6s',
  'zZjdRIR+Z9DiQwKUuHMJKw==:5eH5GYHBc5bESNT5kTM6/A==:XYvTxoFuWl4kWF7eqyeoa/d1KNC/qUF2UQ==',
  '65ff81d6a565bdd6b7002f409ee80b7c89e92ecbca3cab089ad78076f0a58f81',
  'rlmnY0rB1OFH4OcCW1Cf4Q==:3Y5SbHqu9qZpW4cpjmV5uA==:lsHtWWyTKXMggfflDV3xc1QFYFB6/di6h+YuvCpOUvrEhp3d',
  'Asuncion',
  'activo',
  'basico',
  FALSE,
  'sin_invitar'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO clientes (id, razon_social, ruc_enc, ruc_hash, contacto_nombre_enc, contacto_cargo, telefono_enc, email_enc, email_hash, direccion_enc, ciudad, estado, plan, portal_activo, portal_status)
VALUES (
  '00000000-0000-4000-b002-000000000001',
  'Farmacia Central S.A.',
  'RnPoMBayFvt8M9vEOT9VSA==:8IzVvlPHAm8OpSXP2+kTbQ==:7qQGWy8O089WWw==',
  'fd666a88db0ae8d4838a76538b6924d96178a90d70e8e9be73b2b4ef584a43dc',
  'l0ZCufIy9pFjRhSe67jquQ==:/LQ87aBMIGugxw0YTR5RLA==:5EBNzho12iijspkgscSe',
  'Jefe de Despacho',
  '20PU8zUQN/div24ZAAxNUg==:JcgSiwKs5E+n230Xp+IUNw==:eSOFd+tids/8jmqCdmFr',
  '87Fdwkua+Myg2tuJmmFs+A==:5tNPqkTFbrcj+oqvq9cizg==:srw1hxY7p/H7s4ax0Y5uUs0b91Tsy0wjvKFAgAoBGw==',
  '471c142abac61302ad7ec1976de659cf089d2c78e63b08809943e257214e784c',
  'aclAtMI6eZwSiVkSODqSgQ==:ySHTRGCxL7r/cO0RRgYEsw==:a+6a40sTR5+ZvCW/PjeuWGtQ7Ouahdtbjw==',
  'Asuncion',
  'activo',
  'enterprise',
  FALSE,
  'sin_invitar'
) ON CONFLICT (id) DO NOTHING;

-- Repartidores de demo
INSERT INTO repartidores (id, nombre, telefono_enc, vehiculo, placa, licencia, estado)
VALUES (
  '00000000-0000-4000-c000-000000000001',
  'Juan Paredes',
  'OXegy6HX3J/0PcXuoIJNlA==:c6zVs1lS0uhcTE/m5gAJUg==:5dJfqtQB+T726Pq3fYTU',
  'Moto',
  'ABC-123',
  'LIC-001',
  'activo'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO repartidores (id, nombre, telefono_enc, vehiculo, placa, licencia, estado)
VALUES (
  '00000000-0000-4000-c001-000000000001',
  'Diego Villalba',
  'fdfu1WLN7tByt53BEcQbng==:Sl/Ft33PaCrJfkWqasu1fA==:JM6RcjhI5vLJ4cuebr1Q',
  'Auto',
  'DEF-456',
  'LIC-002',
  'activo'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO repartidores (id, nombre, telefono_enc, vehiculo, placa, licencia, estado)
VALUES (
  '00000000-0000-4000-c002-000000000001',
  'Fernando Caceres',
  'VWpVEfr2x4NCK65ww6FWVw==:tzgNeSBBSLYgeK43wxHI9Q==:kTax+vNoTufduUcHRiGg',
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
  destinatario_nombre_enc, destinatario_direccion_enc, destinatario_telefono_enc,
  destinatario_telefono2_enc, destinatario_cedula_enc, destinatario_ciudad,
  destinatario_departamento, destinatario_barrio, destinatario_referencia_enc,
  destinatario_ubicacion_url, destinatario_nombre_search, destinatario_telefono_hash,
  cantidad, producto, peso, fragil, valor_declarado,
  estado, costo, monto_a_cobrar, tipo_pago,
  repartidor_id, repartidor_asignado_en, fecha
) VALUES (
  'GE2026' || LPAD((1001)::text, 6, '0'),
  '00000000-0000-4000-b000-000000000001',
  'TechStore Paraguay S.A.',
  'Asuncion',
  'Asuncion',
  'PN42sSSBSK81S3IEQ+SHEw==:HFBK2EK2+HwT1FhW7gbPlw==:/nlJxOtT8cj6ZyM9SQ==',
  'FYLHV0E8+GD2r1vgsGiWUg==:G2zf6E/sE8MBbw+VQeafjA==:moy+LKEnOj62hrafcm0I7uqhjpzrZQ==',
  'T7n62JBAzdynTpB34SuLbg==:cp5WD1CY6Kdl2Y4h0pAvUA==:3CS1QAhqwONn1bE2yyMI',
  'uZ1+I7N6nG3TfWMEEziUFg==:j0ShDdstnHRhHFYS+retMA==:pG+yKRGu2IG9Gb6kLkQ=',
  '+IxFAGFC6qzUbTj5SV5jeA==:xB4yQkB7q57wU1uqVCL7Jw==:G9ifsyCWEp3G',
  'Asuncion',
  'Central',
  'Villa Morra',
  'Hx6stxARMtlNJaMDRb++xA==:eD5XT1hYr4tLcrRhukOOVw==:8T/6zq6/LV+jw0Hc6IfN9KfoCWm7zddzBwCTTw==',
  'https://maps.google.com/?q=-25.2867,-57.5759',
  'ana ruiz diaz',
  '361e47e3f00fa8e46a6241e47e110c39c606786e3ec95ca6b3bb5fff583331ef',
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
  destinatario_nombre_enc, destinatario_direccion_enc, destinatario_telefono_enc,
  destinatario_telefono2_enc, destinatario_cedula_enc, destinatario_ciudad,
  destinatario_departamento, destinatario_barrio, destinatario_referencia_enc,
  destinatario_ubicacion_url, destinatario_nombre_search, destinatario_telefono_hash,
  cantidad, producto, peso, fragil, valor_declarado,
  estado, costo, monto_a_cobrar, tipo_pago,
  repartidor_id, repartidor_asignado_en, fecha
) VALUES (
  'GE2026' || LPAD((1002)::text, 6, '0'),
  '00000000-0000-4000-b001-000000000001',
  'Modas Express SRL',
  'Asuncion',
  'San Lorenzo',
  'C2KAPrgTG9oxFxEM26ug8Q==:j23LCNgnk+hkQGzGamTxMA==:OE9yKGzDys/88oh/g2M=',
  '60dTmQhHg/vpa5rwOxaDYQ==:olMZNjrCvST3o37Z8TsVHw==:liNtIbh/prFYLC4Vnhfn9uU+IE/AJHzhwg==',
  'xPSsAMiHsPZjFdG99rYMjA==:awHyIZ2ctzNvlh+LaIFzgA==:nPZzIil05sV2jDxKXn6b',
  NULL,
  'V12UZgJUXzhRRpYxrKYWiQ==:2WmGG6COeIssaKwnyJvAIw==:jC4I3EqpF+De',
  'San Lorenzo',
  'Central',
  'Centro',
  'i9IDXoLPVpdrw2nxHJ2N4A==:RoixxOfdj3CxvfFoUObLOg==:h5hEa7A3oILf2TFTzrxWFXlV+L9QlI8I2nvqUsbS+SKc',
  'https://maps.google.com/?q=-25.3387,-57.5096',
  'pedro martinez',
  'a95b6689c5bf513f850f9fb89528b1fe6387d66019ae1aaa962e2fb55c5e9a60',
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
  destinatario_nombre_enc, destinatario_direccion_enc, destinatario_telefono_enc,
  destinatario_telefono2_enc, destinatario_cedula_enc, destinatario_ciudad,
  destinatario_departamento, destinatario_barrio, destinatario_referencia_enc,
  destinatario_ubicacion_url, destinatario_nombre_search, destinatario_telefono_hash,
  cantidad, producto, peso, fragil, valor_declarado,
  estado, costo, monto_a_cobrar, tipo_pago,
  repartidor_id, repartidor_asignado_en, fecha
) VALUES (
  'GE2026' || LPAD((1003)::text, 6, '0'),
  '00000000-0000-4000-b002-000000000001',
  'Farmacia Central S.A.',
  'Asuncion',
  'Luque',
  'j8XFTProtts2fl5WnqlwzA==:EfChUoVKCybVhl5+sfPdBA==:M2j+iV6tklr2XXH0ZLNu',
  '1MPy7gYfy8tmg64VG76S9A==:fr0SDyQy2NHrSmRE44PCEw==:BwtTHVw3xVcXo6Mk+vT7vBkUVuxNtXvnDvsX',
  'PtzJquJUYjvCrxBsCjcYxw==:gZ3ow5JI8QdleAEu/Xy8rw==:1V7yo5IhXbol6QFGeVeA',
  'FT+XZsRQJKZQpRd/T0G1jA==:yE0EPs9oBHsXGbqFX0U/+A==:ysW0vEo3B7a9mcV6NRo=',
  'yL3GoUSeDRW3MZkZs7DlXA==:+V9XvEBhAdOXR/kj+j8oag==:fsdtfB++N/mp',
  'Luque',
  'Central',
  'Luque Centro',
  'zXhRT1E2awc2FkHKBohwyg==:ay8mcW7fDPO60JlKbqbGZA==:aSyJH5P9H8WyL+UiWN0WaiDMixI/PlXUFqFh',
  NULL,
  'lucia fernandez',
  'f089ff14866f4650ff9261567171f78f66ed85dcedd4dbe4bf98decf23eacd22',
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
  destinatario_nombre_enc, destinatario_direccion_enc, destinatario_telefono_enc,
  destinatario_telefono2_enc, destinatario_cedula_enc, destinatario_ciudad,
  destinatario_departamento, destinatario_barrio, destinatario_referencia_enc,
  destinatario_ubicacion_url, destinatario_nombre_search, destinatario_telefono_hash,
  cantidad, producto, peso, fragil, valor_declarado,
  estado, costo, monto_a_cobrar, tipo_pago,
  repartidor_id, repartidor_asignado_en, fecha
) VALUES (
  'GE2026' || LPAD((1004)::text, 6, '0'),
  '00000000-0000-4000-b000-000000000001',
  'TechStore Paraguay S.A.',
  'Asuncion',
  'Capiata',
  'ktVuHgnslNEkKCR90PL9qQ==:ZhCt4fn/9SbFld4RBZer9g==:xdPrgWASCi1lGUMHzQ==',
  'hYR+q8gDU3ce+gJ2+PfKkg==:3V+0riAc0fQCj5k/tao0EQ==:RWBBuzrlEGOA7TbzcdATs8+rk3jzMxkXdvU=',
  'mcfkAwXnauYnCCeqv9e3CQ==:RjV/wYZc3f8JbfSMnlySvA==:YqjMj4rp2FsJHBgq04Xv',
  NULL,
  'xneJcpYyVgd/0Rm6PU4d2g==:jnmARyKs9/UxNXeuYZ+Y0A==:EyKy8bxdNWz9',
  'Capiata',
  'Central',
  'Capiata Centro',
  'Iq7ZjgesxoNZKExiZ5RA6Q==:bfETKPT4ZeZ4vhm9N8Jq/A==:I2bueI9ysKLYlqk5afiLq4GxP6o7nSSG1doSXnk=',
  NULL,
  'miguel acosta',
  'da758086c231146def9bfa23496f8e339aa805fcaf574260afa41f4608cd8427',
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
  destinatario_nombre_enc, destinatario_direccion_enc, destinatario_telefono_enc,
  destinatario_telefono2_enc, destinatario_cedula_enc, destinatario_ciudad,
  destinatario_departamento, destinatario_barrio, destinatario_referencia_enc,
  destinatario_ubicacion_url, destinatario_nombre_search, destinatario_telefono_hash,
  cantidad, producto, peso, fragil, valor_declarado,
  estado, costo, monto_a_cobrar, tipo_pago,
  repartidor_id, repartidor_asignado_en, fecha
) VALUES (
  'GE2026' || LPAD((1005)::text, 6, '0'),
  '00000000-0000-4000-b001-000000000001',
  'Modas Express SRL',
  'Asuncion',
  'Lambare',
  'KanbnMgNz66OS5jSJSuHVQ==:BIAYqc4AtFSFRL0pTaIaqA==:wemstWIkd05o6BgLXA==',
  'Y7dUn/6n3y4rfcIcL5/qEQ==:N+2eUXSywBEGnv1EbYxJSw==:uuaUeSy3vDgVQBWOICsH5jDdiRotSx6vWA==',
  'gqmvSSiszGSChH0QdCOKbg==:8xebbgXKQEQXELnhnrkarA==:foixaKZJK8yqz419erIV',
  'oNRQHFi6j3yj+Y4aNuXk0g==:LXVgp/ska/fB4UvTK3yZHA==:5LVN1S3RVr2K3Xza/Gc=',
  'G1R+PhGvBs5ovH5RKOTXxg==:g3mhxo+Qw4CfoDXRMAQ5kQ==:x09dDPD7A6EK',
  'Lambare',
  'Central',
  'San Pablo',
  'yClOmfrbF/JdtuZFybT6DA==:Sll3AUm1jO+dV18sAkFXZA==:52JQvx9F7V1PkP63O1E+P4wrLdY=',
  'https://maps.google.com/?q=-25.3333,-57.6333',
  'sofia gimenez',
  '4073904ae2481e2d64e6ca38d37eea1ee5009ae97322b112fea63816a7f260d5',
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
  destinatario_nombre_enc, destinatario_direccion_enc, destinatario_telefono_enc,
  destinatario_telefono2_enc, destinatario_cedula_enc, destinatario_ciudad,
  destinatario_departamento, destinatario_barrio, destinatario_referencia_enc,
  destinatario_ubicacion_url, destinatario_nombre_search, destinatario_telefono_hash,
  cantidad, producto, peso, fragil, valor_declarado,
  estado, costo, monto_a_cobrar, tipo_pago,
  repartidor_id, repartidor_asignado_en, fecha
) VALUES (
  'GE2026' || LPAD((1006)::text, 6, '0'),
  '00000000-0000-4000-b002-000000000001',
  'Farmacia Central S.A.',
  'Asuncion',
  'Asuncion',
  'nwhVp+1c5k78eP46IKdxPQ==:ce81kzoyql9hIM4nw1psUQ==:Lb6tsZDsvzWZW2X+rA==',
  'MFvHI7igl+BKLlJYZvdnwg==:77icrML5Zs/DG/yJdSUxaQ==:wZY9SvkX7TP2TPBD8leBVJhHqlh8QQ==',
  'yfuK9atCsh+02/62u8tYXQ==:ypZeJa1gpcJeyDy4RVpuiQ==:GwQHj15seQECFKokVpAH',
  '2yJE00J97zqMgrvl1LBruQ==:AqprUT7826I5rdxuQphiSg==:lVXK0c27ugCvI8QLo/A=',
  'w5agovLD0sIrxjky37WeHA==:KFrgXdWy14M2IN3bLORTTA==:Lh8EJa/9f/Zh',
  'Asuncion',
  'Central',
  'Villa Morra',
  'mcxZBPc3dXOQhpWIjYpLFQ==:nHULbQ4eFPdCQq3g5d642A==:mLV3vFdgzeP3iBzxAJAYi/b3uI6M68RUsq5+EQ==',
  'https://maps.google.com/?q=-25.2867,-57.5759',
  'ana ruiz diaz',
  '361e47e3f00fa8e46a6241e47e110c39c606786e3ec95ca6b3bb5fff583331ef',
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
  destinatario_nombre_enc, destinatario_direccion_enc, destinatario_telefono_enc,
  destinatario_telefono2_enc, destinatario_cedula_enc, destinatario_ciudad,
  destinatario_departamento, destinatario_barrio, destinatario_referencia_enc,
  destinatario_ubicacion_url, destinatario_nombre_search, destinatario_telefono_hash,
  cantidad, producto, peso, fragil, valor_declarado,
  estado, costo, monto_a_cobrar, tipo_pago,
  repartidor_id, repartidor_asignado_en, fecha
) VALUES (
  'GE2026' || LPAD((1007)::text, 6, '0'),
  '00000000-0000-4000-b000-000000000001',
  'TechStore Paraguay S.A.',
  'Asuncion',
  'San Lorenzo',
  'pjOpa8vaxT+x7Ovga3wp1A==:QEnvcdKHuFBCyxyAjpqDhg==:muARqoBnDEOOnXVNS74=',
  'F+SM/vWR4kE6o4oMZrPBsA==:T41ef9nMcQg8bzglO3Lx7g==:24XPqJediTVZ/6dQTS3Pj8r68J3rgBEHtQ==',
  '4G9P07mI3xcFI59FZ0DhQA==:GbC+rvwugX6YLjvgOfUgUQ==:p9DmNisFnlD/iszz7DD8',
  NULL,
  '6xw7AbIzo2BfRRU96Zg2uw==:6ouet2MaPpnsKrIUNiMUbQ==:JzV6iHi27zPs',
  'San Lorenzo',
  'Central',
  'Centro',
  'JUQwkk5nvBfP64drp3F9yg==:dRuw3U2Nrfi4YaLq+iBpZA==:ed9gVWu0J0Km/wHmzGMuw0KvDo4kzytIsggOyL7jcP49',
  'https://maps.google.com/?q=-25.3387,-57.5096',
  'pedro martinez',
  'a95b6689c5bf513f850f9fb89528b1fe6387d66019ae1aaa962e2fb55c5e9a60',
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
  destinatario_nombre_enc, destinatario_direccion_enc, destinatario_telefono_enc,
  destinatario_telefono2_enc, destinatario_cedula_enc, destinatario_ciudad,
  destinatario_departamento, destinatario_barrio, destinatario_referencia_enc,
  destinatario_ubicacion_url, destinatario_nombre_search, destinatario_telefono_hash,
  cantidad, producto, peso, fragil, valor_declarado,
  estado, costo, monto_a_cobrar, tipo_pago,
  repartidor_id, repartidor_asignado_en, fecha
) VALUES (
  'GE2026' || LPAD((1008)::text, 6, '0'),
  '00000000-0000-4000-b001-000000000001',
  'Modas Express SRL',
  'Asuncion',
  'Luque',
  'rmZdU32B90iU4hyFq6ndbg==:6/fbgNtnTj8IvIVc9WHf9w==:nf5hUsin6MUePqcnqDc4',
  '9di79db/OgL+fAgk8RkrzA==:jm0bSGjYldu8wZWGZjCNvg==:9RiJnzdjw/RUVSsZb5Ns/vMcSpQFJtnZ6HLY',
  'icbhcoKW1q6Z2AbITiKyHA==:3hqgcR5KwIyZkWX89+0Ebg==:zRSpfArUzV27c+pTWOl4',
  'b7ud/NNvzb2KyyojueQ9FA==:6emaj/cW/QUXenOojVHJYg==:W8QnXURykUvZJAUkuQE=',
  'eFgtLFtTXYEwuv7mpH4ldg==:grKq+8eKMooLStTDI+qZcQ==:YTAa/kJ9wEfK',
  'Luque',
  'Central',
  'Luque Centro',
  '5bwzcEyc8iwQHNRI9AdBfA==:vwy0nQEDsQhvoxDSOAQs5w==:LlkERat9HgVaYiMtz8hUsl7mDNs9FmSafKAH',
  NULL,
  'lucia fernandez',
  'f089ff14866f4650ff9261567171f78f66ed85dcedd4dbe4bf98decf23eacd22',
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

-- Done. Demo data loaded successfully.

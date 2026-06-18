-- 033_repro_prod_begin_rollback.sql
-- Verificacion contra prod de que CRITICA 1, 2, 3 NO se reproducen tras aplicar 033, mas el
-- caso reverso-sobre-limite (anular un pago que re-incrementa deuda por encima del limite).
-- Tecnica: todo dentro de BEGIN ... ROLLBACK con datos descartables. Prod queda intacto.
-- Cada caso vive en su SAVEPOINT y AUTO-VERIFICA con RAISE EXCEPTION: si el comportamiento
-- esperado NO ocurre, el script falla en vez de depender de inspeccion visual.
--
-- CONEXION: la password viva esta en Railway (no en .env, que tiene la rotada). El host
-- db.<ref>.supabase.co es IPv6-only e inalcanzable desde algunas redes: usar el POOLER en
-- SESSION mode:
--   postgresql://postgres.<ref>:<PASSWORD>@aws-1-us-east-1.pooler.supabase.com:5432/postgres
--   psql "$PGURL" -f sql/033_repro_prod_begin_rollback.sql

\set ON_ERROR_STOP 0
BEGIN;

\echo '=== sembrar datos descartables (cliente CC, limite 0) ==='
INSERT INTO clientes (razon_social, ruc, contacto_nombre, telefono, email, direccion, ciudad, estado, limite_credito)
VALUES ('ZZ_REPRO_CC','99999999-9','Repro','+595981000000','zz_repro_cc@descartable.local','x','Asuncion','activo',0)
RETURNING id \gset cc_

INSERT INTO envios (tracking_number, cliente_id, cliente_nombre, origen, destino, destinatario_nombre,
  destinatario_direccion, destinatario_telefono, destinatario_ciudad, destinatario_departamento,
  cantidad, peso, fragil, valor_declarado, estado, costo, monto_a_cobrar, tipo_pago,
  seguro_adicional, costo_seguro, tags, fecha)
VALUES ('ZZ-REPRO-CC-1', :'cc_id', 'ZZ_REPRO_CC','Asuncion','Asuncion','Test','x','+595981111111',
  'Asuncion','Central',1,1,false,0,'pendiente',24000,0,'cuenta_corriente',false,0,'{}','2026-06-09')
RETURNING id \gset env_

DO $$ BEGIN
  IF (SELECT saldo_cuenta_corriente FROM clientes WHERE razon_social='ZZ_REPRO_CC') <> 24000 THEN
    RAISE EXCEPTION 'FALLO: trigger debito no asento 24000';
  END IF;
END $$;
\echo 'saldo tras trigger debito (espera 24000):'
SELECT saldo_cuenta_corriente FROM clientes WHERE id=:'cc_id';

SELECT id FROM create_pago_atomico(:'env_id'::uuid,24000,24000,'transferencia','2026-06-09',NULL,NULL,
  '00000000-0000-4000-a000-000000000001','ZZ','ZZ-REPRO-CC-1',NULL,NULL) \gset pago_
\echo 'saldo tras pago credito (espera 0):'
SELECT saldo_cuenta_corriente FROM clientes WHERE id=:'cc_id';

\echo '=== CRITICA 1/2: editar monto_recibido de pago CC debe FALLAR (pago_cc_no_editable) ==='
SAVEPOINT s1;
DO $$
DECLARE v_ok BOOLEAN := FALSE;
BEGIN
  BEGIN
    PERFORM update_pago_atomico((SELECT id FROM pagos WHERE referencia IS NULL ORDER BY created_at DESC LIMIT 1),
      10000,NULL,NULL,NULL,NULL,false,false,false,false,
      '00000000-0000-4000-a000-000000000001','ZZ',NULL,NULL);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%pago_cc_no_editable%' THEN v_ok := TRUE; ELSE RAISE; END IF;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'FALLO CRITICA 1/2: editar pago CC NO fue rechazado'; END IF;
  RAISE NOTICE 'OK CRITICA 1/2: editar pago CC rechazado con pago_cc_no_editable';
END $$;
ROLLBACK TO s1;
\echo 'invariante verde tras intento (espera 0):'
SELECT count(*) AS desincronizados FROM verificar_saldo_cc();

\echo '=== anular pago CC: reverso restaura el credito EXACTO (saldo 24000) ==='
SAVEPOINT s2;
SELECT anulado FROM anular_pago_atomico(:'pago_id'::uuid,'reproduccion prod 033'::text,
  '00000000-0000-4000-a000-000000000001'::uuid,'ZZ'::text,NULL::inet,NULL::text);
SELECT saldo_cuenta_corriente AS saldo_tras_anular FROM clientes WHERE id=:'cc_id';
DO $$ BEGIN
  IF (SELECT count(*) FROM verificar_saldo_cc()) <> 0 THEN
    RAISE EXCEPTION 'FALLO: invariante desincronizado tras anular';
  END IF;
END $$;
ROLLBACK TO s2;

\echo '=== CRITICA 3: monto_total del caller != real debe FALLAR ==='
INSERT INTO clientes (razon_social, ruc, contacto_nombre, telefono, email, direccion, ciudad, estado, limite_credito)
VALUES ('ZZ_REPRO_COD','99999999-8','Repro','+595981000001','zz_repro_cod@descartable.local','x','Asuncion','activo',0)
RETURNING id \gset cod_
INSERT INTO envios (tracking_number, cliente_id, cliente_nombre, origen, destino, destinatario_nombre,
  destinatario_direccion, destinatario_telefono, destinatario_ciudad, destinatario_departamento,
  cantidad, peso, fragil, valor_declarado, estado, costo, monto_a_cobrar, tipo_pago,
  seguro_adicional, costo_seguro, tags, fecha)
VALUES ('ZZ-REPRO-COD-1', :'cod_id', 'ZZ_REPRO_COD','Asuncion','Asuncion','Test','x','+595981111112',
  'Asuncion','Central',1,1,false,0,'entregado',0,50000,'contra_entrega',false,0,'{}','2026-06-09')
RETURNING id \gset cenv_
SAVEPOINT s3;
DO $$
DECLARE v_ok BOOLEAN := FALSE;
BEGIN
  BEGIN
    PERFORM create_pago_atomico((SELECT id FROM envios WHERE tracking_number='ZZ-REPRO-COD-1'),
      5000,5000,'contra_entrega','2026-06-09',NULL,NULL,
      '00000000-0000-4000-a000-000000000001','ZZ','ZZ-REPRO-COD-1',NULL,NULL);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%pago_monto_total_invalido%' THEN v_ok := TRUE; ELSE RAISE; END IF;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'FALLO CRITICA 3: monto_total 5000 vs real 50000 NO fue rechazado'; END IF;
  RAISE NOTICE 'OK CRITICA 3: monto_total invalido rechazado';
END $$;
ROLLBACK TO s3;
\echo 'control COD happy path: monto_total correcto (50000) debe FUNCIONAR:'
SAVEPOINT s3b;
SELECT monto_total AS ok_persistido FROM create_pago_atomico(:'cenv_id'::uuid,50000,50000,'contra_entrega','2026-06-09',
  NULL,NULL,'00000000-0000-4000-a000-000000000001','ZZ','ZZ-REPRO-COD-1',NULL,NULL);
ROLLBACK TO s3b;

\echo '=== REVERSO-SOBRE-LIMITE: anular pago de cliente sobre su limite. Reverso debe PASAR (bypass TRUE) ==='
INSERT INTO clientes (razon_social, ruc, contacto_nombre, telefono, email, direccion, ciudad, estado, limite_credito)
VALUES ('ZZ_REV','99999999-6','Repro','+595981000077','zz_rev@descartable.local','x','Asuncion','activo',10000)
RETURNING id \gset r_
INSERT INTO envios (tracking_number, cliente_id, cliente_nombre, origen, destino, destinatario_nombre,
  destinatario_direccion, destinatario_telefono, destinatario_ciudad, destinatario_departamento,
  cantidad, peso, fragil, valor_declarado, estado, costo, monto_a_cobrar, tipo_pago,
  seguro_adicional, costo_seguro, tags, fecha, bypass_limite_credito)
VALUES ('ZZ-REV-1', :'r_id', 'ZZ_REV','Asuncion','Asuncion','T','x','+595981111177',
  'Asuncion','Central',1,1,false,0,'pendiente',24000,0,'cuenta_corriente',false,0,'{}','2026-06-09', TRUE)
RETURNING id \gset renv_
SELECT id FROM create_pago_atomico(:'renv_id'::uuid,24000,24000,'transferencia','2026-06-09',NULL,NULL,
  '00000000-0000-4000-a000-000000000001','ZZ','ZZ-REV-1',NULL,NULL) \gset rpago_
SAVEPOINT s4;
DO $$
BEGIN
  -- saldo 0 tras pago. Anular re-incrementa a 24000 (sobre limite 10000). Con bypass TRUE pasa.
  PERFORM anular_pago_atomico((SELECT id FROM pagos WHERE envio_id=(SELECT id FROM envios WHERE tracking_number='ZZ-REV-1')),
    'reverso sobre limite test'::text,'00000000-0000-4000-a000-000000000001'::uuid,'ZZ'::text,NULL::inet,NULL::text);
  IF (SELECT saldo_cuenta_corriente FROM clientes WHERE razon_social='ZZ_REV') <> 24000 THEN
    RAISE EXCEPTION 'FALLO REVERSO: saldo no volvio a 24000';
  END IF;
  RAISE NOTICE 'OK REVERSO-SOBRE-LIMITE: reverso paso sobre el limite (bypass TRUE), saldo 24000';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM LIKE '%limite_credito_excedido%' THEN
    RAISE EXCEPTION 'FALLO REVERSO: el reverso reboto por limite (bypass TRUE no aplicado)';
  ELSE RAISE; END IF;
END $$;
ROLLBACK TO s4;

\echo '=== invariante global final (espera 0) ==='
SELECT count(*) AS clientes_desincronizados FROM verificar_saldo_cc();

\echo '=== ROLLBACK: prod intacto ==='
ROLLBACK;

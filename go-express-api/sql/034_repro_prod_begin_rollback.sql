-- 034_repro_prod_begin_rollback.sql
-- Verificacion contra prod de que las 8 causas raiz del Paso 2 NO se reproducen tras aplicar
-- 034. Todo dentro de BEGIN ... ROLLBACK con datos descartables (prod intacto). Cada caso vive
-- en su SAVEPOINT y AUTO-VERIFICA con RAISE EXCEPTION: si el comportamiento esperado no ocurre,
-- el script ABORTA en vez de depender de inspeccion visual.
--
-- Los DO blocks resuelven ids por tracking_number/razon_social/nombre (no por :'psql_var',
-- que psql NO interpola dentro del cuerpo de un DO porque es un literal hacia el server).
--
-- CONEXION: pooler session mode. PASSWORD viva en Railway, no en disco.
--   psql "$PGURL" -f sql/034_repro_prod_begin_rollback.sql

\set ON_ERROR_STOP 1
BEGIN;

\echo '################ SEED COMUN ################'
INSERT INTO clientes (razon_social, ruc, contacto_nombre, telefono, email, direccion, ciudad, estado, limite_credito)
VALUES ('ZZ034_CC','99999999-1','Repro','+595981000010','zz034_cc@descartable.local','x','Asuncion','activo',100000000);
INSERT INTO repartidores (nombre, telefono, vehiculo, placa, estado)
VALUES ('ZZ034 Repartidor','+595981000099','Moto','ZZ034XX','activo');

-- =====================================================================================
\echo ''
\echo '################ CAUSA A.1 -- editar costo de envio CC re-debita el ledger ################'
SAVEPOINT a1;
INSERT INTO envios (tracking_number, cliente_id, cliente_nombre, origen, destino, destinatario_nombre,
  destinatario_direccion, destinatario_telefono, destinatario_ciudad, destinatario_departamento,
  cantidad, peso, fragil, valor_declarado, estado, costo, monto_a_cobrar, tipo_pago,
  seguro_adicional, costo_seguro, tags, fecha)
SELECT 'ZZ034-A1', id,'ZZ034_CC','Asuncion','Asuncion','T','x','+595981111201',
  'Asuncion','Central',1,1,false,0,'pendiente',100000,0,'cuenta_corriente',false,0,'{}','2026-06-17'
  FROM clientes WHERE razon_social='ZZ034_CC';
DO $$
DECLARE v_env UUID; v_cli UUID; v_ledger BIGINT; v_factura BIGINT; v_cache BIGINT;
BEGIN
  SELECT id, cliente_id INTO v_env, v_cli FROM envios WHERE tracking_number='ZZ034-A1';
  SELECT COALESCE(SUM(monto),0) INTO v_ledger FROM movimientos_cuenta_corriente WHERE envio_id=v_env;
  IF v_ledger <> 100000 THEN RAISE EXCEPTION 'PRECOND A1: debito inicial esperado 100000, fue %', v_ledger; END IF;
  RAISE NOTICE 'ANTES A1: factura=100000 ledger=% (cuadrado)', v_ledger;

  UPDATE envios SET costo=150000 WHERE id=v_env;

  SELECT COALESCE(SUM(monto),0) INTO v_ledger FROM movimientos_cuenta_corriente WHERE envio_id=v_env;
  SELECT costo+COALESCE(costo_seguro,0) INTO v_factura FROM envios WHERE id=v_env;
  SELECT saldo_cuenta_corriente INTO v_cache FROM clientes WHERE id=v_cli;
  RAISE NOTICE 'DESPUES A1: factura=% ledger=% cache=%', v_factura, v_ledger, v_cache;
  IF v_ledger <> v_factura THEN RAISE EXCEPTION 'FALLO A1: ledger % != factura % (bug se reproduce)', v_ledger, v_factura; END IF;
  IF v_cache <> v_ledger THEN RAISE EXCEPTION 'FALLO A1: cache % != ledger %', v_cache, v_ledger; END IF;
  IF (SELECT count(*) FROM verificar_saldo_cc()) <> 0 THEN RAISE EXCEPTION 'FALLO A1: invariante saldo desincronizado'; END IF;
  RAISE NOTICE 'OK A1: editar costo 100000->150000 re-debito al delta (+50000), ledger==factura==150000, invariante verde';
END $$;
ROLLBACK TO a1;

\echo ''
\echo '################ CAUSA A.2 -- soft-delete de envio CC reversa el debito ################'
SAVEPOINT a2;
INSERT INTO envios (tracking_number, cliente_id, cliente_nombre, origen, destino, destinatario_nombre,
  destinatario_direccion, destinatario_telefono, destinatario_ciudad, destinatario_departamento,
  cantidad, peso, fragil, valor_declarado, estado, costo, monto_a_cobrar, tipo_pago,
  seguro_adicional, costo_seguro, tags, fecha)
SELECT 'ZZ034-A2', id,'ZZ034_CC','Asuncion','Asuncion','T','x','+595981111202',
  'Asuncion','Central',1,1,false,0,'pendiente',100000,0,'cuenta_corriente',false,20000,'{}','2026-06-17'
  FROM clientes WHERE razon_social='ZZ034_CC';
DO $$
DECLARE v_env UUID; v_ledger BIGINT;
BEGIN
  SELECT id INTO v_env FROM envios WHERE tracking_number='ZZ034-A2';
  SELECT COALESCE(SUM(monto),0) INTO v_ledger FROM movimientos_cuenta_corriente WHERE envio_id=v_env;
  IF v_ledger <> 120000 THEN RAISE EXCEPTION 'PRECOND A2: debito inicial esperado 120000, fue %', v_ledger; END IF;
  RAISE NOTICE 'ANTES A2: debito vivo=120000';

  UPDATE envios SET eliminado=true, eliminado_en=NOW() WHERE id=v_env;

  SELECT COALESCE(SUM(monto),0) INTO v_ledger FROM movimientos_cuenta_corriente WHERE envio_id=v_env;
  RAISE NOTICE 'DESPUES A2: ledger neto del envio=% (espera 0)', v_ledger;
  IF v_ledger <> 0 THEN RAISE EXCEPTION 'FALLO A2: debito fantasma de % tras soft-delete', v_ledger; END IF;
  IF (SELECT count(*) FROM verificar_saldo_cc()) <> 0 THEN RAISE EXCEPTION 'FALLO A2: invariante saldo desincronizado'; END IF;
  RAISE NOTICE 'OK A2: soft-delete reverso el debito completo (deuda fantasma cerrada), invariante verde';
END $$;
ROLLBACK TO a2;

\echo ''
\echo '################ CAUSA C -- envio CC costo 0 tasado a positivo debita ################'
SAVEPOINT c1;
INSERT INTO envios (tracking_number, cliente_id, cliente_nombre, origen, destino, destinatario_nombre,
  destinatario_direccion, destinatario_telefono, destinatario_ciudad, destinatario_departamento,
  cantidad, peso, fragil, valor_declarado, estado, costo, monto_a_cobrar, tipo_pago,
  seguro_adicional, costo_seguro, tags, fecha)
SELECT 'ZZ034-C1', id,'ZZ034_CC','Asuncion','Asuncion','T','x','+595981111203',
  'Asuncion','Central',1,1,false,0,'pendiente',0,0,'cuenta_corriente',false,0,'{}','2026-06-17'
  FROM clientes WHERE razon_social='ZZ034_CC';
DO $$
DECLARE v_env UUID; v_ledger BIGINT;
BEGIN
  SELECT id INTO v_env FROM envios WHERE tracking_number='ZZ034-C1';
  SELECT COALESCE(SUM(monto),0) INTO v_ledger FROM movimientos_cuenta_corriente WHERE envio_id=v_env;
  RAISE NOTICE 'ANTES C: costo=0 ledger=% (sin debito, correcto)', v_ledger;
  UPDATE envios SET costo=40000 WHERE id=v_env;
  SELECT COALESCE(SUM(monto),0) INTO v_ledger FROM movimientos_cuenta_corriente WHERE envio_id=v_env;
  RAISE NOTICE 'DESPUES C: costo=40000 ledger=% (espera 40000)', v_ledger;
  IF v_ledger <> 40000 THEN RAISE EXCEPTION 'FALLO C: tasar costo 0->40000 no debito (ledger %)', v_ledger; END IF;
  RAISE NOTICE 'OK C: tasar un envio de costo 0 a 40000 asienta el debito (no hay envio gratis silencioso)';
END $$;
ROLLBACK TO c1;

\echo ''
\echo '################ CAUSA F.1 -- ledger inmutable: UPDATE/DELETE directo RECHAZADO ################'
SAVEPOINT f1;
INSERT INTO envios (tracking_number, cliente_id, cliente_nombre, origen, destino, destinatario_nombre,
  destinatario_direccion, destinatario_telefono, destinatario_ciudad, destinatario_departamento,
  cantidad, peso, fragil, valor_declarado, estado, costo, monto_a_cobrar, tipo_pago,
  seguro_adicional, costo_seguro, tags, fecha)
SELECT 'ZZ034-F1', id,'ZZ034_CC','Asuncion','Asuncion','T','x','+595981111204',
  'Asuncion','Central',1,1,false,0,'pendiente',50000,0,'cuenta_corriente',false,0,'{}','2026-06-17'
  FROM clientes WHERE razon_social='ZZ034_CC';
DO $$
DECLARE v_ok_upd BOOLEAN:=FALSE; v_ok_del BOOLEAN:=FALSE; v_mov UUID;
BEGIN
  SELECT m.id INTO v_mov FROM movimientos_cuenta_corriente m
    JOIN envios e ON e.id=m.envio_id WHERE e.tracking_number='ZZ034-F1' AND m.tipo='debito';
  BEGIN UPDATE movimientos_cuenta_corriente SET monto=1 WHERE id=v_mov;
  EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE '%ledger_append_only%' THEN v_ok_upd:=TRUE; ELSE RAISE; END IF; END;
  BEGIN DELETE FROM movimientos_cuenta_corriente WHERE id=v_mov;
  EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE '%ledger_append_only%' THEN v_ok_del:=TRUE; ELSE RAISE; END IF; END;
  IF NOT v_ok_upd THEN RAISE EXCEPTION 'FALLO F1: UPDATE directo del ledger NO fue rechazado'; END IF;
  IF NOT v_ok_del THEN RAISE EXCEPTION 'FALLO F1: DELETE directo del ledger NO fue rechazado'; END IF;
  RAISE NOTICE 'OK F1: UPDATE y DELETE directos sobre movimientos_cuenta_corriente rechazados (ledger_append_only)';
END $$;
ROLLBACK TO f1;

\echo ''
\echo '################ CAUSA F.2 -- DELETE de pago RECHAZADO a nivel DB ################'
SAVEPOINT f2;
INSERT INTO envios (tracking_number, cliente_id, cliente_nombre, origen, destino, destinatario_nombre,
  destinatario_direccion, destinatario_telefono, destinatario_ciudad, destinatario_departamento,
  cantidad, peso, fragil, valor_declarado, estado, costo, monto_a_cobrar, tipo_pago,
  seguro_adicional, costo_seguro, tags, fecha)
SELECT 'ZZ034-F2', id,'ZZ034_CC','Asuncion','Asuncion','T','x','+595981111205',
  'Asuncion','Central',1,1,false,0,'pendiente',80000,0,'cuenta_corriente',false,0,'{}','2026-06-17'
  FROM clientes WHERE razon_social='ZZ034_CC';
DO $$
DECLARE v_env UUID; v_pago UUID; v_ok BOOLEAN:=FALSE;
BEGIN
  SELECT id INTO v_env FROM envios WHERE tracking_number='ZZ034-F2';
  SELECT id INTO v_pago FROM create_pago_atomico(v_env,80000,80000,'transferencia','2026-06-17',NULL,NULL,
    '00000000-0000-4000-a000-000000000001','ZZ','ZZ034-F2',NULL,NULL);
  BEGIN DELETE FROM pagos WHERE id=v_pago;
  EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE '%pago_no_eliminable%' THEN v_ok:=TRUE; ELSE RAISE; END IF; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'FALLO F2: DELETE de pago NO fue rechazado'; END IF;
  RAISE NOTICE 'OK F2: DELETE fisico de pago rechazado (pago_no_eliminable); credito del ledger no se puede orfanar';
END $$;
ROLLBACK TO f2;

\echo ''
\echo '################ CAUSA F.3 -- doble credito por pago IMPOSIBLE (UNIQUE) ################'
SAVEPOINT f3;
INSERT INTO envios (tracking_number, cliente_id, cliente_nombre, origen, destino, destinatario_nombre,
  destinatario_direccion, destinatario_telefono, destinatario_ciudad, destinatario_departamento,
  cantidad, peso, fragil, valor_declarado, estado, costo, monto_a_cobrar, tipo_pago,
  seguro_adicional, costo_seguro, tags, fecha)
SELECT 'ZZ034-F3', id,'ZZ034_CC','Asuncion','Asuncion','T','x','+595981111206',
  'Asuncion','Central',1,1,false,0,'pendiente',60000,0,'cuenta_corriente',false,0,'{}','2026-06-17'
  FROM clientes WHERE razon_social='ZZ034_CC';
DO $$
DECLARE v_env UUID; v_cli UUID; v_pago UUID; v_ok BOOLEAN:=FALSE;
BEGIN
  SELECT id, cliente_id INTO v_env, v_cli FROM envios WHERE tracking_number='ZZ034-F3';
  SELECT id INTO v_pago FROM create_pago_atomico(v_env,60000,60000,'transferencia','2026-06-17',NULL,NULL,
    '00000000-0000-4000-a000-000000000001','ZZ','ZZ034-F3',NULL,NULL);
  BEGIN
    INSERT INTO movimientos_cuenta_corriente (cliente_id, envio_id, pago_id, tipo, monto, saldo_posterior, descripcion, creado_por)
    VALUES (v_cli, v_env, v_pago, 'credito', -60000, 0, 'doble credito ilegal', '00000000-0000-4000-a000-000000000001');
  EXCEPTION WHEN unique_violation THEN v_ok:=TRUE; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'FALLO F3: doble credito por pago NO fue rechazado'; END IF;
  RAISE NOTICE 'OK F3: segundo credito para el mismo pago rechazado por UNIQUE (movcc_un_credito_por_pago)';
END $$;
ROLLBACK TO f3;

\echo ''
\echo '################ CAUSA E -- update_pago_atomico topa COD por monto_a_cobrar ################'
SAVEPOINT e1;
INSERT INTO clientes (razon_social, ruc, contacto_nombre, telefono, email, direccion, ciudad, estado, limite_credito)
VALUES ('ZZ034_E','99999999-2','Repro','+595981000020','zz034_e@descartable.local','x','Asuncion','activo',0);
INSERT INTO envios (tracking_number, cliente_id, cliente_nombre, origen, destino, destinatario_nombre,
  destinatario_direccion, destinatario_telefono, destinatario_ciudad, destinatario_departamento,
  cantidad, peso, fragil, valor_declarado, estado, costo, monto_a_cobrar, tipo_pago,
  seguro_adicional, costo_seguro, tags, fecha)
SELECT 'ZZ034-E1', id,'ZZ034_E','Asuncion','Asuncion','T','x','+595981111210',
  'Asuncion','Central',1,1,false,0,'entregado',30000,100000,'contra_entrega',false,0,'{}','2026-06-17'
  FROM clientes WHERE razon_social='ZZ034_E';
DO $$
DECLARE v_env UUID; v_pago UUID; v_estado estado_pago;
BEGIN
  SELECT id INTO v_env FROM envios WHERE tracking_number='ZZ034-E1';
  SELECT id INTO v_pago FROM create_pago_atomico(v_env,100000,70000,'contra_entrega','2026-06-17',NULL,NULL,
    '00000000-0000-4000-a000-000000000001','ZZ','ZZ034-E1',NULL,NULL);
  -- bajar a 50000 (>= costo 30000 pero < monto_a_cobrar 100000): NO debe quedar 'pagado'
  PERFORM update_pago_atomico(v_pago,50000,NULL,NULL,NULL,NULL,false,false,false,false,
    '00000000-0000-4000-a000-000000000001','ZZ',NULL,NULL);
  SELECT estado_pago INTO v_estado FROM pagos WHERE id=v_pago;
  RAISE NOTICE 'DESPUES E (editar a 50000 de un COD 100000): estado=% (espera pago_parcial)', v_estado;
  IF v_estado = 'pagado' THEN RAISE EXCEPTION 'FALLO E: COD 100000 cobrado 50000 quedo pagado (bug se reproduce)'; END IF;
  -- subir a 95000 (<= monto_a_cobrar 100000, > costo 30000): AHORA debe ser PERMITIDO
  BEGIN
    PERFORM update_pago_atomico(v_pago,95000,NULL,NULL,NULL,NULL,false,false,false,false,
      '00000000-0000-4000-a000-000000000001','ZZ',NULL,NULL);
  EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'FALLO E: correccion legitima a 95000 fue rechazada: %', SQLERRM; END;
  SELECT estado_pago INTO v_estado FROM pagos WHERE id=v_pago;
  RAISE NOTICE 'OK E: correccion a 95000 permitida (estado=%), tope COD = monto_a_cobrar 100000', v_estado;
END $$;
ROLLBACK TO e1;

\echo ''
\echo '################ CAUSA G.1/G.2 -- editar/anular pago de liquidacion CERRADA RECHAZADO ################'
SAVEPOINT g1;
INSERT INTO clientes (razon_social, ruc, contacto_nombre, telefono, email, direccion, ciudad, estado, limite_credito)
VALUES ('ZZ034_G','99999999-3','Repro','+595981000030','zz034_g@descartable.local','x','Asuncion','activo',0);
INSERT INTO envios (tracking_number, cliente_id, cliente_nombre, origen, destino, destinatario_nombre,
  destinatario_direccion, destinatario_telefono, destinatario_ciudad, destinatario_departamento,
  cantidad, peso, fragil, valor_declarado, estado, costo, monto_a_cobrar, tipo_pago,
  seguro_adicional, costo_seguro, tags, fecha, repartidor_id, fecha_entrega_real)
SELECT 'ZZ034-G1', c.id,'ZZ034_G','Asuncion','Asuncion','T','x','+595981111220',
  'Asuncion','Central',1,1,false,0,'entregado',30000,100000,'contra_entrega',false,0,'{}','2026-06-17',
  r.id, '2026-06-17 12:00:00-04'
  FROM clientes c, repartidores r WHERE c.razon_social='ZZ034_G' AND r.nombre='ZZ034 Repartidor';
DO $$
DECLARE v_env UUID; v_rep UUID; v_pago UUID; v_liq UUID; v_estado_liq TEXT;
        v_ok_edit BOOLEAN:=FALSE; v_ok_anul BOOLEAN:=FALSE;
BEGIN
  SELECT id, repartidor_id INTO v_env, v_rep FROM envios WHERE tracking_number='ZZ034-G1';
  SELECT id INTO v_pago FROM create_pago_atomico(v_env,100000,100000,'contra_entrega','2026-06-17',NULL,NULL,
    '00000000-0000-4000-a000-000000000001','ZZ','ZZ034-G1',NULL,NULL);
  SELECT id INTO v_liq FROM crear_liquidacion(v_rep,'2026-06-17','2026-06-17',
    '00000000-0000-4000-a000-000000000001','ZZ',NULL,NULL);
  PERFORM cerrar_liquidacion(v_liq,100000,NULL,'00000000-0000-4000-a000-000000000001','ZZ',NULL,NULL);
  SELECT estado::text INTO v_estado_liq FROM liquidaciones_repartidor WHERE id=v_liq;
  RAISE NOTICE 'ANTES G: liquidacion estado=% (cerrada)', v_estado_liq;
  BEGIN
    PERFORM update_pago_atomico(v_pago,30000,NULL,NULL,NULL,NULL,false,false,false,false,
      '00000000-0000-4000-a000-000000000001','ZZ',NULL,NULL);
  EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE '%pago_en_liquidacion_cerrada%' THEN v_ok_edit:=TRUE; ELSE RAISE; END IF; END;
  BEGIN
    PERFORM anular_pago_atomico(v_pago,'intento anular liquidado',
      '00000000-0000-4000-a000-000000000001'::uuid,'ZZ',NULL,NULL);
  EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE '%pago_en_liquidacion_cerrada%' THEN v_ok_anul:=TRUE; ELSE RAISE; END IF; END;
  IF NOT v_ok_edit THEN RAISE EXCEPTION 'FALLO G1: editar pago de liquidacion cerrada NO fue rechazado'; END IF;
  IF NOT v_ok_anul THEN RAISE EXCEPTION 'FALLO G2: anular pago de liquidacion cerrada NO fue rechazado'; END IF;
  RAISE NOTICE 'OK G1/G2: editar y anular pago de liquidacion cerrada rechazados (pago_en_liquidacion_cerrada)';
END $$;
ROLLBACK TO g1;

\echo ''
\echo '################ CAUSA D.2 -- crear_liquidacion EXCLUYE cod_pago_pendiente ################'
SAVEPOINT d2;
INSERT INTO clientes (razon_social, ruc, contacto_nombre, telefono, email, direccion, ciudad, estado, limite_credito)
VALUES ('ZZ034_D','99999999-4','Repro','+595981000040','zz034_d@descartable.local','x','Asuncion','activo',0);
INSERT INTO envios (tracking_number, cliente_id, cliente_nombre, origen, destino, destinatario_nombre,
  destinatario_direccion, destinatario_telefono, destinatario_ciudad, destinatario_departamento,
  cantidad, peso, fragil, valor_declarado, estado, costo, monto_a_cobrar, tipo_pago,
  seguro_adicional, costo_seguro, tags, fecha, repartidor_id, fecha_entrega_real, cod_pago_pendiente)
SELECT 'ZZ034-D2', c.id,'ZZ034_D','Asuncion','Asuncion','T','x','+595981111230',
  'Asuncion','Central',1,1,false,0,'entregado',30000,500000,'contra_entrega',false,0,'{}','2026-06-17',
  r.id, '2026-06-17 12:00:00-04', TRUE
  FROM clientes c, repartidores r WHERE c.razon_social='ZZ034_D' AND r.nombre='ZZ034 Repartidor';
DO $$
DECLARE v_env UUID; v_rep UUID; v_liq UUID; v_esperado BIGINT; v_count INT;
BEGIN
  SELECT id, repartidor_id INTO v_env, v_rep FROM envios WHERE tracking_number='ZZ034-D2';
  SELECT id, monto_total_esperado INTO v_liq, v_esperado FROM crear_liquidacion(v_rep,'2026-06-17','2026-06-17',
    '00000000-0000-4000-a000-000000000001','ZZ',NULL,NULL);
  SELECT count(*) INTO v_count FROM liquidacion_envios WHERE liquidacion_id=v_liq AND envio_id=v_env;
  RAISE NOTICE 'DESPUES D2: envio cod_pago_pendiente=true incluido? % filas, esperado=% (espera 0 / 0)', v_count, v_esperado;
  IF v_count <> 0 THEN RAISE EXCEPTION 'FALLO D2: envio con cod_pago_pendiente entro a la liquidacion'; END IF;
  IF v_esperado <> 0 THEN RAISE EXCEPTION 'FALLO D2: esperado de liquidacion incluyo el COD pendiente (% Gs)', v_esperado; END IF;
  RAISE NOTICE 'OK D2: el envio COD con cobro fallido (cod_pago_pendiente) NO entra a la liquidacion, esperado=0';
END $$;
ROLLBACK TO d2;

\echo ''
\echo '################ CAUSA D.3 -- registrar pago COD LIMPIA cod_pago_pendiente ################'
SAVEPOINT d3;
INSERT INTO clientes (razon_social, ruc, contacto_nombre, telefono, email, direccion, ciudad, estado, limite_credito)
VALUES ('ZZ034_D3','99999999-5','Repro','+595981000050','zz034_d3@descartable.local','x','Asuncion','activo',0);
INSERT INTO envios (tracking_number, cliente_id, cliente_nombre, origen, destino, destinatario_nombre,
  destinatario_direccion, destinatario_telefono, destinatario_ciudad, destinatario_departamento,
  cantidad, peso, fragil, valor_declarado, estado, costo, monto_a_cobrar, tipo_pago,
  seguro_adicional, costo_seguro, tags, fecha, cod_pago_pendiente)
SELECT 'ZZ034-D3', id,'ZZ034_D3','Asuncion','Asuncion','T','x','+595981111240',
  'Asuncion','Central',1,1,false,0,'entregado',30000,500000,'contra_entrega',false,0,'{}','2026-06-17', TRUE
  FROM clientes WHERE razon_social='ZZ034_D3';
DO $$
DECLARE v_env UUID; v_flag_antes BOOLEAN; v_flag_despues BOOLEAN; v_cobrado BIGINT;
BEGIN
  SELECT id, cod_pago_pendiente INTO v_env, v_flag_antes FROM envios WHERE tracking_number='ZZ034-D3';
  RAISE NOTICE 'ANTES D3: cod_pago_pendiente=% (true)', v_flag_antes;
  PERFORM create_pago_atomico(v_env,500000,500000,'contra_entrega','2026-06-17',NULL,NULL,
    '00000000-0000-4000-a000-000000000001','ZZ','ZZ034-D3',NULL,NULL);
  SELECT cod_pago_pendiente, monto_cobrado INTO v_flag_despues, v_cobrado FROM envios WHERE id=v_env;
  RAISE NOTICE 'DESPUES D3: cod_pago_pendiente=% monto_cobrado=% (espera false / 500000)', v_flag_despues, v_cobrado;
  IF v_flag_despues <> FALSE THEN RAISE EXCEPTION 'FALLO D3: el flag no se limpio al registrar el pago'; END IF;
  IF v_cobrado <> 500000 THEN RAISE EXCEPTION 'FALLO D3: monto_cobrado no sincronizo (%)', v_cobrado; END IF;
  RAISE NOTICE 'OK D3: registrar el pago COD limpia cod_pago_pendiente y sincroniza monto_cobrado';
END $$;
ROLLBACK TO d3;

\echo ''
\echo '################ INVARIANTE GLOBAL FINAL (espera 0 desincronizados) ################'
SELECT count(*) AS clientes_desincronizados FROM verificar_saldo_cc();

\echo ''
\echo '################ ROLLBACK FINAL: PROD INTACTO ################'
ROLLBACK;

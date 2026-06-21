-- Repro 040 contra prod, dos transacciones, ambas terminan en ROLLBACK: PROD INTACTO.
--   FASE A: con las funciones VIGENTES (sin 040), cada tamper PASA -> demuestra la vulnerabilidad.
--   FASE B: con 040 aplicada DENTRO de la misma tx, cada tamper queda BLOQUEADO y el round-trip
--           legitimo crear -> cerrar -> reabrir -> re-cerrar sigue pasando + MEDIA 7/8.
-- Datos sinteticos descartables. NO instala nada: el ROLLBACK de FASE B revierte tambien la 040.
--
-- Uso: psql ... -f sql/040_repro_prod_begin_rollback.sql
-- Esperado: NOTICEs "(correcto)" / "PASO (vulnerable...)"; cero EXCEPTION "FALLO".

\set ON_ERROR_STOP on

-- =====================================================================================
-- FASE A: ANTES (estado vigente en prod). Los tampers PASAN.
-- =====================================================================================
BEGIN;

DO $a$
DECLARE
  v_rep uuid := gen_random_uuid(); v_cli uuid := gen_random_uuid();
  v_env uuid := gen_random_uuid(); v_env2 uuid := gen_random_uuid(); v_env3 uuid := gen_random_uuid();
  v_sys uuid := '00000000-0000-4000-a000-000000000001';
  v_liq uuid; v_ok boolean;
BEGIN
  INSERT INTO repartidores (id,nombre,telefono,vehiculo,placa,eliminado)
    VALUES (v_rep,'REPRO040A Rep','0990000040','Moto','REPRO40A',FALSE);
  INSERT INTO clientes (id,razon_social,ruc,contacto_nombre,telefono,email)
    VALUES (v_cli,'REPRO040A Cli','80000040-0','Contacto','0990000140','repro040a@example.test');
  INSERT INTO envios (id,cliente_id,cliente_nombre,tracking_number,origen,destino,
    destinatario_nombre,destinatario_telefono,destinatario_direccion,destinatario_ciudad,
    peso,estado,costo,costo_seguro,monto_a_cobrar,tipo_pago,repartidor_id,fecha_entrega_real,eliminado)
    VALUES (v_env,v_cli,'REPRO040A Cli','REPRO040A','Asuncion','Asuncion',
      'Dest','0990000240','Calle 1','Asuncion',1.0,'entregado',30000,0,30000,'anticipado',v_rep,NOW(),FALSE);
  PERFORM create_pago_atomico(v_env,30000,30000,'efectivo'::metodo_pago,CURRENT_DATE,NULL,'repro',v_sys,'REPRO','REPRO040A',NULL,NULL);

  v_liq := (crear_liquidacion(v_rep,CURRENT_DATE,CURRENT_DATE,v_sys,'REPRO',NULL,NULL)).id;
  PERFORM cerrar_liquidacion(v_liq,30000,NULL,v_sys,'REPRO',NULL,NULL);

  -- CRITICA 1: INSERT de detalle conciliado=TRUE bajo liquidacion sellada.
  INSERT INTO envios (id,cliente_id,cliente_nombre,tracking_number,origen,destino,
    destinatario_nombre,destinatario_telefono,destinatario_direccion,destinatario_ciudad,
    peso,estado,costo,costo_seguro,monto_a_cobrar,tipo_pago,repartidor_id,fecha_entrega_real,eliminado)
    VALUES (v_env2,v_cli,'REPRO040A Cli','REPRO040A2','Asuncion','Asuncion',
      'Dest','0990000241','Calle 1','Asuncion',1.0,'entregado',50000,0,50000,'anticipado',v_rep,NOW(),FALSE);
  v_ok := FALSE;
  BEGIN
    INSERT INTO liquidacion_envios (liquidacion_id,envio_id,monto_esperado,monto_cobrado,conciliado)
      VALUES (v_liq,v_env2,50000,50000,TRUE);
    v_ok := TRUE;
  EXCEPTION WHEN OTHERS THEN NULL; END;
  RAISE NOTICE 'A1 CRITICA1 INSERT bajo sellado: %', CASE WHEN v_ok THEN 'PASO (vulnerable, esperado ANTES)' ELSE 'bloqueado (040 ya en prod?)' END;

  -- ALTA 3: create dejo app.pago_rpc='1'; UPDATE crudo de pago en la misma tx.
  INSERT INTO envios (id,cliente_id,cliente_nombre,tracking_number,origen,destino,
    destinatario_nombre,destinatario_telefono,destinatario_direccion,destinatario_ciudad,
    peso,estado,costo,costo_seguro,monto_a_cobrar,tipo_pago,repartidor_id,fecha_entrega_real,eliminado)
    VALUES (v_env3,v_cli,'REPRO040A Cli','REPRO040A3','Asuncion','Asuncion',
      'Dest','0990000242','Calle 1','Asuncion',1.0,'entregado',20000,0,20000,'anticipado',v_rep,NOW(),FALSE);
  PERFORM create_pago_atomico(v_env3,20000,20000,'efectivo'::metodo_pago,CURRENT_DATE,NULL,'repro',v_sys,'REPRO','REPRO040A3',NULL,NULL);
  v_ok := FALSE;
  BEGIN UPDATE pagos SET monto_recibido=1 WHERE envio_id=v_env3 AND anulado=FALSE; v_ok := TRUE;
  EXCEPTION WHEN OTHERS THEN NULL; END;
  RAISE NOTICE 'A2 ALTA3 UPDATE crudo pago tras create: %', CASE WHEN v_ok THEN 'PASO (vulnerable, esperado ANTES)' ELSE 'bloqueado (040 ya en prod?)' END;

  -- ALTA 5: UPDATE de costo con pago activo en contra_entrega (I1 no fija costo en COD, a
  -- diferencia de anticipado donde monto==costo+seguro). El guard viejo solo cubria
  -- monto_a_cobrar, asi que mover costo re-divide el split sin que nada lo frene.
  DECLARE v_envc uuid := gen_random_uuid(); v_repc uuid := gen_random_uuid();
  BEGIN
    INSERT INTO repartidores (id,nombre,telefono,vehiculo,placa,eliminado)
      VALUES (v_repc,'REPRO040A Rep5','0990000050','Moto','REPRO50A',FALSE);
    INSERT INTO envios (id,cliente_id,cliente_nombre,tracking_number,origen,destino,
      destinatario_nombre,destinatario_telefono,destinatario_direccion,destinatario_ciudad,
      peso,estado,costo,costo_seguro,monto_a_cobrar,tipo_pago,repartidor_id,fecha_entrega_real,eliminado)
      VALUES (v_envc,v_cli,'REPRO040A Cli','REPRO040A5','Asuncion','Asuncion',
        'Dest','0990000247','Calle 1','Asuncion',1.0,'entregado',30000,0,100000,'contra_entrega',v_repc,NOW(),FALSE);
    PERFORM create_pago_atomico(v_envc,100000,100000,'contra_entrega'::metodo_pago,CURRENT_DATE,NULL,'repro',v_sys,'REPRO','REPRO040A5',NULL,NULL);
    v_ok := FALSE;
    BEGIN UPDATE envios SET costo=5000 WHERE id=v_envc; v_ok := TRUE;
    EXCEPTION WHEN OTHERS THEN NULL; END;
    RAISE NOTICE 'A3 ALTA5 UPDATE costo (contra_entrega) con pago activo: %', CASE WHEN v_ok THEN 'PASO (vulnerable, esperado ANTES)' ELSE 'bloqueado (040 ya en prod?)' END;
  END;

  -- ALTA 6: UPDATE crudo que nula cerrada_en (reapertura sin auditoria).
  v_ok := FALSE;
  BEGIN
    UPDATE liquidaciones_repartidor SET estado='pendiente',cerrada_en=NULL,cerrada_por=NULL,
      monto_total_recibido=NULL,tarifa_retenida=NULL,payout_tienda=NULL,notas=NULL WHERE id=v_liq;
    v_ok := TRUE;
  EXCEPTION WHEN OTHERS THEN NULL; END;
  RAISE NOTICE 'A4 ALTA6 reapertura cruda (sin reabrir): %', CASE WHEN v_ok THEN 'PASO (vulnerable, esperado ANTES)' ELSE 'bloqueado (040 ya en prod?)' END;
END;
$a$;

ROLLBACK;


-- =====================================================================================
-- FASE B: DESPUES (040 aplicada INLINE en esta tx). Tampers BLOQUEADOS, round-trip OK.
-- Todo se revierte al ROLLBACK final: prod queda exactamente igual.
-- =====================================================================================
BEGIN;

-- --- 040 inline (cuerpo identico a 040_step6_blockers_remediation.sql, sin su BEGIN/COMMIT) ---

CREATE OR REPLACE FUNCTION public.trg_liquidacion_envios_inmutable_fn()
 RETURNS trigger LANGUAGE plpgsql AS $f$
DECLARE v_cerrada_en timestamptz; v_liq_id uuid;
BEGIN
  v_liq_id := CASE WHEN TG_OP='DELETE' THEN OLD.liquidacion_id ELSE NEW.liquidacion_id END;
  SELECT cerrada_en INTO v_cerrada_en FROM public.liquidaciones_repartidor WHERE id=v_liq_id;
  IF v_cerrada_en IS NULL THEN RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END; END IF;
  IF TG_OP='UPDATE' AND OLD.conciliado=FALSE AND NEW.conciliado=TRUE
     AND NEW.monto_esperado IS NOT DISTINCT FROM OLD.monto_esperado
     AND NEW.monto_cobrado  IS NOT DISTINCT FROM OLD.monto_cobrado
     AND NEW.envio_id = OLD.envio_id AND NEW.liquidacion_id = OLD.liquidacion_id
  THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'liquidacion_envios_inmutable: detalle del envio % en liquidacion sellada %',
    CASE WHEN TG_OP='DELETE' THEN OLD.envio_id ELSE NEW.envio_id END, v_liq_id USING ERRCODE='P0001';
END; $f$;
DROP TRIGGER IF EXISTS trg_liquidacion_envios_inmutable ON public.liquidacion_envios;
CREATE TRIGGER trg_liquidacion_envios_inmutable
  BEFORE INSERT OR UPDATE OR DELETE ON public.liquidacion_envios
  FOR EACH ROW EXECUTE FUNCTION public.trg_liquidacion_envios_inmutable_fn();

CREATE OR REPLACE FUNCTION public.trg_liquidacion_inmutable_fn()
 RETURNS trigger LANGUAGE plpgsql AS $f$
BEGIN
  IF TG_OP='DELETE' THEN
    IF OLD.cerrada_en IS NOT NULL THEN
      RAISE EXCEPTION 'liquidacion_cerrada_inmutable: no se elimina la cerrada %', OLD.id USING ERRCODE='P0001';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.cerrada_en IS NOT NULL AND NEW.cerrada_en IS NOT NULL THEN
    RAISE EXCEPTION 'liquidacion_cerrada_inmutable: cerrada % solo via reabrir', OLD.id USING ERRCODE='P0001';
  END IF;
  IF OLD.cerrada_en IS NOT NULL AND NEW.cerrada_en IS NULL
     AND current_setting('app.reabrir_rpc', true) IS DISTINCT FROM '1' THEN
    RAISE EXCEPTION 'liquidacion_reapertura_invalida: solo via reabrir_liquidacion' USING ERRCODE='P0001';
  END IF;
  RETURN NEW;
END; $f$;
DROP TRIGGER IF EXISTS trg_liquidacion_inmutable ON public.liquidaciones_repartidor;
CREATE TRIGGER trg_liquidacion_inmutable
  BEFORE UPDATE OR DELETE ON public.liquidaciones_repartidor
  FOR EACH ROW EXECUTE FUNCTION public.trg_liquidacion_inmutable_fn();

-- reabrir_liquidacion con la GUC (cuerpo igual a 040)
CREATE OR REPLACE FUNCTION public.reabrir_liquidacion(p_liquidacion_id uuid, p_motivo text, p_actor uuid, p_usuario_nombre text, p_ip inet, p_user_agent text)
 RETURNS liquidaciones_repartidor LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE v_previa liquidaciones_repartidor; v_actual liquidaciones_repartidor; v_descrip TEXT;
BEGIN
  IF p_motivo IS NULL OR length(trim(p_motivo)) < 10 THEN
    RAISE EXCEPTION 'motivo_insuficiente' USING ERRCODE='P0001'; END IF;
  SELECT * INTO v_previa FROM liquidaciones_repartidor WHERE id=p_liquidacion_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'liquidacion_no_encontrada: %', p_liquidacion_id USING ERRCODE='P0001'; END IF;
  IF v_previa.estado='pendiente' THEN RAISE EXCEPTION 'liquidacion_no_cerrada' USING ERRCODE='P0001'; END IF;
  PERFORM set_config('app.reabrir_rpc','1',true);
  UPDATE liquidaciones_repartidor SET estado='pendiente',cerrada_por=NULL,cerrada_en=NULL,
    monto_total_recibido=NULL,tarifa_retenida=NULL,payout_tienda=NULL,notas=NULL,updated_at=NOW()
   WHERE id=p_liquidacion_id RETURNING * INTO v_actual;
  PERFORM set_config('app.reabrir_rpc','0',true);
  UPDATE liquidacion_envios SET conciliado=FALSE WHERE liquidacion_id=p_liquidacion_id;
  v_descrip := format('Liquidacion reabierta (estaba %s). Motivo: %s', v_previa.estado, p_motivo);
  INSERT INTO auditoria_log (usuario,usuario_id,accion,entidad,entidad_id,descripcion,valor_anterior,valor_nuevo,ip_address,user_agent)
    VALUES (p_usuario_nombre,p_actor,'reabrir','liquidacion',v_actual.id::TEXT,v_descrip,to_jsonb(v_previa),to_jsonb(v_actual),p_ip,p_user_agent);
  RETURN v_actual;
END; $f$;

-- create_pago_atomico con reset del flag (solo el reset cambia; resto igual a la def viva)
CREATE OR REPLACE FUNCTION public.create_pago_atomico(p_envio_id uuid, p_monto_total bigint, p_monto_recibido bigint, p_metodo_pago metodo_pago, p_fecha_pago date, p_referencia text, p_notas text, p_creado_por uuid, p_usuario_nombre text, p_tracking_number text, p_ip inet, p_user_agent text)
 RETURNS pagos LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE v_estado estado_pago; v_pago pagos; v_descripcion TEXT; v_tipo_pago tipo_pago; v_monto_total BIGINT; v_eliminado BOOLEAN;
BEGIN
  PERFORM set_config('app.pago_rpc','1',true);
  PERFORM 1 FROM pagos WHERE envio_id=p_envio_id AND anulado=FALSE FOR UPDATE;
  SELECT tipo_pago, eliminado,
         CASE WHEN tipo_pago='contra_entrega' THEN monto_a_cobrar ELSE (costo+COALESCE(costo_seguro,0)) END::BIGINT
    INTO v_tipo_pago, v_eliminado, v_monto_total FROM envios WHERE id=p_envio_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'envio_no_encontrado: %', p_envio_id USING ERRCODE='P0001'; END IF;
  IF v_eliminado THEN RAISE EXCEPTION 'pago_envio_eliminado: %', p_envio_id USING ERRCODE='P0001'; END IF;
  IF p_monto_total IS NOT NULL AND p_monto_total<>v_monto_total THEN RAISE EXCEPTION 'pago_monto_total_invalido' USING ERRCODE='P0001'; END IF;
  IF p_monto_recibido<0 THEN RAISE EXCEPTION 'pago_monto_recibido_invalido' USING ERRCODE='P0001'; END IF;
  IF p_monto_recibido>v_monto_total THEN RAISE EXCEPTION 'pago_monto_recibido_invalido: excede' USING ERRCODE='P0001'; END IF;
  IF p_monto_recibido>=v_monto_total THEN v_estado:='pagado';
  ELSIF p_monto_recibido>0 THEN v_estado:='pago_parcial'; ELSE v_estado:='pendiente'; END IF;
  INSERT INTO pagos (envio_id,monto_total,monto_recibido,metodo_pago,estado_pago,fecha_pago,referencia,notas,creado_por)
    VALUES (p_envio_id,v_monto_total,p_monto_recibido,p_metodo_pago,v_estado,p_fecha_pago,p_referencia,p_notas,p_creado_por)
    RETURNING * INTO v_pago;
  PERFORM set_config('app.pago_rpc','0',true);
  INSERT INTO auditoria_log (usuario,usuario_id,accion,entidad,entidad_id,descripcion,valor_anterior,valor_nuevo,ip_address,user_agent)
    VALUES (p_usuario_nombre,p_creado_por,'pago','pago',v_pago.id::TEXT,'Pago creado',NULL,to_jsonb(v_pago),p_ip,p_user_agent);
  RETURN v_pago;
END; $f$;

-- trg_envio_block_cod_monto_change cubriendo costo/costo_seguro y ambos modos
CREATE OR REPLACE FUNCTION public.trg_envio_block_cod_monto_change_fn()
 RETURNS trigger LANGUAGE plpgsql AS $f$
BEGIN
  IF NEW.monto_a_cobrar IS NOT DISTINCT FROM OLD.monto_a_cobrar
     AND NEW.costo IS NOT DISTINCT FROM OLD.costo
     AND NEW.costo_seguro IS NOT DISTINCT FROM OLD.costo_seguro THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM pagos WHERE envio_id=NEW.id AND anulado=FALSE) THEN
    RAISE EXCEPTION 'cod_monto_no_modificable: pago activo' USING ERRCODE='P0001'; END IF;
  IF EXISTS (SELECT 1 FROM liquidacion_envios WHERE envio_id=NEW.id) THEN
    RAISE EXCEPTION 'cod_monto_no_modificable: ya en liquidacion' USING ERRCODE='P0001'; END IF;
  RETURN NEW;
END; $f$;
DROP TRIGGER IF EXISTS trg_envio_block_cod_monto_change ON public.envios;
CREATE TRIGGER trg_envio_block_cod_monto_change
  BEFORE UPDATE OF monto_a_cobrar, costo, costo_seguro ON public.envios
  FOR EACH ROW EXECUTE FUNCTION public.trg_envio_block_cod_monto_change_fn();

-- cerrar_liquidacion con payout sobre efectivo real en con_diferencia (cuerpo igual a 040)
CREATE OR REPLACE FUNCTION public.cerrar_liquidacion(p_liquidacion_id uuid, p_monto_recibido bigint, p_notas text, p_cerrado_por uuid, p_usuario_nombre text, p_ip inet, p_user_agent text)
 RETURNS liquidaciones_repartidor LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE v_previa liquidaciones_repartidor; v_actual liquidaciones_repartidor; v_estado estado_liquidacion;
        v_esperado BIGINT:=0; v_tarifa BIGINT:=0; v_payout BIGINT:=0; v_diferencia BIGINT;
BEGIN
  IF p_monto_recibido<0 THEN RAISE EXCEPTION 'monto_invalido' USING ERRCODE='P0001'; END IF;
  SELECT * INTO v_previa FROM liquidaciones_repartidor WHERE id=p_liquidacion_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'liquidacion_no_encontrada: %', p_liquidacion_id USING ERRCODE='P0001'; END IF;
  IF v_previa.estado<>'pendiente' THEN RAISE EXCEPTION 'liquidacion_ya_cerrada: %', p_liquidacion_id USING ERRCODE='P0001'; END IF;
  DROP TABLE IF EXISTS tmp_elegibles;
  CREATE TEMP TABLE tmp_elegibles ON COMMIT DROP AS
  SELECT e.id AS envio_id, e.monto_a_cobrar AS monto_esperado, COALESCE(e.monto_cobrado,0) AS monto_cobrado,
         (e.costo+COALESCE(e.costo_seguro,0))::BIGINT AS tarifa
    FROM envios e
   WHERE e.repartidor_id=v_previa.repartidor_id AND e.estado='entregado'
     AND e.tipo_pago IN ('anticipado','contra_entrega') AND e.eliminado=FALSE AND e.fecha_entrega_real IS NOT NULL
     AND (e.fecha_entrega_real AT TIME ZONE 'America/Asuncion')::date BETWEEN v_previa.fecha_desde AND v_previa.fecha_hasta
     AND EXISTS (SELECT 1 FROM pagos p WHERE p.envio_id=e.id AND p.anulado=FALSE AND p.estado_pago='pagado')
     AND NOT EXISTS (SELECT 1 FROM liquidacion_envios le WHERE le.envio_id=e.id AND le.conciliado=TRUE AND le.liquidacion_id<>p_liquidacion_id)
   ORDER BY e.id FOR UPDATE OF e;
  DELETE FROM liquidacion_envios le WHERE le.liquidacion_id=p_liquidacion_id
     AND NOT EXISTS (SELECT 1 FROM tmp_elegibles t WHERE t.envio_id=le.envio_id);
  INSERT INTO liquidacion_envios (liquidacion_id,envio_id,monto_esperado,monto_cobrado,conciliado)
  SELECT p_liquidacion_id,t.envio_id,t.monto_esperado,t.monto_cobrado,FALSE FROM tmp_elegibles t
  ON CONFLICT (liquidacion_id,envio_id) DO UPDATE SET monto_esperado=EXCLUDED.monto_esperado, monto_cobrado=EXCLUDED.monto_cobrado;
  SELECT COALESCE(SUM(monto_esperado),0)::BIGINT, COALESCE(SUM(tarifa),0)::BIGINT INTO v_esperado,v_tarifa FROM tmp_elegibles;
  v_diferencia := p_monto_recibido - v_esperado;
  IF v_diferencia=0 THEN v_estado:='cerrada'; v_payout:=v_esperado-v_tarifa;
  ELSE
    v_estado:='con_diferencia';
    IF p_notas IS NULL OR length(trim(p_notas))<10 THEN RAISE EXCEPTION 'notas_requeridas' USING ERRCODE='P0001'; END IF;
    v_payout := GREATEST(p_monto_recibido - v_tarifa, 0);
  END IF;
  UPDATE liquidaciones_repartidor SET monto_total_esperado=v_esperado,monto_total_recibido=p_monto_recibido,
    tarifa_retenida=v_tarifa,payout_tienda=v_payout,estado=v_estado,cerrada_por=p_cerrado_por,
    cerrada_en=NOW(),notas=p_notas,updated_at=NOW() WHERE id=p_liquidacion_id RETURNING * INTO v_actual;
  UPDATE liquidacion_envios SET conciliado=TRUE WHERE liquidacion_id=p_liquidacion_id;
  INSERT INTO auditoria_log (usuario,usuario_id,accion,entidad,entidad_id,descripcion,valor_anterior,valor_nuevo,ip_address,user_agent)
    VALUES (p_usuario_nombre,p_cerrado_por,'editar','liquidacion',v_actual.id::TEXT,'Liquidacion cerrada',to_jsonb(v_previa),to_jsonb(v_actual),p_ip,p_user_agent);
  RETURN v_actual;
END; $f$;

ALTER TABLE public.liquidaciones_repartidor DROP CONSTRAINT IF EXISTS liquidacion_payout_conservacion;
ALTER TABLE public.liquidaciones_repartidor ADD CONSTRAINT liquidacion_payout_conservacion CHECK (
  estado='pendiente' OR (tarifa_retenida IS NOT NULL AND payout_tienda IS NOT NULL
    AND tarifa_retenida+payout_tienda = monto_total_recibido)) NOT VALID;
ALTER TABLE public.liquidaciones_repartidor VALIDATE CONSTRAINT liquidacion_payout_conservacion;

ALTER TABLE public.pagos DROP CONSTRAINT IF EXISTS pagos_pagado_coherente;
ALTER TABLE public.pagos ADD CONSTRAINT pagos_pagado_coherente CHECK (
  estado_pago<>'pagado' OR monto_recibido>=monto_total) NOT VALID;
ALTER TABLE public.pagos VALIDATE CONSTRAINT pagos_pagado_coherente;

CREATE OR REPLACE FUNCTION public.tarifa_norm_ciudad(p_in text)
 RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $f$
  SELECT regexp_replace(btrim(translate(lower(p_in),
    'áàäâãéèëêíìïîóòöôõúùüûñç','aaaaaeeeeiiiiooooouuuunc')), '\s+', ' ', 'g');
$f$;
UPDATE public.tarifas SET activo=FALSE WHERE id='d945c179-4072-4c6c-abda-f613b13f8d80' AND activo=TRUE AND eliminado=FALSE;
CREATE UNIQUE INDEX IF NOT EXISTS tarifas_ruta_servicio_unica
  ON public.tarifas (public.tarifa_norm_ciudad(origen), public.tarifa_norm_ciudad(destino), tipo_servicio)
  WHERE (activo=TRUE AND eliminado=FALSE);

-- --- verificaciones DESPUES ---

DO $b$
DECLARE
  v_rep uuid := gen_random_uuid(); v_cli uuid := gen_random_uuid(); v_env uuid := gen_random_uuid();
  v_env2 uuid := gen_random_uuid(); v_sys uuid := '00000000-0000-4000-a000-000000000001';
  v_liq uuid; v_blocked boolean; v_aud_b int; v_aud_a int;
BEGIN
  INSERT INTO repartidores (id,nombre,telefono,vehiculo,placa,eliminado)
    VALUES (v_rep,'REPRO040B Rep','0990000041','Moto','REPRO41B',FALSE);
  INSERT INTO clientes (id,razon_social,ruc,contacto_nombre,telefono,email)
    VALUES (v_cli,'REPRO040B Cli','80000041-0','Contacto','0990000141','repro040b@example.test');
  INSERT INTO envios (id,cliente_id,cliente_nombre,tracking_number,origen,destino,
    destinatario_nombre,destinatario_telefono,destinatario_direccion,destinatario_ciudad,
    peso,estado,costo,costo_seguro,monto_a_cobrar,tipo_pago,repartidor_id,fecha_entrega_real,eliminado)
    VALUES (v_env,v_cli,'REPRO040B Cli','REPRO040B','Asuncion','Asuncion',
      'Dest','0990000245','Calle 1','Asuncion',1.0,'entregado',30000,0,30000,'anticipado',v_rep,NOW(),FALSE);
  PERFORM create_pago_atomico(v_env,30000,30000,'efectivo'::metodo_pago,CURRENT_DATE,NULL,'repro',v_sys,'REPRO','REPRO040B',NULL,NULL);

  -- ALTA3 after
  v_blocked := FALSE;
  BEGIN UPDATE pagos SET monto_recibido=1 WHERE envio_id=v_env AND anulado=FALSE;
  EXCEPTION WHEN sqlstate 'P0001' THEN v_blocked := TRUE; END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'B2 FALLO ALTA3: UPDATE crudo de pago NO bloqueado'; END IF;
  RAISE NOTICE 'B2 ALTA3 UPDATE crudo pago: BLOQUEADO (correcto)';

  -- ALTA5 after (contra_entrega: costo libre de I1, el guard nuevo lo congela). Repartidor aparte
  -- para no contaminar el set del round-trip de v_rep.
  DECLARE v_envc uuid := gen_random_uuid(); v_repc uuid := gen_random_uuid();
  BEGIN
    INSERT INTO repartidores (id,nombre,telefono,vehiculo,placa,eliminado)
      VALUES (v_repc,'REPRO040B Rep5','0990000051','Moto','REPRO51B',FALSE);
    INSERT INTO envios (id,cliente_id,cliente_nombre,tracking_number,origen,destino,
      destinatario_nombre,destinatario_telefono,destinatario_direccion,destinatario_ciudad,
      peso,estado,costo,costo_seguro,monto_a_cobrar,tipo_pago,repartidor_id,fecha_entrega_real,eliminado)
      VALUES (v_envc,v_cli,'REPRO040B Cli','REPRO040B5','Asuncion','Asuncion',
        'Dest','0990000248','Calle 1','Asuncion',1.0,'entregado',30000,0,100000,'contra_entrega',v_repc,NOW(),FALSE);
    PERFORM create_pago_atomico(v_envc,100000,100000,'contra_entrega'::metodo_pago,CURRENT_DATE,NULL,'repro',v_sys,'REPRO','REPRO040B5',NULL,NULL);
    v_blocked := FALSE;
    BEGIN UPDATE envios SET costo=5000 WHERE id=v_envc;
    EXCEPTION WHEN sqlstate 'P0001' THEN v_blocked := TRUE; END;
    IF NOT v_blocked THEN RAISE EXCEPTION 'B3 FALLO ALTA5: UPDATE costo (contra_entrega) NO bloqueado'; END IF;
    RAISE NOTICE 'B3 ALTA5 UPDATE costo (contra_entrega) con pago activo: BLOQUEADO (correcto)';
  END;

  -- round-trip cerrar
  v_liq := (crear_liquidacion(v_rep,CURRENT_DATE,CURRENT_DATE,v_sys,'REPRO',NULL,NULL)).id;
  PERFORM cerrar_liquidacion(v_liq,30000,NULL,v_sys,'REPRO',NULL,NULL);
  RAISE NOTICE 'B0 round-trip cerrar OK estado=% payout=% tarifa=% conciliado=%',
    (SELECT estado FROM liquidaciones_repartidor WHERE id=v_liq),
    (SELECT payout_tienda FROM liquidaciones_repartidor WHERE id=v_liq),
    (SELECT tarifa_retenida FROM liquidaciones_repartidor WHERE id=v_liq),
    (SELECT bool_and(conciliado) FROM liquidacion_envios WHERE liquidacion_id=v_liq);

  -- CRITICA1 after: INSERT bajo sellado bloqueado
  INSERT INTO envios (id,cliente_id,cliente_nombre,tracking_number,origen,destino,
    destinatario_nombre,destinatario_telefono,destinatario_direccion,destinatario_ciudad,
    peso,estado,costo,costo_seguro,monto_a_cobrar,tipo_pago,repartidor_id,fecha_entrega_real,eliminado)
    VALUES (v_env2,v_cli,'REPRO040B Cli','REPRO040B2','Asuncion','Asuncion',
      'Dest','0990000246','Calle 1','Asuncion',1.0,'entregado',50000,0,50000,'anticipado',v_rep,NOW(),FALSE);
  v_blocked := FALSE;
  BEGIN INSERT INTO liquidacion_envios (liquidacion_id,envio_id,monto_esperado,monto_cobrado,conciliado)
    VALUES (v_liq,v_env2,50000,50000,TRUE);
  EXCEPTION WHEN sqlstate 'P0001' THEN v_blocked := TRUE; END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'B1a FALLO CRITICA1: INSERT bajo sellado NO bloqueado'; END IF;
  RAISE NOTICE 'B1a CRITICA1 INSERT detalle bajo sellado: BLOQUEADO (correcto)';

  -- CRITICA2 after: forjar monto en detalle sellado bloqueado
  v_blocked := FALSE;
  BEGIN UPDATE liquidacion_envios SET monto_cobrado=999999 WHERE liquidacion_id=v_liq;
  EXCEPTION WHEN sqlstate 'P0001' THEN v_blocked := TRUE; END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'B1b FALLO CRITICA2: forje de monto NO bloqueado'; END IF;
  RAISE NOTICE 'B1b CRITICA2 forjar monto en detalle sellado: BLOQUEADO (correcto)';

  -- ALTA6 after: reapertura cruda bloqueada
  v_blocked := FALSE;
  BEGIN UPDATE liquidaciones_repartidor SET estado='pendiente',cerrada_en=NULL,cerrada_por=NULL,
    monto_total_recibido=NULL,tarifa_retenida=NULL,payout_tienda=NULL,notas=NULL WHERE id=v_liq;
  EXCEPTION WHEN sqlstate 'P0001' THEN v_blocked := TRUE; END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'B4 FALLO ALTA6: reapertura cruda NO bloqueada'; END IF;
  RAISE NOTICE 'B4 ALTA6 reapertura cruda: BLOQUEADA (correcto)';

  -- ALTA6 legit: reabrir via RPC sigue funcionando (auditoria + des-concilia)
  SELECT count(*) INTO v_aud_b FROM auditoria_log WHERE entidad='liquidacion' AND entidad_id=v_liq::text AND accion='reabrir';
  PERFORM reabrir_liquidacion(v_liq,'reapertura legitima repro 040',v_sys,'REPRO',NULL,NULL);
  SELECT count(*) INTO v_aud_a FROM auditoria_log WHERE entidad='liquidacion' AND entidad_id=v_liq::text AND accion='reabrir';
  IF v_aud_a<=v_aud_b OR NOT (SELECT bool_and(NOT conciliado) FROM liquidacion_envios WHERE liquidacion_id=v_liq)
     OR NOT (SELECT cerrada_en IS NULL FROM liquidaciones_repartidor WHERE id=v_liq) THEN
    RAISE EXCEPTION 'B5 FALLO: reabrir via RPC no dejo auditoria o no des-concilio'; END IF;
  RAISE NOTICE 'B5 ALTA6 reabrir via RPC: OK auditoria +% detalle des-conciliado (correcto)', v_aud_a-v_aud_b;

  -- round-trip re-cerrar
  PERFORM cerrar_liquidacion(v_liq,30000,NULL,v_sys,'REPRO',NULL,NULL);
  RAISE NOTICE 'B6 round-trip re-cerrar tras reabrir: OK estado=% (correcto)',
    (SELECT estado FROM liquidaciones_repartidor WHERE id=v_liq);
END;
$b$;

-- MEDIA8: con_diferencia conserva
DO $m8$
DECLARE v_rep uuid:=gen_random_uuid(); v_cli uuid:=gen_random_uuid(); v_env uuid:=gen_random_uuid();
        v_liq uuid; v_sys uuid:='00000000-0000-4000-a000-000000000001'; v_tar bigint; v_pay bigint; v_rec bigint;
BEGIN
  INSERT INTO repartidores (id,nombre,telefono,vehiculo,placa,eliminado) VALUES (v_rep,'REPRO040 M8','0990000042','Moto','REPRO42M',FALSE);
  INSERT INTO clientes (id,razon_social,ruc,contacto_nombre,telefono,email) VALUES (v_cli,'REPRO040 M8','80000042-0','Contacto','0990000142','repro040m8@example.test');
  INSERT INTO envios (id,cliente_id,cliente_nombre,tracking_number,origen,destino,destinatario_nombre,destinatario_telefono,destinatario_direccion,destinatario_ciudad,peso,estado,costo,costo_seguro,monto_a_cobrar,tipo_pago,repartidor_id,fecha_entrega_real,eliminado)
    VALUES (v_env,v_cli,'REPRO040 M8','REPRO040M8','Asuncion','Asuncion','Dest','0990000342','Calle 1','Asuncion',1.0,'entregado',30000,0,130000,'contra_entrega',v_rep,NOW(),FALSE);
  PERFORM create_pago_atomico(v_env,130000,130000,'contra_entrega'::metodo_pago,CURRENT_DATE,NULL,'repro',v_sys,'REPRO','REPRO040M8',NULL,NULL);
  v_liq := (crear_liquidacion(v_rep,CURRENT_DATE,CURRENT_DATE,v_sys,'REPRO',NULL,NULL)).id;
  PERFORM cerrar_liquidacion(v_liq,120000,'repartidor rindio 10000 menos, faltante a reclamar',v_sys,'REPRO',NULL,NULL);
  SELECT tarifa_retenida,payout_tienda,monto_total_recibido INTO v_tar,v_pay,v_rec FROM liquidaciones_repartidor WHERE id=v_liq;
  IF v_tar+v_pay=v_rec AND v_pay=90000 AND v_tar=30000 THEN
    RAISE NOTICE 'B7 MEDIA8 con_diferencia sobre efectivo real: tarifa=% payout=% recibido=% conserva (correcto)', v_tar,v_pay,v_rec;
  ELSE RAISE EXCEPTION 'B7 FALLO MEDIA8: tarifa=% payout=% recibido=% NO conserva', v_tar,v_pay,v_rec; END IF;
END;
$m8$;

-- MEDIA7: una sola tarifa activa Asuncion->CDE, reactivar la dup choca el indice unico
DO $m7$
DECLARE v_n int; v_blocked boolean := FALSE;
BEGIN
  SELECT count(*) INTO v_n FROM tarifas WHERE tarifa_norm_ciudad(origen)='asuncion'
    AND tarifa_norm_ciudad(destino)='ciudad del este' AND tipo_servicio='estandar' AND activo AND NOT eliminado;
  IF v_n<>1 THEN RAISE EXCEPTION 'B8 FALLO MEDIA7: % tarifas activas (esperado 1)', v_n; END IF;
  BEGIN UPDATE tarifas SET activo=TRUE WHERE id='d945c179-4072-4c6c-abda-f613b13f8d80';
  EXCEPTION WHEN unique_violation THEN v_blocked := TRUE; END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'B8 FALLO MEDIA7: se pudo tener 2 tarifas activas'; END IF;
  RAISE NOTICE 'B8 MEDIA7 1 tarifa activa, reactivar dup BLOQUEADO por indice unico (correcto)';
END;
$m7$;

ROLLBACK;  -- revierte 040 inline + seeds: PROD INTACTO.

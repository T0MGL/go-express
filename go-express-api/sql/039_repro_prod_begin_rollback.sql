-- Repro 039 contra prod en BEGIN/ROLLBACK. Prueba el round-trip completo del trigger de
-- inmutabilidad del detalle. NO deja efectos: termina en ROLLBACK. Usa datos sinteticos.
-- Driver: las RPCs reales (crear_liquidacion / cerrar_liquidacion / reabrir_liquidacion) para que
-- la transicion de sellado pase por el trigger nuevo igual que en produccion.

BEGIN;

\set ON_ERROR_STOP on

-- 1. Aplicar 039 dentro de la tx (idempotente).
CREATE OR REPLACE FUNCTION public.trg_liquidacion_envios_inmutable_fn()
 RETURNS trigger LANGUAGE plpgsql AS $f$
DECLARE v_cerrada_en timestamptz; v_liq_id uuid;
BEGIN
  v_liq_id := CASE WHEN TG_OP='DELETE' THEN OLD.liquidacion_id ELSE NEW.liquidacion_id END;
  SELECT cerrada_en INTO v_cerrada_en FROM public.liquidaciones_repartidor WHERE id=v_liq_id;
  IF v_cerrada_en IS NULL THEN
    RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF TG_OP='UPDATE' AND OLD.conciliado=FALSE AND NEW.conciliado=TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'liquidacion_envios_inmutable: detalle sellado %', v_liq_id USING ERRCODE='P0001';
END; $f$;
DROP TRIGGER IF EXISTS trg_liquidacion_envios_inmutable ON public.liquidacion_envios;
CREATE TRIGGER trg_liquidacion_envios_inmutable
  BEFORE UPDATE OR DELETE ON public.liquidacion_envios
  FOR EACH ROW EXECUTE FUNCTION public.trg_liquidacion_envios_inmutable_fn();

-- 2. Datos sinteticos: repartidor + cliente + envio entregado + pago pagado.
DO $seed$
DECLARE
  v_rep  uuid := gen_random_uuid();
  v_cli  uuid := gen_random_uuid();
  v_env  uuid := gen_random_uuid();
  v_sys  uuid := '00000000-0000-4000-a000-000000000001';
  v_costo bigint := 30000;
  v_seguro bigint := 0;
  v_tarifa bigint := 30000;
BEGIN
  INSERT INTO repartidores (id, nombre, telefono, vehiculo, placa, eliminado)
  VALUES (v_rep, 'REPRO Repartidor 039', '0990000039', 'Moto', 'REPRO39', FALSE);

  INSERT INTO clientes (id, razon_social, ruc, contacto_nombre, telefono, email)
  VALUES (v_cli, 'REPRO Cliente 039', '80000039-0', 'REPRO Contacto', '0990000139', 'repro039@example.test');

  -- anticipado: monto_a_cobrar == costo+seguro (I1 igualdad, 037). Cubre el modo nuevo de Task 1.
  INSERT INTO envios (
    id, cliente_id, cliente_nombre, tracking_number, origen, destino,
    destinatario_nombre, destinatario_telefono, destinatario_direccion, destinatario_ciudad,
    peso, estado, costo, costo_seguro, monto_a_cobrar, tipo_pago, repartidor_id,
    fecha_entrega_real, eliminado
  ) VALUES (
    v_env, v_cli, 'REPRO Cliente 039', 'REPRO039', 'Asuncion', 'Asuncion',
    'Dest', '0990000239', 'Calle 1', 'Asuncion',
    1.0, 'entregado', v_costo, v_seguro, v_tarifa, 'anticipado', v_rep,
    NOW(), FALSE
  );

  -- Pago pagado via RPC real (computa monto por modo; anticipado => costo+seguro).
  PERFORM create_pago_atomico(
    v_env, v_tarifa, v_tarifa, 'efectivo'::metodo_pago, CURRENT_DATE,
    NULL, 'repro 039', v_sys, 'REPRO', 'REPRO039', NULL, NULL
  );

  -- Persistir ids para los pasos siguientes.
  CREATE TEMP TABLE repro_ctx (rep uuid, env uuid) ON COMMIT DROP;
  INSERT INTO repro_ctx VALUES (v_rep, v_env);
END;
$seed$;

-- 3. Crear + cerrar la liquidacion via RPC (sella el detalle pasando por el trigger nuevo).
DO $close$
DECLARE
  v_rep uuid; v_env uuid; v_liq uuid; v_sys uuid := '00000000-0000-4000-a000-000000000001';
  v_n int;
BEGIN
  SELECT rep, env INTO v_rep, v_env FROM repro_ctx;

  v_liq := (crear_liquidacion(v_rep, CURRENT_DATE, CURRENT_DATE, v_sys, 'REPRO', NULL, NULL)).id;

  SELECT count(*) INTO v_n FROM liquidacion_envios WHERE liquidacion_id=v_liq;
  RAISE NOTICE 'A. detalle tras crear (pendiente): % fila(s), conciliado=%',
    v_n, (SELECT bool_and(conciliado) FROM liquidacion_envios WHERE liquidacion_id=v_liq);

  -- cerrar: caja fisica == esperado (30000). Esto dispara el blanket conciliado=TRUE bajo header
  -- ya sellado => DEBE pasar por la excepcion del trigger.
  PERFORM cerrar_liquidacion(v_liq, 30000, NULL, v_sys, 'REPRO', NULL, NULL);

  RAISE NOTICE 'B. cerrar OK. estado=%, cerrada_en NOT NULL=%, detalle conciliado=%',
    (SELECT estado FROM liquidaciones_repartidor WHERE id=v_liq),
    (SELECT cerrada_en IS NOT NULL FROM liquidaciones_repartidor WHERE id=v_liq),
    (SELECT bool_and(conciliado) FROM liquidacion_envios WHERE liquidacion_id=v_liq);

  CREATE TEMP TABLE repro_liq (liq uuid) ON COMMIT DROP;
  INSERT INTO repro_liq VALUES (v_liq);
END;
$close$;

-- 4. CASO TAMPER UPDATE sobre detalle sellado => DEBE bloquear.
DO $tamper_upd$
DECLARE v_liq uuid; v_blocked boolean := FALSE;
BEGIN
  SELECT liq INTO v_liq FROM repro_liq;
  BEGIN
    UPDATE liquidacion_envios SET monto_cobrado = 1 WHERE liquidacion_id = v_liq;
  EXCEPTION WHEN sqlstate 'P0001' THEN v_blocked := TRUE;
  END;
  IF v_blocked THEN
    RAISE NOTICE 'C. tamper UPDATE monto_cobrado sobre detalle sellado: BLOQUEADO (correcto)';
  ELSE
    RAISE EXCEPTION 'C. FALLO: el tamper UPDATE NO fue bloqueado';
  END IF;
END;
$tamper_upd$;

-- 5. CASO TAMPER des-conciliar directo (conciliado TRUE->FALSE) sobre sellado => DEBE bloquear.
DO $tamper_unconc$
DECLARE v_liq uuid; v_blocked boolean := FALSE;
BEGIN
  SELECT liq INTO v_liq FROM repro_liq;
  BEGIN
    UPDATE liquidacion_envios SET conciliado = FALSE WHERE liquidacion_id = v_liq;
  EXCEPTION WHEN sqlstate 'P0001' THEN v_blocked := TRUE;
  END;
  IF v_blocked THEN
    RAISE NOTICE 'D. tamper des-conciliar directo (sin reabrir) sobre sellado: BLOQUEADO (correcto)';
  ELSE
    RAISE EXCEPTION 'D. FALLO: el des-conciliar directo NO fue bloqueado';
  END IF;
END;
$tamper_unconc$;

-- 6. CASO TAMPER DELETE sobre detalle sellado => DEBE bloquear.
DO $tamper_del$
DECLARE v_liq uuid; v_blocked boolean := FALSE;
BEGIN
  SELECT liq INTO v_liq FROM repro_liq;
  BEGIN
    DELETE FROM liquidacion_envios WHERE liquidacion_id = v_liq;
  EXCEPTION WHEN sqlstate 'P0001' THEN v_blocked := TRUE;
  END;
  IF v_blocked THEN
    RAISE NOTICE 'E. tamper DELETE sobre detalle sellado: BLOQUEADO (correcto)';
  ELSE
    RAISE EXCEPTION 'E. FALLO: el DELETE NO fue bloqueado';
  END IF;
END;
$tamper_del$;

-- 7. CASO REABRIR via RPC: header cerrada_en=NULL primero, luego detalle conciliado=FALSE => PERMITIDO.
DO $reopen$
DECLARE v_liq uuid; v_sys uuid := '00000000-0000-4000-a000-000000000001';
BEGIN
  SELECT liq INTO v_liq FROM repro_liq;
  PERFORM reabrir_liquidacion(v_liq, 'reapertura de prueba repro 039', v_sys, 'REPRO', NULL, NULL);
  RAISE NOTICE 'F. reabrir OK. estado=%, cerrada_en NULL=%, detalle conciliado=%',
    (SELECT estado FROM liquidaciones_repartidor WHERE id=v_liq),
    (SELECT cerrada_en IS NULL FROM liquidaciones_repartidor WHERE id=v_liq),
    (SELECT bool_and(conciliado) FROM liquidacion_envios WHERE liquidacion_id=v_liq);
END;
$reopen$;

-- 8. CASO RE-CERRAR tras reabrir => el seal vuelve a pasar (regresion del happy path).
DO $reclose$
DECLARE v_liq uuid; v_sys uuid := '00000000-0000-4000-a000-000000000001';
BEGIN
  SELECT liq INTO v_liq FROM repro_liq;
  PERFORM cerrar_liquidacion(v_liq, 30000, NULL, v_sys, 'REPRO', NULL, NULL);
  RAISE NOTICE 'G. re-cerrar tras reabrir OK. estado=%, detalle conciliado=%',
    (SELECT estado FROM liquidaciones_repartidor WHERE id=v_liq),
    (SELECT bool_and(conciliado) FROM liquidacion_envios WHERE liquidacion_id=v_liq);
END;
$reclose$;

ROLLBACK;

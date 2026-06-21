-- 040: Cierre de los 6 bloqueantes de la re-auditoria final Step 6 (2 CRITICA + 4 ALTA) + MEDIA/BAJA.
-- Plata real de afiliados, owner legalmente expuesto. Tolerancia cero a tampering bajo sello.
-- Toda la parte SQL del plan de fix (docs/STEP6-FINAL-REAUDIT-REPORT.md, seccion "Plan de fix").
-- ALTA 4 (politica COD parcial) y BAJA 9 (deuda de tipos CC) son cambios TS, no viven aca.
--
-- Idempotente (CREATE OR REPLACE + DROP IF EXISTS + IF NOT EXISTS). Transaccional. Rollback al final.
-- Verificado contra prod via BEGIN/ROLLBACK reproduciendo el repro de cada bloqueante
-- (ver sql/040_repro_prod_begin_rollback.sql): antes pasa el tampering, despues queda bloqueado,
-- y el round-trip legitimo crear -> cerrar -> reabrir -> re-cerrar sigue pasando.

BEGIN;

-- =====================================================================================
-- FIX #1  CRITICA 1 + CRITICA 2: detalle de liquidacion sellada inmutable tambien al INSERT,
--          y excepcion de sellado endurecida para que no haga piggyback de cambios de plata.
--
-- 039 dejaba dos flancos: (1) el trigger era BEFORE UPDATE OR DELETE, sin rama INSERT, asi que
-- se podia inyectar detalle conciliado=TRUE bajo una liquidacion ya sellada (envio liquidado a
-- ningun header, excluido para siempre de toda liquidacion futura). (2) la excepcion de sellado
-- solo miraba conciliado FALSE->TRUE, no que el resto de columnas no mutara, asi que un INSERT
-- conciliado=FALSE + UPDATE a TRUE con monto_cobrado/esperado forjados pasaba.
--
-- cerrar_liquidacion (def viva) hace el UPSERT del detalle con el header AUN pendiente
-- (cerrada_en IS NULL), DESPUES sella el header (cerrada_en=NOW()), DESPUES el blanket
-- conciliado=TRUE. Por eso: el INSERT legitimo siempre ocurre con padre pendiente (rama allow),
-- y el unico UPDATE bajo padre sellado es el blanket de sellado, que solo flipa conciliado y deja
-- monto_esperado/monto_cobrado/envio_id intactos. crear_liquidacion inserta con el padre recien
-- creado (pendiente). Camino legitimo cubierto; tampering cerrado.
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.trg_liquidacion_envios_inmutable_fn()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_cerrada_en timestamptz;
  v_liq_id     uuid;
BEGIN
  v_liq_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.liquidacion_id ELSE NEW.liquidacion_id END;

  SELECT cerrada_en INTO v_cerrada_en
    FROM public.liquidaciones_repartidor
   WHERE id = v_liq_id;

  -- Padre pendiente (o inexistente, p.ej. CASCADE de un DELETE de header pendiente): todo permitido.
  -- El header pendiente es la unica superficie de escritura legitima del detalle: crear inserta con
  -- el header recien creado; cerrar arma el set (DELETE/UPSERT) con el padre todavia pendiente;
  -- reabrir nula cerrada_en antes de des-conciliar.
  IF v_cerrada_en IS NULL THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  -- Padre sellado. Unica mutacion permitida: la transicion de sellado de cerrar_liquidacion, que
  -- flipa conciliado FALSE->TRUE SIN tocar montos ni el envio. Cualquier otro INSERT/UPDATE/DELETE
  -- bajo sello (incluido un UPDATE que se cuele en la excepcion para forjar montos) se rechaza.
  IF TG_OP = 'UPDATE'
     AND OLD.conciliado = FALSE
     AND NEW.conciliado = TRUE
     AND NEW.monto_esperado IS NOT DISTINCT FROM OLD.monto_esperado
     AND NEW.monto_cobrado  IS NOT DISTINCT FROM OLD.monto_cobrado
     AND NEW.envio_id       =  OLD.envio_id
     AND NEW.liquidacion_id =  OLD.liquidacion_id
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'liquidacion_envios_inmutable: el detalle del envio % pertenece a la liquidacion sellada %; reabrila para corregir',
    CASE WHEN TG_OP = 'DELETE' THEN OLD.envio_id ELSE NEW.envio_id END, v_liq_id
    USING ERRCODE = 'P0001';
END;
$function$;

DROP TRIGGER IF EXISTS trg_liquidacion_envios_inmutable ON public.liquidacion_envios;
CREATE TRIGGER trg_liquidacion_envios_inmutable
  BEFORE INSERT OR UPDATE OR DELETE ON public.liquidacion_envios
  FOR EACH ROW EXECUTE FUNCTION public.trg_liquidacion_envios_inmutable_fn();


-- =====================================================================================
-- FIX #4  ALTA 6: la reapertura de una liquidacion sellada solo puede pasar por
--          reabrir_liquidacion. Un UPDATE crudo que nule cerrada_en (estado='pendiente',
--          cerrada_en=NULL, ...) evadia reabrir: 0 filas de auditoria y el detalle quedaba
--          conciliado=TRUE bajo header pendiente, atrapando el envio fuera de toda liquidacion.
--
-- Se gatea la transicion cerrada_en NOT NULL -> NULL detras de la GUC de sesion app.reabrir_rpc,
-- que SOLO reabrir_liquidacion setea (mismo patron que app.pago_rpc en trg_pagos_no_update_fisico:
-- transaccion-local, no seteable desde fuera sin abrir la tx). reabrir la setea/resetea abajo.
-- Se define ANTES que cerrar/reabrir porque ambas RPCs disparan este trigger.
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.trg_liquidacion_inmutable_fn()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.cerrada_en IS NOT NULL THEN
      RAISE EXCEPTION 'liquidacion_cerrada_inmutable: no se puede eliminar la liquidacion cerrada %, reabrila primero', OLD.id
        USING ERRCODE = 'P0001';
    END IF;
    RETURN OLD;
  END IF;

  -- Sello vivo: ningun UPDATE mantiene cerrada_en NOT NULL (forje de payout/tarifa bajo sello).
  IF OLD.cerrada_en IS NOT NULL AND NEW.cerrada_en IS NOT NULL THEN
    RAISE EXCEPTION 'liquidacion_cerrada_inmutable: la liquidacion cerrada % solo se modifica via reabrir_liquidacion', OLD.id
      USING ERRCODE = 'P0001';
  END IF;

  -- Reapertura (cerrada_en NOT NULL -> NULL): SOLO via reabrir_liquidacion. Un UPDATE crudo que
  -- nule el sello sin esa marca borra la traza forense (auditoria_log) y deja el detalle desync.
  IF OLD.cerrada_en IS NOT NULL AND NEW.cerrada_en IS NULL
     AND current_setting('app.reabrir_rpc', true) IS DISTINCT FROM '1' THEN
    RAISE EXCEPTION 'liquidacion_reapertura_invalida: una liquidacion cerrada solo se reabre via reabrir_liquidacion (deja auditoria y des-concilia el detalle)'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_liquidacion_inmutable ON public.liquidaciones_repartidor;
CREATE TRIGGER trg_liquidacion_inmutable
  BEFORE UPDATE OR DELETE ON public.liquidaciones_repartidor
  FOR EACH ROW EXECUTE FUNCTION public.trg_liquidacion_inmutable_fn();


-- reabrir_liquidacion: setea app.reabrir_rpc='1' antes del UPDATE que nula el sello y lo resetea
-- a '0' apenas pasa, igual que las RPCs de pago con app.pago_rpc. Resto del cuerpo intacto.
CREATE OR REPLACE FUNCTION public.reabrir_liquidacion(p_liquidacion_id uuid, p_motivo text, p_actor uuid, p_usuario_nombre text, p_ip inet, p_user_agent text)
 RETURNS liquidaciones_repartidor
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_previa   liquidaciones_repartidor;
  v_actual   liquidaciones_repartidor;
  v_descrip  TEXT;
BEGIN
  IF p_motivo IS NULL OR length(trim(p_motivo)) < 10 THEN
    RAISE EXCEPTION 'motivo_insuficiente: reabrir una liquidacion requiere un motivo de al menos 10 caracteres'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_previa
    FROM liquidaciones_repartidor
   WHERE id = p_liquidacion_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'liquidacion_no_encontrada: %', p_liquidacion_id USING ERRCODE = 'P0001';
  END IF;

  IF v_previa.estado = 'pendiente' THEN
    RAISE EXCEPTION 'liquidacion_no_cerrada: la liquidacion ya esta pendiente, no hay nada que reabrir'
      USING ERRCODE = 'P0001';
  END IF;

  -- Habilita la unica via legitima de nular el sello (4.x ALTA 6). El flag es transaccion-local.
  PERFORM set_config('app.reabrir_rpc', '1', true);

  -- Vuelta a pendiente. Los campos de cierre + montos finales VUELVEN a NULL: el re-cierre los
  -- reconstruye desde el set vigente (4.2). monto_total_esperado queda como estaba: cerrar lo
  -- sobrescribe; no se nulea porque el CHECK no lo exige y no se lee en pendiente.
  UPDATE liquidaciones_repartidor
     SET estado               = 'pendiente',
         cerrada_por          = NULL,
         cerrada_en           = NULL,
         monto_total_recibido = NULL,
         tarifa_retenida      = NULL,
         payout_tienda        = NULL,
         notas                = NULL,
         updated_at           = NOW()
   WHERE id = p_liquidacion_id
  RETURNING * INTO v_actual;

  -- Cierra el flag apenas pasa el UPDATE legitimo: ningun statement posterior puede reabrir.
  PERFORM set_config('app.reabrir_rpc', '0', true);

  -- Des-conciliar: update/anular_pago vuelven a permitir correccion y el envio queda elegible
  -- para re-snapshot al cerrar de nuevo. Corre con el header ya pendiente (rama allow del 039).
  UPDATE liquidacion_envios
     SET conciliado = FALSE
   WHERE liquidacion_id = p_liquidacion_id;

  v_descrip := format(
    'Liquidacion reabierta (estaba %s, esperado %s Gs, recibido %s Gs). Motivo: %s',
    v_previa.estado, v_previa.monto_total_esperado,
    COALESCE(v_previa.monto_total_recibido, 0), p_motivo
  );

  INSERT INTO auditoria_log (
    usuario, usuario_id, accion, entidad, entidad_id,
    descripcion, valor_anterior, valor_nuevo, ip_address, user_agent
  ) VALUES (
    p_usuario_nombre, p_actor, 'reabrir', 'liquidacion', v_actual.id::TEXT,
    v_descrip, to_jsonb(v_previa), to_jsonb(v_actual), p_ip, p_user_agent
  );

  RETURN v_actual;
END;
$function$;


-- =====================================================================================
-- FIX #2  ALTA 3: app.pago_rpc reseteado a '0' al final de create_pago_atomico.
--
-- create dejaba el flag en '1' el resto de la transaccion (a diferencia de update/anular que lo
-- resetean), dejando trg_pagos_no_update_fisico fail-open: un UPDATE crudo posterior en la misma
-- tx forjaba monto_recibido. Se resetea inmediatamente despues del INSERT ... RETURNING, antes de
-- la auditoria. Resto del cuerpo intacto (verificado contra def viva).
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.create_pago_atomico(p_envio_id uuid, p_monto_total bigint, p_monto_recibido bigint, p_metodo_pago metodo_pago, p_fecha_pago date, p_referencia text, p_notas text, p_creado_por uuid, p_usuario_nombre text, p_tracking_number text, p_ip inet, p_user_agent text)
 RETURNS pagos
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_estado       estado_pago;
  v_pago         pagos;
  v_descripcion  TEXT;
  v_tipo_pago    tipo_pago;
  v_monto_total  BIGINT;
  v_eliminado    BOOLEAN;
BEGIN
  -- Habilita el guard de inmutabilidad fisica (4.7) para los UPDATE que el sync trigger dispara
  -- sobre envios. En create no hay UPDATE de pagos, pero el flag se setea uniforme en las tres RPCs.
  PERFORM set_config('app.pago_rpc', '1', true);

  -- P: lock de la franja de pagos del envio primero (orden canonico P -> E -> L). No hay pago
  -- aun, pero el lock de rango serializa contra otro create del mismo envio.
  PERFORM 1 FROM pagos WHERE envio_id = p_envio_id AND anulado = FALSE FOR UPDATE;

  -- E: lock del envio. Fuente de verdad del importe. COD = monto_a_cobrar; anticipado =
  -- costo+seguro (el repartidor cobra el envio). Serializa contra trg_envio_block_cod_monto_change.
  SELECT tipo_pago, eliminado,
         CASE
           WHEN tipo_pago = 'contra_entrega' THEN monto_a_cobrar
           ELSE (costo + COALESCE(costo_seguro, 0))
         END::BIGINT
    INTO v_tipo_pago, v_eliminado, v_monto_total
    FROM envios
   WHERE id = p_envio_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'envio_no_encontrado: %', p_envio_id USING ERRCODE = 'P0001';
  END IF;

  IF v_eliminado = TRUE THEN
    RAISE EXCEPTION 'pago_envio_eliminado: no se puede crear un pago para un envio anulado (envio %)', p_envio_id
      USING ERRCODE = 'P0001';
  END IF;

  IF p_monto_total IS NOT NULL AND p_monto_total <> v_monto_total THEN
    RAISE EXCEPTION 'pago_monto_total_invalido: monto_total enviado % no coincide con el del envio %',
      p_monto_total, v_monto_total
      USING ERRCODE = 'P0001';
  END IF;

  IF p_monto_recibido < 0 THEN
    RAISE EXCEPTION 'pago_monto_recibido_invalido: monto_recibido debe ser >= 0'
      USING ERRCODE = 'P0001';
  END IF;

  -- Tope (I7): el repartidor no rinde mas de lo que el envio cobra. Sobrecobro COD se rechaza.
  IF p_monto_recibido > v_monto_total THEN
    RAISE EXCEPTION 'pago_monto_recibido_invalido: monto_recibido % excede el importe del envio %',
      p_monto_recibido, v_monto_total
      USING ERRCODE = 'P0001';
  END IF;

  IF p_monto_recibido >= v_monto_total THEN
    v_estado := 'pagado';
  ELSIF p_monto_recibido > 0 THEN
    v_estado := 'pago_parcial';
  ELSE
    v_estado := 'pendiente';
  END IF;

  INSERT INTO pagos (
    envio_id, monto_total, monto_recibido, metodo_pago, estado_pago,
    fecha_pago, referencia, notas, creado_por
  ) VALUES (
    p_envio_id, v_monto_total, p_monto_recibido, p_metodo_pago, v_estado,
    p_fecha_pago, p_referencia, p_notas, p_creado_por
  )
  RETURNING * INTO v_pago;

  -- Cierra el flag apenas pasa el INSERT legitimo: ningun statement posterior puede mutar pagos
  -- en esta tx (cierra ALTA 3, antes quedaba en '1' el resto de la transaccion).
  PERFORM set_config('app.pago_rpc', '0', true);

  v_descripcion := format(
    'Pago creado para envio %s: %s/%s Gs. (%s)',
    p_tracking_number, p_monto_recibido, v_monto_total, v_estado
  );

  INSERT INTO auditoria_log (
    usuario, usuario_id, accion, entidad, entidad_id,
    descripcion, valor_anterior, valor_nuevo, ip_address, user_agent
  ) VALUES (
    p_usuario_nombre, p_creado_por, 'pago', 'pago', v_pago.id::TEXT,
    v_descripcion, NULL, to_jsonb(v_pago), p_ip, p_user_agent
  );

  RETURN v_pago;
END;
$function$;


-- =====================================================================================
-- FIX #3  ALTA 5 + BAJA 10: costo/costo_seguro/monto_a_cobrar congelados en AMBOS modos una vez
--          que hay cobro real (pago activo) o el envio entro a una liquidacion.
--
-- El guard 037 solo disparaba BEFORE UPDATE OF monto_a_cobrar y solo para contra_entrega, dejando
-- costo/costo_seguro editables post-pago: cerrar_liquidacion recomputa tarifa_retenida y
-- payout_tienda leyendo costo LIVE, asi que mover costo re-dividia el split GO EXPRESS vs tienda en
-- silencio. Ahora cubre los tres campos y los dos modos: anticipado tambien tiene cobro real y su
-- tarifa = costo+seguro alimenta el payout. El ajuste de costo va por recreacion del envio, no por
-- UPDATE in-place (mismo principio que el PUT admin, que ya omite costo/monto).
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.trg_envio_block_cod_monto_change_fn()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- Solo importa si efectivamente cambia alguno de los campos que alimentan el ledger.
  IF NEW.monto_a_cobrar     IS NOT DISTINCT FROM OLD.monto_a_cobrar
     AND NEW.costo          IS NOT DISTINCT FROM OLD.costo
     AND NEW.costo_seguro   IS NOT DISTINCT FROM OLD.costo_seguro THEN
    RETURN NEW;
  END IF;

  -- Cobro real asentado: el monto y la tarifa quedan congelados. Anular el pago primero.
  IF EXISTS (SELECT 1 FROM pagos WHERE envio_id = NEW.id AND anulado = FALSE) THEN
    RAISE EXCEPTION 'cod_monto_no_modificable: el envio ya tiene un pago activo, anular el pago antes de cambiar monto/costo'
      USING ERRCODE = 'P0001';
  END IF;

  -- Ya esta en una liquidacion: el split se sella con la tarifa de ese momento. Reabrir/recrear.
  IF EXISTS (SELECT 1 FROM liquidacion_envios WHERE envio_id = NEW.id) THEN
    RAISE EXCEPTION 'cod_monto_no_modificable: el envio ya esta en una liquidacion, no se puede cambiar monto/costo'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_envio_block_cod_monto_change ON public.envios;
CREATE TRIGGER trg_envio_block_cod_monto_change
  BEFORE UPDATE OF monto_a_cobrar, costo, costo_seguro ON public.envios
  FOR EACH ROW EXECUTE FUNCTION public.trg_envio_block_cod_monto_change_fn();


-- =====================================================================================
-- FIX #7  MEDIA 8: conservacion del cierre con_diferencia + coherencia de pago al flipar a pagado.
--
-- (a) cerrar_liquidacion rama con_diferencia computaba payout_tienda = SUM(monto_esperado - tarifa),
--     sobre lo ESPERADO, no sobre el efectivo rendido: sobre-pagaba a la tienda el faltante del
--     repartidor. Ahora con_diferencia deriva el payout del efectivo real:
--     payout_tienda = monto_total_recibido - tarifa_retenida (clamp a 0 si el rendido no cubre la
--     tarifa), de modo que tarifa_retenida + payout_tienda = monto_total_recibido SIEMPRE.
--     El caso sin diferencia (cerrada) mantiene payout = esperado - tarifa (== recibido - tarifa,
--     porque recibido == esperado), asi que la conservacion vale en ambas ramas.
-- (b) CHECK liquidacion_payout_conservacion: para estados sellados, tarifa+payout == recibido.
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.cerrar_liquidacion(p_liquidacion_id uuid, p_monto_recibido bigint, p_notas text, p_cerrado_por uuid, p_usuario_nombre text, p_ip inet, p_user_agent text)
 RETURNS liquidaciones_repartidor
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_previa         liquidaciones_repartidor;
  v_actual         liquidaciones_repartidor;
  v_estado         estado_liquidacion;
  v_esperado       BIGINT := 0;
  v_tarifa         BIGINT := 0;
  v_payout         BIGINT := 0;
  v_diferencia     BIGINT;
  v_descripcion    TEXT;
BEGIN
  IF p_monto_recibido < 0 THEN
    RAISE EXCEPTION 'monto_invalido: monto_recibido debe ser >= 0'
      USING ERRCODE = 'P0001';
  END IF;

  -- L: lock de la liquidacion.
  SELECT * INTO v_previa
    FROM liquidaciones_repartidor
   WHERE id = p_liquidacion_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'liquidacion_no_encontrada: %', p_liquidacion_id
      USING ERRCODE = 'P0001';
  END IF;

  IF v_previa.estado <> 'pendiente' THEN
    RAISE EXCEPTION 'liquidacion_ya_cerrada: %', p_liquidacion_id
      USING ERRCODE = 'P0001';
  END IF;

  -- E: lockear bajo el set elegible vigente (mismo predicado que 4.1). Materializa los envio_id
  -- ELEGIBLES de ESTE rango/repartidor que NO esten conciliados en OTRA liquidacion.
  DROP TABLE IF EXISTS tmp_elegibles;
  CREATE TEMP TABLE tmp_elegibles ON COMMIT DROP AS
  SELECT e.id AS envio_id,
         e.monto_a_cobrar AS monto_esperado,
         COALESCE(e.monto_cobrado, 0) AS monto_cobrado,
         (e.costo + COALESCE(e.costo_seguro, 0))::BIGINT AS tarifa
    FROM envios e
   WHERE e.repartidor_id = v_previa.repartidor_id
     AND e.estado = 'entregado'
     AND e.tipo_pago IN ('anticipado', 'contra_entrega')
     AND e.eliminado = FALSE
     AND e.fecha_entrega_real IS NOT NULL
     AND (e.fecha_entrega_real AT TIME ZONE 'America/Asuncion')::date
         BETWEEN v_previa.fecha_desde AND v_previa.fecha_hasta
     AND EXISTS (
       SELECT 1 FROM pagos p
        WHERE p.envio_id = e.id
          AND p.anulado = FALSE
          AND p.estado_pago = 'pagado'
     )
     AND NOT EXISTS (
       SELECT 1 FROM liquidacion_envios le
        WHERE le.envio_id = e.id
          AND le.conciliado = TRUE
          AND le.liquidacion_id <> p_liquidacion_id
     )
   ORDER BY e.id
   FOR UPDATE OF e;

  -- DELETE las filas de ESTA liq que ya no califican (cobro anulado tras crear, etc).
  DELETE FROM liquidacion_envios le
   WHERE le.liquidacion_id = p_liquidacion_id
     AND NOT EXISTS (
       SELECT 1 FROM tmp_elegibles t WHERE t.envio_id = le.envio_id
     );

  -- UPSERT las que ahora califican; re-snapshot de monto_esperado y monto_cobrado reales.
  INSERT INTO liquidacion_envios (liquidacion_id, envio_id, monto_esperado, monto_cobrado, conciliado)
  SELECT p_liquidacion_id, t.envio_id, t.monto_esperado, t.monto_cobrado, FALSE
    FROM tmp_elegibles t
  ON CONFLICT (liquidacion_id, envio_id)
  DO UPDATE SET monto_esperado = EXCLUDED.monto_esperado,
                monto_cobrado  = EXCLUDED.monto_cobrado;

  -- Recompute sobre el set vigente. tarifa_retenida = SUM(costo+seguro).
  SELECT COALESCE(SUM(monto_esperado), 0)::BIGINT,
         COALESCE(SUM(tarifa), 0)::BIGINT
    INTO v_esperado, v_tarifa
    FROM tmp_elegibles;

  v_diferencia := p_monto_recibido - v_esperado;

  IF v_diferencia = 0 THEN
    v_estado := 'cerrada';
    -- Sin diferencia: payout = esperado - tarifa = recibido - tarifa. Conservacion exacta.
    v_payout := v_esperado - v_tarifa;
  ELSE
    v_estado := 'con_diferencia';
    IF p_notas IS NULL OR length(trim(p_notas)) < 10 THEN
      RAISE EXCEPTION 'notas_requeridas: cerrar con diferencia requiere notas de al menos 10 caracteres'
        USING ERRCODE = 'P0001';
    END IF;
    -- Con diferencia: el payout sale del EFECTIVO REAL rendido, no del esperado. La tienda no
    -- absorbe el faltante del repartidor por sobre-pago. Clamp a 0 si lo rendido no cubre la
    -- tarifa GO EXPRESS (el faltante queda como diferencia a reclamar al repartidor, no como payout
    -- negativo a la tienda). Conservacion: tarifa_retenida + payout_tienda = monto_total_recibido.
    v_payout := GREATEST(p_monto_recibido - v_tarifa, 0);
  END IF;

  UPDATE liquidaciones_repartidor
     SET monto_total_esperado = v_esperado,
         monto_total_recibido = p_monto_recibido,
         tarifa_retenida      = v_tarifa,
         payout_tienda        = v_payout,
         estado               = v_estado,
         cerrada_por          = p_cerrado_por,
         cerrada_en           = NOW(),
         notas                = p_notas,
         updated_at           = NOW()
   WHERE id = p_liquidacion_id
  RETURNING * INTO v_actual;

  -- RECIEN AHI sella: conciliado=TRUE sobre el set vigente (re-validado contra cobro real).
  UPDATE liquidacion_envios
     SET conciliado = TRUE
   WHERE liquidacion_id = p_liquidacion_id;

  v_descripcion := format(
    'Liquidacion cerrada: esperado %s Gs, recibido %s Gs, tarifa %s Gs, payout %s Gs, diferencia %s (%s)',
    v_esperado, p_monto_recibido, v_tarifa, v_payout, v_diferencia, v_estado
  );

  INSERT INTO auditoria_log (
    usuario, usuario_id, accion, entidad, entidad_id,
    descripcion, valor_anterior, valor_nuevo, ip_address, user_agent
  ) VALUES (
    p_usuario_nombre, p_cerrado_por, 'editar', 'liquidacion', v_actual.id::TEXT,
    v_descripcion, to_jsonb(v_previa), to_jsonb(v_actual), p_ip, p_user_agent
  );

  RETURN v_actual;
END;
$function$;

-- Conservacion del payout en estados sellados: lo retenido por GO EXPRESS mas lo que va a la tienda
-- es exactamente el efectivo rendido. NOT VALID + VALIDATE para no romper si hubiera historico
-- (en prod no hay liquidaciones, valida limpio). En pendiente los campos son NULL, no aplica.
ALTER TABLE public.liquidaciones_repartidor
  DROP CONSTRAINT IF EXISTS liquidacion_payout_conservacion;
ALTER TABLE public.liquidaciones_repartidor
  ADD CONSTRAINT liquidacion_payout_conservacion CHECK (
    estado = 'pendiente'
    OR (tarifa_retenida IS NOT NULL AND payout_tienda IS NOT NULL
        AND tarifa_retenida + payout_tienda = monto_total_recibido)
  ) NOT VALID;
ALTER TABLE public.liquidaciones_repartidor VALIDATE CONSTRAINT liquidacion_payout_conservacion;


-- update_pago_atomico: al flipar a 'pagado' re-sincroniza monto_total al importe real del envio
-- (v_monto_real) en el MISMO UPDATE cuando difiere, para que el pago no quede 'pagado' con
-- monto_recibido >= v_monto_real pero monto_total stale. Resto intacto (verificado contra def viva).
CREATE OR REPLACE FUNCTION public.update_pago_atomico(p_pago_id uuid, p_monto_recibido bigint, p_metodo_pago metodo_pago, p_fecha_pago date, p_referencia text, p_notas text, p_apply_metodo boolean, p_apply_fecha boolean, p_apply_referencia boolean, p_apply_notas boolean, p_actualizado_por uuid, p_usuario_nombre text, p_ip inet, p_user_agent text)
 RETURNS pagos
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pago_previo  pagos;
  v_pago_actual  pagos;
  v_estado       estado_pago;
  v_tipo_pago    tipo_pago;
  v_monto_real   BIGINT;
  v_descripcion  TEXT;
BEGIN
  PERFORM set_config('app.pago_rpc', '1', true);

  -- P: lock del pago.
  SELECT * INTO v_pago_previo
    FROM pagos
   WHERE id = p_pago_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'pago_no_encontrado: %', p_pago_id USING ERRCODE = 'P0001';
  END IF;

  IF v_pago_previo.anulado = TRUE THEN
    RAISE EXCEPTION 'pago_ya_anulado: %', p_pago_id USING ERRCODE = 'P0001';
  END IF;

  -- L: lock de la liquidacion del envio en el orden canonico antes de leer su estado.
  PERFORM 1
     FROM liquidacion_envios le
     JOIN liquidaciones_repartidor l ON l.id = le.liquidacion_id
    WHERE le.envio_id = v_pago_previo.envio_id
    FOR UPDATE OF l;

  -- 4.4: ambos estados settled bloquean. La correccion pasa por reabrir_liquidacion.
  IF EXISTS (
    SELECT 1
      FROM liquidacion_envios le
      JOIN liquidaciones_repartidor l ON l.id = le.liquidacion_id
     WHERE le.envio_id = v_pago_previo.envio_id
       AND l.estado IN ('cerrada', 'con_diferencia')
  ) THEN
    RAISE EXCEPTION 'pago_en_liquidacion_cerrada: el envio pertenece a una liquidacion sellada; reabrir la liquidacion antes de editar el pago'
      USING ERRCODE = 'P0001';
  END IF;

  -- E: lock del envio. Importe segun modo (COD = monto_a_cobrar; anticipado = costo+seguro).
  SELECT tipo_pago,
         CASE
           WHEN tipo_pago = 'contra_entrega' THEN monto_a_cobrar
           ELSE (costo + COALESCE(costo_seguro, 0))
         END::BIGINT
    INTO v_tipo_pago, v_monto_real
    FROM envios
   WHERE id = v_pago_previo.envio_id
   FOR UPDATE;

  IF p_monto_recibido < 0 THEN
    RAISE EXCEPTION 'pago_monto_recibido_invalido: monto_recibido debe ser >= 0'
      USING ERRCODE = 'P0001';
  END IF;

  -- Tope (I7).
  IF v_monto_real IS NOT NULL AND p_monto_recibido > v_monto_real THEN
    RAISE EXCEPTION 'pago_monto_recibido_invalido: monto_recibido % excede el importe del envio %',
      p_monto_recibido, v_monto_real
      USING ERRCODE = 'P0001';
  END IF;

  IF v_monto_real IS NOT NULL AND p_monto_recibido >= v_monto_real THEN
    v_estado := 'pagado';
  ELSIF p_monto_recibido >= v_pago_previo.monto_total THEN
    v_estado := 'pagado';
  ELSIF p_monto_recibido > 0 THEN
    v_estado := 'pago_parcial';
  ELSE
    v_estado := 'pendiente';
  END IF;

  UPDATE pagos
     SET monto_recibido = p_monto_recibido,
         -- Re-sync del total al importe real del envio cuando difiere (MEDIA 8): evita quedar
         -- 'pagado' con un monto_total stale que no refleja el envio. Si no hay importe real
         -- legible, conserva el previo.
         monto_total    = COALESCE(v_monto_real, monto_total),
         estado_pago    = v_estado,
         metodo_pago    = CASE WHEN p_apply_metodo     THEN p_metodo_pago ELSE metodo_pago END,
         fecha_pago     = CASE WHEN p_apply_fecha      THEN p_fecha_pago   ELSE fecha_pago  END,
         referencia     = CASE WHEN p_apply_referencia THEN p_referencia   ELSE referencia  END,
         notas          = CASE WHEN p_apply_notas      THEN p_notas        ELSE notas       END,
         updated_at     = NOW()
   WHERE id = p_pago_id
  RETURNING * INTO v_pago_actual;

  -- Cierra el flag apenas pasa el UPDATE legitimo: ningun statement posterior puede mutar pagos.
  PERFORM set_config('app.pago_rpc', '0', true);

  v_descripcion := format(
    'Pago actualizado: %s/%s Gs. (%s)',
    v_pago_actual.monto_recibido, v_pago_actual.monto_total, v_pago_actual.estado_pago
  );

  INSERT INTO auditoria_log (
    usuario, usuario_id, accion, entidad, entidad_id,
    descripcion, valor_anterior, valor_nuevo, ip_address, user_agent
  ) VALUES (
    p_usuario_nombre, p_actualizado_por, 'editar', 'pago', v_pago_actual.id::TEXT,
    v_descripcion, to_jsonb(v_pago_previo), to_jsonb(v_pago_actual), p_ip, p_user_agent
  );

  RETURN v_pago_actual;
END;
$function$;

-- Coherencia del pago pagado: un pago 'pagado' nunca tiene monto_recibido < monto_total. Hoy lo
-- garantiza el flujo, pero el CHECK lo blinda a nivel DB (defensa en profundidad MEDIA 8).
-- NOT VALID + VALIDATE: en prod no hay pagos, valida limpio.
ALTER TABLE public.pagos
  DROP CONSTRAINT IF EXISTS pagos_pagado_coherente;
ALTER TABLE public.pagos
  ADD CONSTRAINT pagos_pagado_coherente CHECK (
    estado_pago <> 'pagado' OR monto_recibido >= monto_total
  ) NOT VALID;
ALTER TABLE public.pagos VALIDATE CONSTRAINT pagos_pagado_coherente;


-- =====================================================================================
-- FIX #6  MEDIA 7: una sola tarifa activa por (origen, destino, tipo_servicio) normalizados.
--
-- Asuncion -> Ciudad del Este tenia DOS tarifas activas (30k creada 2026-06-17, 40k tocada por
-- ultima vez 2026-04-22). computeCostoEnvio hace .find() sobre el set activo sin ORDER BY, asi que
-- el split GO EXPRESS vs tienda dependia del orden no determinista de Postgres. Se desactiva la
-- duplicada mas vieja (40k) dejando la vigente (30k) y se blinda con un indice unico parcial.
-- La normalizacion replica normalizeCiudad del TS (lower + strip tildes + colapsar espacios) via
-- una funcion IMMUTABLE (unaccent es STABLE y no sirve en expresion de indice).
--
-- NOTA(gaston): si la tarifa correcta Asuncion->CDE fuese 40k y no 30k, reactivar la fila
-- d945c179-4072-4c6c-abda-f613b13f8d80 y desactivar la 7719af52-...; el indice exige que quede UNA.
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.tarifa_norm_ciudad(p_in text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 PARALLEL SAFE
AS $function$
  -- Espeja normalizeCiudad (src/lib/ciudad.ts): lower, quita tildes/dieresis/enie, colapsa espacios.
  SELECT regexp_replace(
           btrim(
             translate(
               lower(p_in),
               'áàäâãéèëêíìïîóòöôõúùüûñç',
               'aaaaaeeeeiiiiooooouuuunc'
             )
           ),
           '\s+', ' ', 'g'
         );
$function$;

-- Resolver la duplicada existente ANTES de crear el indice (si no, falla por la colision).
-- Solo toca la fila stale si efectivamente sigue activa y duplicada (idempotente en re-corridas).
UPDATE public.tarifas
   SET activo = FALSE, updated_at = NOW()
 WHERE id = 'd945c179-4072-4c6c-abda-f613b13f8d80'
   AND activo = TRUE
   AND eliminado = FALSE;

CREATE UNIQUE INDEX IF NOT EXISTS tarifas_ruta_servicio_unica
  ON public.tarifas (
    public.tarifa_norm_ciudad(origen),
    public.tarifa_norm_ciudad(destino),
    tipo_servicio
  )
  WHERE (activo = TRUE AND eliminado = FALSE);

COMMIT;

-- ROLLBACK manual (restaura el estado 039/038/037/036 vigente antes de 040):
--   - Re-crear trg_liquidacion_envios_inmutable_fn y su trigger como BEFORE UPDATE OR DELETE
--     con la excepcion sin los IS NOT DISTINCT FROM (def de sql/039).
--   - Re-crear trg_liquidacion_inmutable_fn sin la rama de reapertura (def de sql/038) y
--     reabrir_liquidacion sin el set_config('app.reabrir_rpc', ...).
--   - Re-crear create_pago_atomico sin el reset de app.pago_rpc (def previa).
--   - Re-crear trg_envio_block_cod_monto_change_fn + trigger como BEFORE UPDATE OF monto_a_cobrar
--     solo contra_entrega (def de sql/037).
--   - Re-crear cerrar_liquidacion con payout = SUM(esperado - tarifa) en ambas ramas y
--     update_pago_atomico sin el re-sync de monto_total.
--   - ALTER TABLE liquidaciones_repartidor DROP CONSTRAINT liquidacion_payout_conservacion;
--     ALTER TABLE pagos DROP CONSTRAINT pagos_pagado_coherente;
--   - DROP INDEX tarifas_ruta_servicio_unica; DROP FUNCTION tarifa_norm_ciudad(text);
--     UPDATE tarifas SET activo=TRUE WHERE id='d945c179-4072-4c6c-abda-f613b13f8d80';

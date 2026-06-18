-- 036_remove_cc_and_cod_core.sql
-- Plan maestro de remediacion 036, ETAPA 1 (parte 1 + parte 2). Spec:
-- docs/036-MASTER-REMEDIATION-PLAN.md. Cierra el agujero central que la 035 dejo vivo en prod
-- (docs/STEP4-REAUDIT-035-REPORT.md): 1 CRITICA + 10 ALTA que colapsan en 4 causas raiz.
--
-- Contexto legal: plata real de afiliados, owner personalmente expuesto, tolerancia a error CERO.
-- Decision de producto (2026-06-18): se ELIMINA cuenta corriente. Modelo COD-only. La tarifa se
-- netea del COD cobrado. Borrar el subsistema mas bug-denso en vez de seguir parchandolo.
--
-- ALCANCE de este archivo: PARTE 1 (remocion CC) + PARTE 2 (4.1-4.7 COD repartidor). NO incluye
-- la PARTE 3 (settlement de tienda, 4.8): subsistema nuevo, va en su propia migracion. El orden
-- de lock de PARTE 2 se disena compatible con el orden canonico P -> E -> L -> S (S reservado).
--
-- ESTADO PROD VERIFICADO (introspeccion 2026-06-18, pooler session mode):
--   clientes=2, envios=2, envios CC=0, pagos=0, movimientos_cc=0, liquidaciones=0.
--   La remocion de CC es DATA-SAFE: no hay datos que migrar.
--   tipo_pago enum = ('anticipado','contra_entrega','cuenta_corriente'). No se puede DROP un
--   valor de enum de forma segura: se BLOQUEA 'cuenta_corriente' por CHECK declarativo.
--
-- FIRMAS VERIFICADAS CONTRA pg_proc (2026-06-18) antes de cada CREATE OR REPLACE. Ninguna firma
-- cambia: el backend deployado sigue llamando con los mismos args. Verificado con
-- pg_get_function_identity_arguments para crear/cerrar/reabrir_liquidacion y
-- create/update/anular_pago_atomico.
--
-- IDEMPOTENCIA: CREATE OR REPLACE en funciones, DROP ... IF EXISTS en triggers/funciones/tablas,
-- DO-guards con IF NOT EXISTS / catalog checks en constraints y columnas. Re-ejecutable sin
-- efecto secundario.
--
-- MONTOS: BIGINT en todo el archivo. Cero floats en cualquier calculo de dinero.
--
-- ROLLBACK: seccion explicita comentada al final.

BEGIN;

-- ===========================================================================================
-- PARTE 0. GUARDAS PREVIAS (la migracion se niega a correr si la premisa de seguridad no se
-- cumple). Si hay un solo envio cuenta_corriente, abortamos: bloquear el valor dejaria datos
-- invalidos contra el CHECK nuevo. Prod verificado en 0, esta guarda lo hace inviolable.
-- ===========================================================================================

DO $guard$
DECLARE
  v_cc_envios INT;
  v_cc_mov    INT;
BEGIN
  SELECT count(*) INTO v_cc_envios FROM envios WHERE tipo_pago = 'cuenta_corriente';
  IF v_cc_envios > 0 THEN
    RAISE EXCEPTION 'abort_036: existen % envios con tipo_pago=cuenta_corriente. Migrar/anular antes de remover CC.', v_cc_envios;
  END IF;

  IF to_regclass('public.movimientos_cuenta_corriente') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM movimientos_cuenta_corriente' INTO v_cc_mov;
    IF v_cc_mov > 0 THEN
      RAISE EXCEPTION 'abort_036: movimientos_cuenta_corriente tiene % filas. Conciliar/archivar antes de dropear.', v_cc_mov;
    END IF;
  END IF;
END
$guard$;

-- ===========================================================================================
-- ===========================================================================================
-- PARTE 1 -- REMOCION DEL SUBSISTEMA CUENTA CORRIENTE (spec seccion 1)
-- ===========================================================================================
-- ===========================================================================================
--
-- Bugs que se EVAPORAN al remover CC (no se arreglan, dejan de existir): RAIZ A entera (debito
-- AFTER INSERT/UPDATE, deuda fantasma por soft-delete), A2 (reversa neto completo), A3/B2
-- (bypass limite), H2/H9 (double-reverse, clawback NC), M1 (credito fantasma vs envio
-- eliminado). RAIZ C del STEP4 colapsa: sin debito/credito CC no hay doble reverso posible.

-- 1.1 -- Bloquear tipo_pago='cuenta_corriente' a nivel DB de forma declarativa. No se puede
-- DROP el valor del enum (riesgo alto: lo referencian funciones, casts, defaults). El CHECK es
-- la barrera correcta. Prod tiene 0 envios CC, asi que se agrega ya VALIDO sin NOT VALID.
DO $cc_check$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.envios'::regclass AND conname = 'envios_tipo_pago_no_cc'
  ) THEN
    ALTER TABLE public.envios
      ADD CONSTRAINT envios_tipo_pago_no_cc
      CHECK (tipo_pago <> 'cuenta_corriente');
  END IF;
END
$cc_check$;

COMMENT ON CONSTRAINT envios_tipo_pago_no_cc ON public.envios IS
  'Modelo COD-only (036). cuenta_corriente queda fuera del sistema; solo anticipado y contra_entrega son validos. El valor del enum no se dropea (dependencias), se bloquea aca.';

-- 1.1b -- I1 a nivel DB: monto_a_cobrar >= costo+costo_seguro (el COD cubre la tarifa). Se enforza
-- por trigger BEFORE INSERT (no por CHECK) a proposito: prod tiene 2 envios legacy entregados con
-- monto_a_cobrar=0 < costo (data de prueba previa al modelo COD-only) que no se tocan aqui. Un
-- CHECK (aun NOT VALID) se re-evalua en cualquier UPDATE de la fila legacy (p.ej. el sync trigger
-- escribiendo monto_cobrado) y romperia su flujo COD. El BEFORE INSERT solo mira filas NUEVAS:
-- enforza I1 en toda creacion sin tocar el legacy. La validacion al crear tambien vive en TS (4.6).
CREATE OR REPLACE FUNCTION public.trg_envio_i1_cubre_tarifa_fn()
  RETURNS trigger
  LANGUAGE plpgsql
AS $fn$
BEGIN
  IF NEW.monto_a_cobrar < NEW.costo + COALESCE(NEW.costo_seguro, 0) THEN
    RAISE EXCEPTION 'monto_a_cobrar_insuficiente: monto_a_cobrar (%) debe cubrir costo+seguro (%)',
      NEW.monto_a_cobrar, NEW.costo + COALESCE(NEW.costo_seguro, 0)
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_envio_i1_cubre_tarifa ON public.envios;
CREATE TRIGGER trg_envio_i1_cubre_tarifa
  BEFORE INSERT ON public.envios
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_envio_i1_cubre_tarifa_fn();

-- 1.2 -- Sacar las ramas CC de las funciones de pago compartidas ANTES de dropear sus
-- dependencias. anular_pago_atomico es la unica funcion de pago que aun referencia el ledger CC
-- (rama de reverso de credito). Se reescribe sin esa rama en PARTE 2 (4.5). Por orden de
-- dependencia, primero quitamos los TRIGGERS CC de envios y pagos (su unico caller de
-- registrar_movimiento_cc por la via de INSERT/UPDATE de envio y de INSERT de pago), luego las
-- funciones, luego la tabla y las columnas.

-- Triggers CC sobre envios y pagos.
DROP TRIGGER IF EXISTS trg_envio_cuenta_corriente_debito ON public.envios;
DROP TRIGGER IF EXISTS trg_pago_cuenta_corriente_credito ON public.pagos;

-- 1.3 -- anular_pago_atomico reescrito SIN la rama CC (la version COD-only definitiva esta en
-- PARTE 2/4.5 mas abajo). Aqui solo declaramos el orden: la version de 4.5 ya no llama a
-- registrar_movimiento_cc, de modo que para cuando dropeamos esa funcion no queda caller vivo.

-- 1.4 -- Dropear funciones CC. CASCADE no se usa para no arrastrar nada inesperado: cada objeto
-- se nombra explicito. registrar_movimiento_cc se dropea DESPUES de PARTE 2 (4.5) para no dejar
-- anular_pago_atomico apuntando a una funcion inexistente durante la transaccion. Por eso aqui
-- solo dropeamos las funciones que YA no tienen caller tras quitar los triggers de 1.2.
DROP FUNCTION IF EXISTS public.trg_envio_cc_debito_fn();
DROP FUNCTION IF EXISTS public.trg_pago_cc_credito_fn();
DROP FUNCTION IF EXISTS public.verificar_saldo_cc();
DROP FUNCTION IF EXISTS public.recompute_saldo_cc(uuid);

-- registrar_movimiento_cc y trg_movcc_append_only_fn se dropean al final de PARTE 1 (1.7),
-- despues de que 4.5 reescriba anular_pago_atomico sin la rama CC.

-- ===========================================================================================
-- ===========================================================================================
-- PARTE 2 -- NUCLEO COD REPARTIDOR (spec 4.1-4.7)
-- ===========================================================================================
-- ===========================================================================================
--
-- Cinco principios (spec seccion 2): P1 una sola fuente de verdad para "cobrado" (EXISTS pago
-- pagado no anulado, el flag es senal forense, nunca gate). P2 el cierre es el unico punto que
-- sella (cerrar re-selecciona, re-snapshotea, re-valida, recien ahi conciliado=TRUE). P3 una
-- sola via de reversa (anular_pago). P4 un solo orden de lock P -> E -> L. P5 inmutabilidad y
-- server-side por DB.

-- -------------------------------------------------------------------------------------------
-- 4.7 -- INMUTABILIDAD FISICA DE pagos (spec 4.7)
-- -------------------------------------------------------------------------------------------
-- Estado previo (verificado): FK pagos.envio_id ON DELETE RESTRICT (035, OK), UNIQUE parcial
-- pagos_envio_id_unique_active WHERE anulado=false (OK), trg_pagos_no_delete BEFORE DELETE (OK).
-- FALTA: BEFORE UPDATE fisico. Pero update_pago_atomico y anular_pago_atomico LEGITIMAMENTE
-- hacen UPDATE de pagos, y trg_pagos_updated_at es BEFORE UPDATE. Un trigger que bloquee todo
-- UPDATE romperia las RPCs. Solucion estandar: GUC transaccion-local. Las RPCs setean
-- SET LOCAL app.pago_rpc='1' al entrar; el trigger BEFORE UPDATE rechaza salvo que el flag este
-- en '1'. SET LOCAL muere al terminar la transaccion: un UPDATE ad-hoc fuera de una RPC nunca
-- ve el flag y se rechaza.

CREATE OR REPLACE FUNCTION public.trg_pagos_no_update_fisico_fn()
  RETURNS trigger
  LANGUAGE plpgsql
AS $fn$
BEGIN
  -- Solo las RPCs atomicas (que setean SET LOCAL app.pago_rpc='1' bajo SECURITY DEFINER) pueden
  -- mutar un pago. Cualquier UPDATE directo sobre pagos es un intento de tocar plata por fuera
  -- del ledger y se rechaza a nivel DB. El flag es transaccion-local: no persiste ni se puede
  -- setear desde fuera de la RPC sin abrir la transaccion explicitamente.
  -- El flag es '1' SOLO durante el UPDATE que la RPC dispara, y la RPC lo resetea a '0' apenas
  -- termina ese UPDATE. Asi un UPDATE ad-hoc posterior en la misma transaccion (despues de la
  -- RPC) tampoco pasa: el flag ya no esta en '1'.
  IF current_setting('app.pago_rpc', true) IS DISTINCT FROM '1' THEN
    RAISE EXCEPTION 'pago_no_modificable: un pago no se edita fisicamente; usar update_pago_atomico o anular_pago_atomico'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_pagos_no_update_fisico ON public.pagos;
-- Corre ANTES que trg_pagos_updated_at (orden alfabetico de nombre de trigger en el mismo
-- timing/evento: 'no_update_fisico' < 'updated_at'). Si el guard rechaza, updated_at no llega a
-- correr. Ambos BEFORE UPDATE FOR EACH ROW.
CREATE TRIGGER trg_pagos_no_update_fisico
  BEFORE UPDATE ON public.pagos
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_pagos_no_update_fisico_fn();

-- FK RESTRICT y UNIQUE parcial: confirmacion idempotente (035 ya los dejo, esto es defensa).
DO $imm$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.pagos'::regclass AND contype = 'f'
       AND confrelid = 'public.envios'::regclass AND confdeltype = 'r'
  ) THEN
    ALTER TABLE public.pagos DROP CONSTRAINT IF EXISTS pagos_envio_id_fkey;
    ALTER TABLE public.pagos
      ADD CONSTRAINT pagos_envio_id_fkey
      FOREIGN KEY (envio_id) REFERENCES public.envios(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public' AND tablename = 'pagos'
       AND indexname = 'pagos_envio_id_unique_active'
  ) THEN
    CREATE UNIQUE INDEX pagos_envio_id_unique_active
      ON public.pagos (envio_id) WHERE (anulado = false);
  END IF;
END
$imm$;

-- -------------------------------------------------------------------------------------------
-- 4.5 (sync) -- trg_pago_sync_envio_cobrado_fn: AMBOS modos de cobro (spec 4.5 + 0)
-- -------------------------------------------------------------------------------------------
-- La 035 solo sincronizaba contra_entrega. En el modelo COD-only el repartidor TAMBIEN cobra el
-- envio en anticipado (cobra costo+seguro), asi que anticipado entra a liquidacion y su cobro
-- debe trackearse igual. El gate de cobro real (EXISTS pago pagado) y monto_cobrado dependen de
-- este sync para AMBOS modos.
--   INSERT: primer asiento. monto_cobrado := efectivo, y limpia cod_pago_pendiente SOLO si el
--           pago cubre (estado_pago='pagado' y no anulado). Pago parcial/0/anulado deja pendiente.
--   UPDATE: sincroniza monto_cobrado SOLAMENTE, NUNCA toca cod_pago_pendiente (C3): la senal
--           forense de divergencia de calle se limpia por accion humana auditada, no por editar
--           un monto. Excepcion: anular (anulado FALSE -> TRUE) reabre la cola (cobro deshecho).
-- Firma del trigger conservada (AFTER INSERT OR UPDATE OF monto_recibido, anulado).
CREATE OR REPLACE FUNCTION public.trg_pago_sync_envio_cobrado_fn()
  RETURNS trigger
  LANGUAGE plpgsql
AS $fn$
DECLARE
  v_tipo_pago        TEXT;
  v_efectivo_cobrado BIGINT;
  v_pendiente        BOOLEAN;
BEGIN
  SELECT tipo_pago INTO v_tipo_pago
    FROM envios
   WHERE id = NEW.envio_id;

  -- COD-only: ambos modos cobran efectivo en la calle. cuenta_corriente ya no existe (bloqueado
  -- por CHECK), pero el guard explicito mantiene el trigger inerte ante cualquier otro valor.
  IF v_tipo_pago IS NULL OR v_tipo_pago NOT IN ('anticipado', 'contra_entrega') THEN
    RETURN NEW;
  END IF;

  IF NEW.anulado = TRUE THEN
    v_efectivo_cobrado := 0;
  ELSE
    v_efectivo_cobrado := NEW.monto_recibido;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.anulado = TRUE THEN
      v_pendiente := TRUE;
    ELSE
      v_pendiente := (NEW.estado_pago <> 'pagado');
    END IF;

    UPDATE envios
       SET monto_cobrado      = v_efectivo_cobrado,
           cod_pago_pendiente = v_pendiente
     WHERE id = NEW.envio_id;

    RETURN NEW;
  END IF;

  -- UPDATE. Anular reabre la cola; cualquier otro UPDATE solo sincroniza el efectivo.
  IF NEW.anulado = TRUE AND OLD.anulado = FALSE THEN
    UPDATE envios
       SET monto_cobrado      = 0,
           cod_pago_pendiente = TRUE
     WHERE id = NEW.envio_id;
  ELSE
    UPDATE envios
       SET monto_cobrado = v_efectivo_cobrado
     WHERE id = NEW.envio_id;
  END IF;

  RETURN NEW;
END;
$fn$;

-- -------------------------------------------------------------------------------------------
-- 4.5 -- create_pago_atomico: orden de lock P -> E, tope, sin rama CC (spec 4.5, Fix5/H12)
-- -------------------------------------------------------------------------------------------
-- P -> E: PERFORM 1 FROM pagos ... FOR UPDATE (P) ANTES del SELECT envios FOR UPDATE (E). Cierra
-- el deadlock H12 (035 lockeaba solo el envio, invirtiendo el orden vs update/anular).
-- Tope: monto_recibido <= monto_a_cobrar (COD) o costo+seguro segun modo. Firma intacta.
CREATE OR REPLACE FUNCTION public.create_pago_atomico(
  p_envio_id uuid, p_monto_total bigint, p_monto_recibido bigint, p_metodo_pago metodo_pago,
  p_fecha_pago date, p_referencia text, p_notas text, p_creado_por uuid, p_usuario_nombre text,
  p_tracking_number text, p_ip inet, p_user_agent text)
 RETURNS pagos
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
DECLARE
  v_estado       estado_pago;
  v_pago         pagos;
  v_descripcion  TEXT;
  v_tipo_pago    tipo_pago;
  v_monto_total  BIGINT;
  v_eliminado    BOOLEAN;
BEGIN
  -- Habilita el guard de inmutabilidad fisica (4.7) para los UPDATE que el sync trigger dispara
  -- sobre envios no, sobre pagos si en update/anular. En create no hay UPDATE de pagos, pero el
  -- flag se setea de forma uniforme en las tres RPCs para no depender del path.
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
$fn$;

-- -------------------------------------------------------------------------------------------
-- 4.5 + 4.4 -- update_pago_atomico: lock P -> E -> L, guard IN (cerrada, con_diferencia), tope
-- -------------------------------------------------------------------------------------------
-- P: lock del pago FOR UPDATE. L: lock de la(s) liquidacion(es) del envio FOR UPDATE OF l (mismo
-- orden que cerrar). E: lock del envio FOR UPDATE. Guard 4.4: bloquea si la liquidacion esta en
-- ('cerrada','con_diferencia') (ambos son settled, caja contada; la unica via es reabrir). Sin
-- rama CC. Firma intacta.
CREATE OR REPLACE FUNCTION public.update_pago_atomico(
  p_pago_id uuid, p_monto_recibido bigint, p_metodo_pago metodo_pago, p_fecha_pago date,
  p_referencia text, p_notas text, p_apply_metodo boolean, p_apply_fecha boolean,
  p_apply_referencia boolean, p_apply_notas boolean, p_actualizado_por uuid,
  p_usuario_nombre text, p_ip inet, p_user_agent text)
 RETURNS pagos
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
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
$fn$;

-- -------------------------------------------------------------------------------------------
-- 4.5 + 4.4 -- anular_pago_atomico: lock P -> E -> L, guard settled, SIN rama CC (spec 4.5)
-- -------------------------------------------------------------------------------------------
-- La rama de reverso de credito CC se ELIMINA (P3 trivial sin CC). El reverso del cobro del
-- envio lo hace el sync trigger (anulado FALSE -> TRUE pone monto_cobrado=0, cod_pago_pendiente
-- =TRUE). Firma intacta.
CREATE OR REPLACE FUNCTION public.anular_pago_atomico(
  p_pago_id uuid, p_motivo text, p_anulado_por uuid, p_usuario_nombre text,
  p_ip inet, p_user_agent text)
 RETURNS pagos
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
DECLARE
  v_pago_previo   pagos;
  v_pago_actual   pagos;
  v_descripcion   TEXT;
BEGIN
  PERFORM set_config('app.pago_rpc', '1', true);

  IF p_motivo IS NULL OR length(p_motivo) < 10 THEN
    RAISE EXCEPTION 'motivo_insuficiente: el motivo debe tener al menos 10 caracteres'
      USING ERRCODE = 'P0001';
  END IF;

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

  -- L: lock de liquidacion en orden canonico antes de leer estado.
  PERFORM 1
     FROM liquidacion_envios le
     JOIN liquidaciones_repartidor l ON l.id = le.liquidacion_id
    WHERE le.envio_id = v_pago_previo.envio_id
    FOR UPDATE OF l;

  -- 4.4: ambos estados settled bloquean.
  IF EXISTS (
    SELECT 1
      FROM liquidacion_envios le
      JOIN liquidaciones_repartidor l ON l.id = le.liquidacion_id
     WHERE le.envio_id = v_pago_previo.envio_id
       AND l.estado IN ('cerrada', 'con_diferencia')
  ) THEN
    RAISE EXCEPTION 'pago_en_liquidacion_cerrada: el COD ya fue liquidado al repartidor; reabrir la liquidacion antes de anular el pago'
      USING ERRCODE = 'P0001';
  END IF;

  -- E: lock del envio antes de que el sync trigger mute su cobro.
  PERFORM 1 FROM envios WHERE id = v_pago_previo.envio_id FOR UPDATE;

  UPDATE pagos
     SET anulado          = TRUE,
         anulado_por      = p_anulado_por,
         anulado_en       = NOW(),
         motivo_anulacion = p_motivo,
         updated_at       = NOW()
   WHERE id = p_pago_id
  RETURNING * INTO v_pago_actual;

  -- Cierra el flag apenas pasa el UPDATE legitimo.
  PERFORM set_config('app.pago_rpc', '0', true);

  v_descripcion := format('Pago %s anulado. Motivo: %s', p_pago_id, p_motivo);

  INSERT INTO auditoria_log (
    usuario, usuario_id, accion, entidad, entidad_id,
    descripcion, valor_anterior, valor_nuevo, ip_address, user_agent
  ) VALUES (
    p_usuario_nombre, p_anulado_por, 'anular', 'pago', v_pago_actual.id::TEXT,
    v_descripcion, to_jsonb(v_pago_previo), to_jsonb(v_pago_actual), p_ip, p_user_agent
  );

  RETURN v_pago_actual;
END;
$fn$;

-- -------------------------------------------------------------------------------------------
-- 4.1 -- crear_liquidacion: borrador gateado por cobro real, AMBOS modos, set materializado
-- -------------------------------------------------------------------------------------------
-- Cambios vs 035:
--   (RAIZ A/H1) ELIMINA la condicion e.cod_pago_pendiente=FALSE. El gate es SOLO cobro real
--     (EXISTS pago pagado no anulado) + NOT EXISTS conciliado. El flag es senal forense.
--   (spec 4.1) tipo_pago IN ('anticipado','contra_entrega') -- AMBOS modos entran (035 filtraba
--     solo contra_entrega y dejaba el anticipado cobrado en efectivo sin reconciliar).
--   (RAIZ D/H5) materializa el set elegible UNA vez con FOR UPDATE (CTE via FOR loop sobre un
--     cursor lockeado), inserta desde ese set, y deriva count/monto del INSERT...RETURNING. Una
--     sola lectura lockeada: count, monto e insert salen del MISMO conjunto. Adios carrera de 2
--     snapshots.
-- Orden de lock: E (envios candidatos FOR UPDATE) -> L (INSERT de la liquidacion). Compatible
-- con P -> E -> L: aqui no se tocan pagos fisicamente, solo se leen via EXISTS.
-- Firma intacta. monto_a_cobrar es el importe que el repartidor rinde en AMBOS modos:
--   contra_entrega: producto + tarifa. anticipado: costo + seguro (igual a la tarifa).
CREATE OR REPLACE FUNCTION public.crear_liquidacion(
  p_repartidor_id uuid, p_fecha_desde date, p_fecha_hasta date, p_creado_por uuid,
  p_usuario_nombre text, p_ip inet, p_user_agent text)
 RETURNS liquidaciones_repartidor
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
DECLARE
  v_liquidacion       liquidaciones_repartidor;
  v_monto_esperado    BIGINT := 0;
  v_count             INT    := 0;
  v_descripcion       TEXT;
  v_repartidor_nombre TEXT;
  v_solapada_id       UUID;
  v_envio_id          UUID;
  v_monto_a_cobrar    BIGINT;
  v_monto_cobrado     BIGINT;
BEGIN
  IF p_fecha_hasta < p_fecha_desde THEN
    RAISE EXCEPTION 'rango_invalido: fecha_hasta debe ser >= fecha_desde'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT id INTO v_solapada_id
    FROM liquidaciones_repartidor
   WHERE repartidor_id = p_repartidor_id
     AND fecha_desde <= p_fecha_hasta
     AND fecha_hasta >= p_fecha_desde
   ORDER BY created_at ASC
   LIMIT 1;

  IF v_solapada_id IS NOT NULL THEN
    RAISE EXCEPTION 'liquidacion_rango_solapado: ya existe una liquidacion del repartidor (%) que solapa con el rango', v_solapada_id
      USING ERRCODE = 'P0001';
  END IF;

  SELECT nombre INTO v_repartidor_nombre
    FROM repartidores
   WHERE id = p_repartidor_id AND eliminado = FALSE;

  IF v_repartidor_nombre IS NULL THEN
    RAISE EXCEPTION 'repartidor_no_encontrado: %', p_repartidor_id
      USING ERRCODE = 'P0001';
  END IF;

  -- Inserta el cabecera primero con esperado 0; se actualiza al final con el SUM del set vigente.
  INSERT INTO liquidaciones_repartidor (
    repartidor_id, fecha_desde, fecha_hasta, monto_total_esperado, creado_por
  ) VALUES (
    p_repartidor_id, p_fecha_desde, p_fecha_hasta, 0, p_creado_por
  )
  RETURNING * INTO v_liquidacion;

  -- Set elegible MATERIALIZADO bajo lock pesimista (RAIZ D/H5). El FOR ... FOR UPDATE lockea cada
  -- envio candidato; la insercion del detalle y el computo de count/monto salen del MISMO
  -- conjunto, en la misma lectura. Predicado 4.1: entregado + no eliminado + AMBOS modos + fecha
  -- en rango (TZ Asuncion) + EXISTS pago pagado no anulado + NOT EXISTS conciliado en otra liq.
  -- SIN condicion sobre cod_pago_pendiente.
  FOR v_envio_id, v_monto_a_cobrar, v_monto_cobrado IN
    SELECT e.id, e.monto_a_cobrar, COALESCE(e.monto_cobrado, 0)
      FROM envios e
     WHERE e.repartidor_id = p_repartidor_id
       AND e.estado = 'entregado'
       AND e.tipo_pago IN ('anticipado', 'contra_entrega')
       AND e.eliminado = FALSE
       AND e.fecha_entrega_real IS NOT NULL
       AND (e.fecha_entrega_real AT TIME ZONE 'America/Asuncion')::date
           BETWEEN p_fecha_desde AND p_fecha_hasta
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
       )
     ORDER BY e.id
     FOR UPDATE OF e
  LOOP
    INSERT INTO liquidacion_envios (liquidacion_id, envio_id, monto_esperado, monto_cobrado)
    VALUES (v_liquidacion.id, v_envio_id, v_monto_a_cobrar, v_monto_cobrado);

    v_count          := v_count + 1;
    v_monto_esperado := v_monto_esperado + v_monto_a_cobrar;
  END LOOP;

  UPDATE liquidaciones_repartidor
     SET monto_total_esperado = v_monto_esperado,
         updated_at           = NOW()
   WHERE id = v_liquidacion.id
  RETURNING * INTO v_liquidacion;

  v_descripcion := format(
    'Liquidacion creada para %s (rango %s a %s): %s envios, %s Gs esperados',
    v_repartidor_nombre, p_fecha_desde, p_fecha_hasta, v_count, v_monto_esperado
  );

  INSERT INTO auditoria_log (
    usuario, usuario_id, accion, entidad, entidad_id,
    descripcion, valor_anterior, valor_nuevo, ip_address, user_agent
  ) VALUES (
    p_usuario_nombre, p_creado_por, 'crear', 'liquidacion', v_liquidacion.id::TEXT,
    v_descripcion, NULL, to_jsonb(v_liquidacion), p_ip, p_user_agent
  );

  RETURN v_liquidacion;

EXCEPTION
  WHEN exclusion_violation THEN
    RAISE EXCEPTION 'liquidacion_rango_solapado: ya existe una liquidacion del repartidor cuyo rango solapa con el solicitado'
      USING ERRCODE = 'P0001';
END;
$fn$;

-- -------------------------------------------------------------------------------------------
-- 4.2 -- cerrar_liquidacion: UNICO punto de sello. Re-selecciona, re-snapshotea, re-valida
-- -------------------------------------------------------------------------------------------
-- La 035 hacia blanket UPDATE conciliado=TRUE sin re-seleccionar ni re-snapshotear (RAIZ B, el
-- agujero central). 036 lo convierte en el unico punto que sella:
--   Bajo lock (... -> L): re-selecciona el set con el predicado de 4.1; DELETE las filas que ya
--   no califican; UPSERT las que ahora califican; re-snapshotea monto_cobrado real; recomputa
--   monto_total_esperado = SUM(monto_a_cobrar), tarifa_retenida = SUM(costo+seguro),
--   payout_tienda = SUM(monto_a_cobrar - (costo+seguro)); RECIEN AHI conciliado=TRUE,
--   estado = (esperado == cobrado_real ? 'cerrada' : 'con_diferencia'), cerrada_en=NOW.
-- monto_total_recibido = efectivo fisico contado (p_monto_recibido). El estado se decide por la
-- columna generada diferencia = recibido - esperado: si la caja fisica == esperado del set
-- vigente, cerrada; si no, con_diferencia (exige notas). Firma intacta.
-- Orden de lock: la liquidacion ya viene lockeada (FOR UPDATE), luego se lockean los envios
-- candidatos (E). Compatible con P -> E -> L: el unico camino que toma L antes que E es este, y
-- corre aislado (no toca pagos fisicamente).
CREATE OR REPLACE FUNCTION public.cerrar_liquidacion(
  p_liquidacion_id uuid, p_monto_recibido bigint, p_notas text, p_cerrado_por uuid,
  p_usuario_nombre text, p_ip inet, p_user_agent text)
 RETURNS liquidaciones_repartidor
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
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
  -- DROP IF EXISTS hace la funcion re-llamable dentro de la MISMA transaccion (la suite de
  -- invariantes cierra varias liquidaciones en un solo BEGIN con savepoints).
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

  -- Recompute sobre el set vigente. tarifa_retenida = SUM(costo+seguro);
  -- payout_tienda = SUM(monto_a_cobrar - (costo+seguro)) (0 en anticipado, producto en COD full).
  SELECT COALESCE(SUM(monto_esperado), 0)::BIGINT,
         COALESCE(SUM(tarifa), 0)::BIGINT,
         COALESCE(SUM(monto_esperado - tarifa), 0)::BIGINT
    INTO v_esperado, v_tarifa, v_payout
    FROM tmp_elegibles;

  v_diferencia := p_monto_recibido - v_esperado;

  IF v_diferencia = 0 THEN
    v_estado := 'cerrada';
  ELSE
    v_estado := 'con_diferencia';
    IF p_notas IS NULL OR length(trim(p_notas)) < 10 THEN
      RAISE EXCEPTION 'notas_requeridas: cerrar con diferencia requiere notas de al menos 10 caracteres'
        USING ERRCODE = 'P0001';
    END IF;
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
$fn$;

-- -------------------------------------------------------------------------------------------
-- 4.2 (cols) -- columnas de neteo en liquidaciones_repartidor (idempotente, nullable)
-- -------------------------------------------------------------------------------------------
-- Nullable a proposito: reabrir (4.3) las pone NULL para respetar el contrato "montos finales
-- NULL en pendiente". Se recomputan al cerrar.
ALTER TABLE public.liquidaciones_repartidor
  ADD COLUMN IF NOT EXISTS tarifa_retenida BIGINT,
  ADD COLUMN IF NOT EXISTS payout_tienda   BIGINT;

COMMENT ON COLUMN public.liquidaciones_repartidor.tarifa_retenida IS
  'SUM(costo+costo_seguro) del set vigente, computado al cerrar (4.2). Lo que GO EXPRESS retiene. NULL mientras pendiente.';
COMMENT ON COLUMN public.liquidaciones_repartidor.payout_tienda IS
  'SUM(monto_a_cobrar - (costo+costo_seguro)) del set vigente, computado al cerrar (4.2). 0 en anticipado, valor del producto en contra_entrega. NULL mientras pendiente.';

-- -------------------------------------------------------------------------------------------
-- 4.3 -- reabrir_liquidacion: revierte a pendiente, des-concilia, montos finales NULL
-- -------------------------------------------------------------------------------------------
-- Reconciliacion con 4.2: cerrar RECOMPUTA monto_total_esperado, tarifa_retenida, payout_tienda
-- y re-snapshotea monto_cobrado del set vigente. Por eso reabrir puede dejar todos los montos
-- FINALES en NULL sin perder nada: el proximo cierre los reconstruye desde el set vigente. NULL
-- explicito (no "dejar el viejo") elimina cualquier lectura stale entre reabrir y re-cerrar, y
-- respeta el contrato de spec 4.3 ("montos finales NULL"). monto_total_recibido NULL es
-- obligatorio por el CHECK liquidacion_estado_coherente (pendiente => recibido NULL).
-- Firma intacta.
CREATE OR REPLACE FUNCTION public.reabrir_liquidacion(
  p_liquidacion_id uuid, p_motivo text, p_actor uuid,
  p_usuario_nombre text, p_ip inet, p_user_agent text)
 RETURNS liquidaciones_repartidor
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
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

  -- Des-conciliar: update/anular_pago vuelven a permitir correccion y el envio queda elegible
  -- para re-snapshot al cerrar de nuevo.
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
$fn$;

-- ===========================================================================================
-- PARTE 1 (cont.) -- 1.7 -- Drop final de objetos CC que recien ahora quedan sin caller vivo.
-- anular_pago_atomico ya fue reescrito (4.5) sin la rama CC, asi que registrar_movimiento_cc no
-- tiene caller. trg_movcc_append_only_fn protegia la tabla CC, que se dropea aca.
-- ===========================================================================================

-- Confirmacion de que ningun caller VIVO (que sobrevive a 036) invoca registrar_movimiento_cc
-- antes de dropearla. Excluye la propia funcion y trg_movcc_append_only_fn (que se dropea en
-- este mismo bloque y solo menciona el nombre en su mensaje de RAISE, no la invoca). El match es
-- textual sobre pg_get_functiondef porque plpgsql es late-bound (pg_depend no registra la
-- dependencia de llamada). El PERFORM real en el cuerpo seria 'PERFORM registrar_movimiento_cc('.
DO $no_caller$
DECLARE
  v_callers TEXT;
BEGIN
  SELECT string_agg(p.proname, ', ') INTO v_callers
    FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname NOT IN ('registrar_movimiento_cc', 'trg_movcc_append_only_fn')
     AND pg_get_functiondef(p.oid) ~* 'registrar_movimiento_cc\s*\(';
  IF v_callers IS NOT NULL THEN
    RAISE EXCEPTION 'abort_036: registrar_movimiento_cc todavia tiene callers vivos: %', v_callers;
  END IF;
END
$no_caller$;

DROP FUNCTION IF EXISTS public.registrar_movimiento_cc(uuid, uuid, uuid, tipo_movimiento_cc, bigint, text, uuid, inet, text, boolean);

-- Tabla CC (arrastra su trigger trg_movcc_append_only y sus FKs salientes). Sus FKs apuntan a
-- clientes/envios/pagos/usuarios (salientes): dropear la tabla no bloquea nada.
DROP TABLE IF EXISTS public.movimientos_cuenta_corriente;
DROP FUNCTION IF EXISTS public.trg_movcc_append_only_fn();

-- Columnas CC. envios.bypass_limite_credito (ya no se usa: la rama bypass se evaporo con CC).
-- clientes.saldo_cuenta_corriente / limite_credito (sin saldo mutable en COD-only).
ALTER TABLE public.envios   DROP COLUMN IF EXISTS bypass_limite_credito;
ALTER TABLE public.clientes DROP COLUMN IF EXISTS saldo_cuenta_corriente;
ALTER TABLE public.clientes DROP COLUMN IF EXISTS limite_credito;

-- NOTA: el tipo enum tipo_movimiento_cc queda huerfano (solo lo usaba la tabla CC y la funcion
-- registrar_movimiento_cc, ambos dropeados). NO se dropea: dropearlo no aporta y agrega riesgo
-- si algun cast/columna olvidado lo referencia. Inerte. Igual el valor 'cuenta_corriente' del
-- enum tipo_pago: bloqueado por CHECK, no dropeable de forma segura.

COMMIT;

-- ===========================================================================================
-- VERIFICACION RAPIDA POST-MIGRACION (correr a mano, fuera de la transaccion):
--   SELECT count(*) FROM pg_proc WHERE proname IN
--     ('registrar_movimiento_cc','verificar_saldo_cc','recompute_saldo_cc',
--      'trg_envio_cc_debito_fn','trg_pago_cc_credito_fn','trg_movcc_append_only_fn'); -- 0
--   SELECT to_regclass('public.movimientos_cuenta_corriente');                         -- NULL
--   SELECT conname FROM pg_constraint WHERE conname='envios_tipo_pago_no_cc';           -- existe
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name='liquidaciones_repartidor'
--       AND column_name IN ('tarifa_retenida','payout_tienda');                         -- 2 filas
-- ===========================================================================================

-- ===========================================================================================
-- ROLLBACK (ejecutar manualmente dentro de su propio BEGIN/COMMIT para revertir 036 a 035).
-- ATENCION: este rollback restaura la ESTRUCTURA, no los datos CC (que prod no tenia). Solo
-- tiene sentido si 036 se aplico sobre el estado 035 verificado.
-- ===========================================================================================
-- BEGIN;
--   -- 1. Re-crear las funciones/triggers/tabla/columnas CC desde 018_cuenta_corriente.sql,
--   --    019_envio_bypass_limite_credito.sql y 035_money_core_remediation_round2.sql:
--   --      registrar_movimiento_cc, verificar_saldo_cc, recompute_saldo_cc,
--   --      trg_envio_cc_debito_fn (+ trg_envio_cuenta_corriente_debito),
--   --      trg_pago_cc_credito_fn (+ trg_pago_cuenta_corriente_credito),
--   --      trg_movcc_append_only_fn (+ trg_movcc_append_only), tabla movimientos_cuenta_corriente,
--   --      columnas clientes.saldo_cuenta_corriente/limite_credito, envios.bypass_limite_credito.
--   -- 2. Restaurar create/update/anular_pago_atomico, crear/cerrar/reabrir_liquidacion y
--   --    trg_pago_sync_envio_cobrado_fn a su cuerpo 035 (copiar de 035_money_core_remediation_round2.sql
--   --    y, para cerrar_liquidacion, del baseline 000_baseline_prod_schema.sql).
--   -- 3. Quitar lo que 036 agrego:
--   DROP TRIGGER IF EXISTS trg_pagos_no_update_fisico ON public.pagos;
--   DROP FUNCTION IF EXISTS public.trg_pagos_no_update_fisico_fn();
--   ALTER TABLE public.envios DROP CONSTRAINT IF EXISTS envios_tipo_pago_no_cc;
--   ALTER TABLE public.liquidaciones_repartidor
--     DROP COLUMN IF EXISTS tarifa_retenida,
--     DROP COLUMN IF EXISTS payout_tienda;
-- COMMIT;

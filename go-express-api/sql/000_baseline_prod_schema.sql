-- GO EXPRESS baseline del schema VIVO de prod. Regenerado 2026-08-12 tras 053.
-- 053: api_keys del API Gateway v1 (hash-only, RLS deny, permisos por key) + columna e
-- indice parcial de idempotencia api_idempotency_key en envios. Source of truth.
--

\restrict rd4efFyKNHsniRUYc3PCBaHaOPvdypGL2JazaPnCiWibFr0gk5qelmVeiAE74cm

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.9 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: auditoria_accion; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.auditoria_accion AS ENUM (
    'crear',
    'editar',
    'eliminar',
    'exportar',
    'cambio_estado',
    'pago',
    'nota',
    'asignar',
    'importar',
    'login',
    'ajuste',
    'nota_credito',
    'anular',
    'reabrir'
);


--
-- Name: auditoria_entidad; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.auditoria_entidad AS ENUM (
    'envio',
    'cliente',
    'repartidor',
    'pago',
    'nota_interna',
    'tarifa',
    'usuario',
    'almacen',
    'sistema',
    'cuenta_corriente',
    'liquidacion',
    'api_key'
);


--
-- Name: cliente_estado; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.cliente_estado AS ENUM (
    'activo',
    'inactivo',
    'suspendido'
);


--
-- Name: cliente_plan; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.cliente_plan AS ENUM (
    'basico',
    'profesional',
    'enterprise'
);


--
-- Name: envio_estado; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.envio_estado AS ENUM (
    'pendiente',
    'recolectado',
    'en_transito',
    'en_reparto',
    'entregado',
    'fallido',
    'problema',
    'en_deposito'
);


--
-- Name: estado_almacen; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.estado_almacen AS ENUM (
    'recibido',
    'en_almacen',
    'listo_despacho',
    'despachado',
    'devuelto'
);


--
-- Name: estado_liquidacion; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.estado_liquidacion AS ENUM (
    'pendiente',
    'cerrada',
    'con_diferencia'
);


--
-- Name: estado_pago; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.estado_pago AS ENUM (
    'pendiente',
    'pagado',
    'pago_parcial'
);


--
-- Name: intento_contacto_tipo; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.intento_contacto_tipo AS ENUM (
    'llamada',
    'whatsapp',
    'visita_fallida'
);


--
-- Name: metodo_pago; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.metodo_pago AS ENUM (
    'efectivo',
    'transferencia',
    'tarjeta',
    'contra_entrega'
);


--
-- Name: movimiento_tipo; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.movimiento_tipo AS ENUM (
    'entrada',
    'salida',
    'movimiento_interno',
    'devolucion'
);


--
-- Name: notif_canal; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.notif_canal AS ENUM (
    'email',
    'whatsapp'
);


--
-- Name: notif_evento; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.notif_evento AS ENUM (
    'envio_creado',
    'recolectado',
    'en_transito',
    'en_deposito',
    'en_reparto',
    'entregado',
    'fallido',
    'problema'
);


--
-- Name: notif_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.notif_status AS ENUM (
    'enviado',
    'fallido',
    'descartado'
);


--
-- Name: portal_status_tipo; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.portal_status_tipo AS ENUM (
    'sin_invitar',
    'invitado',
    'activo',
    'desactivado'
);


--
-- Name: prioridad_tipo; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.prioridad_tipo AS ENUM (
    'normal',
    'alta',
    'urgente'
);


--
-- Name: repartidor_estado; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.repartidor_estado AS ENUM (
    'activo',
    'inactivo'
);


--
-- Name: tipo_ajuste_liquidacion; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.tipo_ajuste_liquidacion AS ENUM (
    'cobranza_repartidor',
    'sobrante_a_investigar'
);


--
-- Name: tipo_pago; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.tipo_pago AS ENUM (
    'anticipado',
    'contra_entrega',
    'cuenta_corriente'
);


--
-- Name: tipo_servicio; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.tipo_servicio AS ENUM (
    'estandar',
    'express',
    'economico'
);


--
-- Name: user_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.user_role AS ENUM (
    'admin',
    'operador'
);


--
-- Name: user_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.user_status AS ENUM (
    'activo',
    'inactivo'
);


--
-- Name: vehiculo_tipo; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.vehiculo_tipo AS ENUM (
    'Moto',
    'Auto',
    'Camioneta'
);


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: pagos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pagos (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    envio_id uuid NOT NULL,
    monto_total bigint NOT NULL,
    monto_recibido bigint DEFAULT 0 NOT NULL,
    metodo_pago public.metodo_pago NOT NULL,
    estado_pago public.estado_pago DEFAULT 'pendiente'::public.estado_pago NOT NULL,
    fecha_pago date,
    referencia text,
    notas text,
    creado_por uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    anulado boolean DEFAULT false NOT NULL,
    anulado_por uuid,
    anulado_en timestamp with time zone,
    motivo_anulacion text,
    CONSTRAINT pagos_anulacion_coherente CHECK ((((anulado = false) AND (anulado_por IS NULL) AND (anulado_en IS NULL) AND (motivo_anulacion IS NULL)) OR ((anulado = true) AND (anulado_por IS NOT NULL) AND (anulado_en IS NOT NULL) AND (motivo_anulacion IS NOT NULL) AND (length(motivo_anulacion) >= 10)))),
    CONSTRAINT pagos_monto_recibido_check CHECK ((monto_recibido >= 0)),
    CONSTRAINT pagos_monto_total_check CHECK ((monto_total > 0)),
    CONSTRAINT pagos_pagado_coherente CHECK (((estado_pago <> 'pagado'::public.estado_pago) OR (monto_recibido >= monto_total)))
);


--
-- Name: COLUMN pagos.anulado; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pagos.anulado IS 'TRUE si el pago fue anulado. El pago original queda inmutable; la anulacion se refleja con anulado_por, anulado_en y motivo_anulacion. Los GETs por default filtran anulado = FALSE.';


--
-- Name: COLUMN pagos.motivo_anulacion; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pagos.motivo_anulacion IS 'Justificacion de la anulacion (>= 10 caracteres). Requerida si anulado = TRUE por CHECK constraint pagos_anulacion_coherente.';


--
-- Name: anular_pago_atomico(uuid, text, uuid, text, inet, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.anular_pago_atomico(p_pago_id uuid, p_motivo text, p_anulado_por uuid, p_usuario_nombre text, p_ip inet, p_user_agent text) RETURNS public.pagos
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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

  PERFORM 1 FROM envios WHERE id = v_pago_previo.envio_id FOR UPDATE;  -- E: lock del envio (recurso comun) ANTES del guard; serializa contra crear/cerrar_liquidacion aunque el detalle aun no exista (cierra TOCTOU C1/C2)
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
$$;


--
-- Name: FUNCTION anular_pago_atomico(p_pago_id uuid, p_motivo text, p_anulado_por uuid, p_usuario_nombre text, p_ip inet, p_user_agent text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.anular_pago_atomico(p_pago_id uuid, p_motivo text, p_anulado_por uuid, p_usuario_nombre text, p_ip inet, p_user_agent text) IS 'Anula pago + auditoria + reverso de saldo CC, todo en una transaccion. El reverso re-incrementa la deuda exactamente por el credito neto que este pago asento en el ledger (no por monto_recibido actual). Llama registrar_movimiento_cc con su firma canonica de 9 args. Errores: pago_no_encontrado, pago_ya_anulado, motivo_insuficiente.';


--
-- Name: liquidaciones_repartidor; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.liquidaciones_repartidor (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    repartidor_id uuid NOT NULL,
    fecha_desde date NOT NULL,
    fecha_hasta date NOT NULL,
    monto_total_esperado bigint DEFAULT 0 NOT NULL,
    monto_total_recibido bigint,
    diferencia bigint GENERATED ALWAYS AS ((COALESCE(monto_total_recibido, (0)::bigint) - monto_total_esperado)) STORED,
    estado public.estado_liquidacion DEFAULT 'pendiente'::public.estado_liquidacion NOT NULL,
    cerrada_por uuid,
    cerrada_en timestamp with time zone,
    notas text,
    creado_por uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    tarifa_retenida bigint,
    payout_tienda bigint,
    CONSTRAINT liquidacion_estado_coherente CHECK ((((estado = 'pendiente'::public.estado_liquidacion) AND (cerrada_por IS NULL) AND (cerrada_en IS NULL) AND (monto_total_recibido IS NULL)) OR ((estado = ANY (ARRAY['cerrada'::public.estado_liquidacion, 'con_diferencia'::public.estado_liquidacion])) AND (cerrada_por IS NOT NULL) AND (cerrada_en IS NOT NULL) AND (monto_total_recibido IS NOT NULL)))),
    CONSTRAINT liquidacion_payout_conservacion CHECK (((estado = 'pendiente'::public.estado_liquidacion) OR ((tarifa_retenida IS NOT NULL) AND (payout_tienda IS NOT NULL) AND ((tarifa_retenida + payout_tienda) = monto_total_esperado)))),
    CONSTRAINT liquidacion_rango_valido CHECK ((fecha_hasta >= fecha_desde))
);


--
-- Name: TABLE liquidaciones_repartidor; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.liquidaciones_repartidor IS 'Cierre de caja fisico por repartidor y rango de fechas. Cada fila representa la reconciliacion entre el COD esperado (suma de monto_a_cobrar de envios entregados) y el COD efectivamente entregado por el repartidor en oficina. Cuando estado = cerrada la liquidacion es inmutable.';


--
-- Name: COLUMN liquidaciones_repartidor.monto_total_esperado; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.liquidaciones_repartidor.monto_total_esperado IS 'Suma de monto_a_cobrar de los envios COD entregados por el repartidor en el rango. Se calcula al crear y no se recalcula.';


--
-- Name: COLUMN liquidaciones_repartidor.monto_total_recibido; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.liquidaciones_repartidor.monto_total_recibido IS 'Efectivo fisico que el admin pesa y recibe del repartidor al cerrar. NULL mientras la liquidacion esta pendiente.';


--
-- Name: COLUMN liquidaciones_repartidor.diferencia; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.liquidaciones_repartidor.diferencia IS 'Columna generada: monto_total_recibido - monto_total_esperado. Positivo significa el repartidor entrego mas de lo esperado (anomalia). Negativo, entrego menos (faltante).';


--
-- Name: COLUMN liquidaciones_repartidor.notas; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.liquidaciones_repartidor.notas IS 'Justificacion obligatoria si cierra con diferencia. Libre si cierra sin diferencia.';


--
-- Name: COLUMN liquidaciones_repartidor.tarifa_retenida; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.liquidaciones_repartidor.tarifa_retenida IS 'SUM(costo+costo_seguro) del set vigente, computado al cerrar (4.2). Lo que GO EXPRESS retiene. NULL mientras pendiente.';


--
-- Name: COLUMN liquidaciones_repartidor.payout_tienda; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.liquidaciones_repartidor.payout_tienda IS 'SUM(monto_a_cobrar - (costo+costo_seguro)) del set vigente, computado al cerrar (4.2). 0 en anticipado, valor del producto en contra_entrega. NULL mientras pendiente.';


--
-- Name: cerrar_liquidacion(uuid, bigint, text, uuid, text, inet, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cerrar_liquidacion(p_liquidacion_id uuid, p_monto_recibido bigint, p_notas text, p_cerrado_por uuid, p_usuario_nombre text, p_ip inet, p_user_agent text) RETURNS public.liquidaciones_repartidor
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_snap           liquidaciones_repartidor;
  v_previa         liquidaciones_repartidor;
  v_actual         liquidaciones_repartidor;
  v_estado         estado_liquidacion;
  v_esperado       BIGINT := 0;
  v_tarifa         BIGINT := 0;
  v_payout         BIGINT := 0;
  v_diferencia     BIGINT;
  v_cobranza       BIGINT := 0;
  v_sobrante       BIGINT := 0;
  v_descripcion    TEXT;
BEGIN
  IF p_monto_recibido < 0 THEN
    RAISE EXCEPTION 'monto_invalido: monto_recibido debe ser >= 0'
      USING ERRCODE = 'P0001';
  END IF;

  -- Snapshot del header SIN lock: solo para armar el predicado del set elegible. El lock del
  -- header va DESPUES de los envios (orden canonico E -> L, alineado con las RPCs de pago, 048).
  SELECT * INTO v_snap
    FROM liquidaciones_repartidor
   WHERE id = p_liquidacion_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'liquidacion_no_encontrada: %', p_liquidacion_id
      USING ERRCODE = 'P0001';
  END IF;

  IF v_snap.estado <> 'pendiente' THEN
    RAISE EXCEPTION 'liquidacion_ya_cerrada: %', p_liquidacion_id
      USING ERRCODE = 'P0001';
  END IF;

  -- E: lockear el set elegible vigente (mismo predicado que crear_liquidacion).
  DROP TABLE IF EXISTS tmp_elegibles;
  CREATE TEMP TABLE tmp_elegibles ON COMMIT DROP AS
  SELECT e.id AS envio_id,
         e.monto_a_cobrar AS monto_esperado,
         COALESCE(e.monto_cobrado, 0) AS monto_cobrado,
         (e.costo + COALESCE(e.costo_seguro, 0))::BIGINT AS tarifa
    FROM envios e
   WHERE e.repartidor_id = v_snap.repartidor_id
     AND e.estado = 'entregado'
     AND e.tipo_pago IN ('anticipado', 'contra_entrega')
     AND e.eliminado = FALSE
     AND e.fecha_entrega_real IS NOT NULL
     AND (e.fecha_entrega_real AT TIME ZONE 'America/Asuncion')::date
         BETWEEN v_snap.fecha_desde AND v_snap.fecha_hasta
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

  -- L: lock del header DESPUES de los envios; re-validar contra el snapshot (048). Si el header
  -- cambio entre snapshot y lock, abortar con 40001 para que el retry del caller re-ejecute.
  SELECT * INTO v_previa
    FROM liquidaciones_repartidor
   WHERE id = p_liquidacion_id
   FOR UPDATE;

  IF v_previa.estado <> 'pendiente' THEN
    RAISE EXCEPTION 'liquidacion_ya_cerrada: %', p_liquidacion_id
      USING ERRCODE = 'P0001';
  END IF;

  IF v_previa.repartidor_id IS DISTINCT FROM v_snap.repartidor_id
     OR v_previa.fecha_desde IS DISTINCT FROM v_snap.fecha_desde
     OR v_previa.fecha_hasta IS DISTINCT FROM v_snap.fecha_hasta THEN
    RAISE EXCEPTION 'liquidacion_snapshot_stale: el header % cambio durante el cierre, reintentar', p_liquidacion_id
      USING ERRCODE = '40001';
  END IF;

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

  -- 041: la tienda cobra su payout completo en ambas ramas; el faltante es del repartidor.
  v_payout := v_esperado - v_tarifa;

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

  -- M2: asiento contable de la diferencia. Faltante = deuda del repartidor (cuenta por cobrar);
  -- sobrante = efectivo sin duenio, a investigar. Exactamente un asiento activo por cierre.
  IF v_diferencia < 0 THEN
    v_cobranza := -v_diferencia;
    INSERT INTO liquidacion_ajustes (liquidacion_id, tipo, monto, motivo, creado_por)
    VALUES (
      p_liquidacion_id, 'cobranza_repartidor', v_cobranza,
      format('Faltante de caja al cerrar: esperado %s Gs, recibido %s Gs. Deuda del repartidor. Notas del cierre: %s',
             v_esperado, p_monto_recibido, p_notas),
      p_cerrado_por
    );
  ELSIF v_diferencia > 0 THEN
    v_sobrante := v_diferencia;
    INSERT INTO liquidacion_ajustes (liquidacion_id, tipo, monto, motivo, creado_por)
    VALUES (
      p_liquidacion_id, 'sobrante_a_investigar', v_sobrante,
      format('Sobrante de caja al cerrar: esperado %s Gs, recibido %s Gs. Investigar origen antes de asignar. Notas del cierre: %s',
             v_esperado, p_monto_recibido, p_notas),
      p_cerrado_por
    );
  END IF;

  -- Conservacion total (M2): tarifa + payout + sobrante = recibido + cobranza, SIEMPRE. Si el
  -- asiento no cierra la ecuacion el cierre entero aborta: mejor un 500 que un ledger que no
  -- cuadra al guarani.
  IF v_tarifa + v_payout + v_sobrante <> p_monto_recibido + v_cobranza THEN
    RAISE EXCEPTION 'conservacion_rota: tarifa % + payout % + sobrante % <> recibido % + cobranza %',
      v_tarifa, v_payout, v_sobrante, p_monto_recibido, v_cobranza
      USING ERRCODE = 'P0001';
  END IF;

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
$$;


--
-- Name: FUNCTION cerrar_liquidacion(p_liquidacion_id uuid, p_monto_recibido bigint, p_notas text, p_cerrado_por uuid, p_usuario_nombre text, p_ip inet, p_user_agent text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.cerrar_liquidacion(p_liquidacion_id uuid, p_monto_recibido bigint, p_notas text, p_cerrado_por uuid, p_usuario_nombre text, p_ip inet, p_user_agent text) IS 'Cierra la liquidacion sobre el set elegible vigente, orden de lock E -> L (048). Politica de diferencia (M2, decision Gaston): la tienda cobra su payout completo (payout_tienda = esperado - tarifa, SIN clamp contra el efectivo); el faltante (esperado - recibido) se asienta en liquidacion_ajustes como cobranza_repartidor (deuda del repartidor) y el sobrante como sobrante_a_investigar. Conservacion total: tarifa_retenida + payout_tienda + sobrante = monto_total_recibido + cobranza_repartidor, verificada con assert interno en cada cierre. CHECK complementario 041: tarifa_retenida + payout_tienda = monto_total_esperado.';


--
-- Name: crear_liquidacion(uuid, date, date, uuid, text, inet, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.crear_liquidacion(p_repartidor_id uuid, p_fecha_desde date, p_fecha_hasta date, p_creado_por uuid, p_usuario_nombre text, p_ip inet, p_user_agent text) RETURNS public.liquidaciones_repartidor
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: FUNCTION crear_liquidacion(p_repartidor_id uuid, p_fecha_desde date, p_fecha_hasta date, p_creado_por uuid, p_usuario_nombre text, p_ip inet, p_user_agent text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.crear_liquidacion(p_repartidor_id uuid, p_fecha_desde date, p_fecha_hasta date, p_creado_por uuid, p_usuario_nombre text, p_ip inet, p_user_agent text) IS 'Crea una liquidacion pendiente snapshoteando los envios COD entregados por el repartidor en el rango (zona horaria PY). Rechaza si el rango solapa con otra liquidacion existente del mismo repartidor. Excluye envios ya conciliados. Audita en la misma transaccion. Errores: rango_invalido, liquidacion_rango_solapado, repartidor_no_encontrado.';


--
-- Name: create_pago_atomico(uuid, bigint, bigint, public.metodo_pago, date, text, text, uuid, text, text, inet, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_pago_atomico(p_envio_id uuid, p_monto_total bigint, p_monto_recibido bigint, p_metodo_pago public.metodo_pago, p_fecha_pago date, p_referencia text, p_notas text, p_creado_por uuid, p_usuario_nombre text, p_tracking_number text, p_ip inet, p_user_agent text) RETURNS public.pagos
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: FUNCTION create_pago_atomico(p_envio_id uuid, p_monto_total bigint, p_monto_recibido bigint, p_metodo_pago public.metodo_pago, p_fecha_pago date, p_referencia text, p_notas text, p_creado_por uuid, p_usuario_nombre text, p_tracking_number text, p_ip inet, p_user_agent text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.create_pago_atomico(p_envio_id uuid, p_monto_total bigint, p_monto_recibido bigint, p_metodo_pago public.metodo_pago, p_fecha_pago date, p_referencia text, p_notas text, p_creado_por uuid, p_usuario_nombre text, p_tracking_number text, p_ip inet, p_user_agent text) IS 'Inserta pago + auditoria en la misma transaccion. monto_total se DERIVA del envio real (costo+seguro para CC, monto_a_cobrar para COD), no se confia del caller; si el caller manda un monto_total distinto, rechaza con pago_monto_total_invalido.';


--
-- Name: generate_tracking_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_tracking_number() RETURNS text
    LANGUAGE plpgsql
    AS $$
DECLARE
  prefix TEXT;
  year_val TEXT;
  seq_val BIGINT;
BEGIN
  SELECT value::text INTO prefix FROM configuracion WHERE key = 'tracking_prefix';
  SELECT value::text INTO year_val FROM configuracion WHERE key = 'tracking_year';
  prefix := REPLACE(prefix, '"', '');
  year_val := REPLACE(year_val, '"', '');
  seq_val := nextval('tracking_seq');
  RETURN prefix || year_val || LPAD(seq_val::text, 6, '0');
END;
$$;


--
-- Name: reabrir_liquidacion(uuid, text, uuid, text, inet, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reabrir_liquidacion(p_liquidacion_id uuid, p_motivo text, p_actor uuid, p_usuario_nombre text, p_ip inet, p_user_agent text) RETURNS public.liquidaciones_repartidor
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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

  -- Habilita la unica via legitima de nular el sello (040). El flag es transaccion-local.
  PERFORM set_config('app.reabrir_rpc', '1', true);

  -- Vuelta a pendiente. Los campos de cierre + montos finales VUELVEN a NULL: el re-cierre los
  -- reconstruye desde el set vigente. monto_total_esperado queda como estaba: cerrar lo
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
  -- para re-snapshot al cerrar de nuevo.
  UPDATE liquidacion_envios
     SET conciliado = FALSE
   WHERE liquidacion_id = p_liquidacion_id;

  -- M2: los asientos del cierre que se des-sella quedan anulados (soft-delete, jamas DELETE):
  -- documentaban ESE cierre. Si el re-cierre vuelve a dar diferencia, genera asientos nuevos.
  UPDATE liquidacion_ajustes
     SET eliminado          = TRUE,
         eliminado_por      = p_actor,
         eliminado_en       = NOW(),
         motivo_eliminacion = format('Liquidacion reabierta: el asiento pertenece al cierre anterior. Motivo de reapertura: %s', p_motivo)
   WHERE liquidacion_id = p_liquidacion_id
     AND eliminado = FALSE;

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
$$;


--
-- Name: FUNCTION reabrir_liquidacion(p_liquidacion_id uuid, p_motivo text, p_actor uuid, p_usuario_nombre text, p_ip inet, p_user_agent text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.reabrir_liquidacion(p_liquidacion_id uuid, p_motivo text, p_actor uuid, p_usuario_nombre text, p_ip inet, p_user_agent text) IS 'Reabre una liquidacion cerrada o con_diferencia: la vuelve a pendiente (nulando cerrada_por/cerrada_en/monto_total_recibido para respetar liquidacion_estado_coherente), des-concilia sus envios y audita. Habilita el flujo reabrir->corregir->cerrar que los mensajes de pago_en_liquidacion_cerrada instruyen. Errores: motivo_insuficiente, liquidacion_no_encontrada, liquidacion_no_cerrada.';


--
-- Name: release_system_lock(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.release_system_lock(p_name text, p_owner text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_count INTEGER;
BEGIN
  DELETE FROM public.system_locks
  WHERE name = p_name AND owner = p_owner;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count > 0;
END;
$$;


--
-- Name: FUNCTION release_system_lock(p_name text, p_owner text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.release_system_lock(p_name text, p_owner text) IS 'Libera un lock distribuido. Solo el owner puede liberar (idempotente: retorna false si ya estaba liberado o expiro).';


--
-- Name: rls_auto_enable(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rls_auto_enable() RETURNS event_trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


--
-- Name: tarifa_norm_ciudad(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tarifa_norm_ciudad(p_in text) RETURNS text
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    AS $$
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
$$;


--
-- Name: trg_ciudades_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_ciudades_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: trg_envio_block_cod_monto_change_fn(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_envio_block_cod_monto_change_fn() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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
$$;


--
-- Name: trg_envio_block_tipo_pago_change_fn(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_envio_block_tipo_pago_change_fn() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.tipo_pago IS DISTINCT FROM OLD.tipo_pago THEN
    IF EXISTS (
      SELECT 1 FROM pagos
       WHERE envio_id = NEW.id
         AND anulado = FALSE
    ) THEN
      RAISE EXCEPTION 'tipo_pago_no_modificable: el envio tiene un pago activo, no se puede cambiar el tipo de pago'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: FUNCTION trg_envio_block_tipo_pago_change_fn(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.trg_envio_block_tipo_pago_change_fn() IS 'Rechaza cambiar tipo_pago de un envio que ya tiene un pago activo (no anulado). Error: tipo_pago_no_modificable.';


--
-- Name: trg_envio_i1_cubre_tarifa_fn(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_envio_i1_cubre_tarifa_fn() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_tarifa bigint := NEW.costo + COALESCE(NEW.costo_seguro, 0);
BEGIN
  IF NEW.tipo_pago = 'anticipado' THEN
    -- anticipado: el cobro en calle es exactamente la tarifa. payout_tienda = monto - tarifa = 0.
    IF NEW.monto_a_cobrar <> v_tarifa THEN
      RAISE EXCEPTION 'anticipado_monto_invalido: anticipado requiere monto_a_cobrar (%) = costo+seguro (%)',
        NEW.monto_a_cobrar, v_tarifa USING ERRCODE = 'P0001';
    END IF;
  ELSE
    -- contra_entrega: el COD debe cubrir al menos la tarifa; el excedente es el producto de la tienda.
    IF NEW.monto_a_cobrar < v_tarifa THEN
      RAISE EXCEPTION 'monto_a_cobrar_insuficiente: monto_a_cobrar (%) debe cubrir costo+seguro (%)',
        NEW.monto_a_cobrar, v_tarifa USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: trg_ledger_no_truncate_fn(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_ledger_no_truncate_fn() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  RAISE EXCEPTION 'truncate_prohibido: % es parte del ledger financiero, TRUNCATE no esta permitido (M4 Step6)', TG_TABLE_NAME
    USING ERRCODE = 'P0001';
END;
$$;


--
-- Name: FUNCTION trg_ledger_no_truncate_fn(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.trg_ledger_no_truncate_fn() IS 'M4 Step6: TRUNCATE no dispara los triggers FOR EACH ROW del sello de inmutabilidad. Este guard STATEMENT-level lo rechaza incondicionalmente en las tablas del ledger (liquidaciones, detalle, pagos, envios).';


--
-- Name: trg_liquidacion_envios_inmutable_fn(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_liquidacion_envios_inmutable_fn() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_old_cerrada timestamptz;
  v_new_cerrada timestamptz;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT cerrada_en INTO v_new_cerrada FROM public.liquidaciones_repartidor WHERE id = NEW.liquidacion_id;
    IF v_new_cerrada IS NOT NULL THEN
      RAISE EXCEPTION 'liquidacion_envios_inmutable: no se inserta detalle en liquidacion sellada %', NEW.liquidacion_id USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    SELECT cerrada_en INTO v_old_cerrada FROM public.liquidaciones_repartidor WHERE id = OLD.liquidacion_id;
    IF v_old_cerrada IS NOT NULL THEN
      RAISE EXCEPTION 'liquidacion_envios_inmutable: no se elimina detalle de liquidacion sellada %', OLD.liquidacion_id USING ERRCODE = 'P0001';
    END IF;
    RETURN OLD;
  END IF;
  -- UPDATE: ningun flujo legitimo cambia el padre del detalle. Bloquear re-parenting de raiz.
  IF NEW.liquidacion_id <> OLD.liquidacion_id THEN
    RAISE EXCEPTION 'liquidacion_envios_inmutable: re-parenting prohibido, el detalle del envio % no se mueve de la liquidacion % a %',
      OLD.envio_id, OLD.liquidacion_id, NEW.liquidacion_id USING ERRCODE = 'P0001';
  END IF;
  SELECT cerrada_en INTO v_old_cerrada FROM public.liquidaciones_repartidor WHERE id = OLD.liquidacion_id;
  -- Padre pendiente: superficie de escritura legitima (crear/cerrar arman el set bajo header pendiente).
  IF v_old_cerrada IS NULL THEN
    RETURN NEW;
  END IF;
  -- Padre sellado: unica mutacion permitida, el flip de sellado de cerrar (conciliado FALSE->TRUE) sin tocar montos/envio.
  IF OLD.conciliado = FALSE AND NEW.conciliado = TRUE
     AND NEW.monto_esperado IS NOT DISTINCT FROM OLD.monto_esperado
     AND NEW.monto_cobrado  IS NOT DISTINCT FROM OLD.monto_cobrado
     AND NEW.envio_id       =  OLD.envio_id
  THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'liquidacion_envios_inmutable: el detalle del envio % pertenece a la liquidacion sellada %; reabrir para corregir',
    OLD.envio_id, OLD.liquidacion_id USING ERRCODE = 'P0001';
END;
$$;


--
-- Name: trg_liquidacion_inmutable_fn(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_liquidacion_inmutable_fn() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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
  IF OLD.cerrada_en IS NOT NULL AND NEW.cerrada_en IS NULL THEN
    IF current_setting('app.reabrir_rpc', true) IS DISTINCT FROM '1' THEN
      RAISE EXCEPTION 'liquidacion_reapertura_invalida: una liquidacion cerrada solo se reabre via reabrir_liquidacion (deja auditoria y des-concilia el detalle)'
        USING ERRCODE = 'P0001';
    END IF;

    -- M1: todo unseal permitido deja traza propia del trigger, ademas de la fila que
    -- reabrir_liquidacion escribe con el actor real. Si alguien con la GUC seteada des-sella
    -- por fuera de la RPC, esta fila es la unica evidencia forense.
    INSERT INTO public.auditoria_log (
      usuario, usuario_id, accion, entidad, entidad_id,
      descripcion, valor_anterior, valor_nuevo, ip_address, user_agent
    ) VALUES (
      'trigger:liquidacion_unseal',
      '00000000-0000-4000-a000-000000000001',
      'reabrir', 'liquidacion', OLD.id::TEXT,
      format('Unseal de liquidacion %s permitido por trigger (app.reabrir_rpc activo, estado %s -> %s)',
             OLD.id, OLD.estado, NEW.estado),
      to_jsonb(OLD), to_jsonb(NEW), NULL, NULL
    );
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: FUNCTION trg_liquidacion_inmutable_fn(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.trg_liquidacion_inmutable_fn() IS 'Sello de inmutabilidad del header de liquidacion (040 + 047). Cerrada: solo reabrir_liquidacion la des-sella (GUC transaccion-local app.reabrir_rpc). 047: el unseal ademas queda registrado en auditoria_log por el propio trigger, y el rol de la app no tiene UPDATE sobre la tabla (REVOKE), asi que el forje de la GUC desde un request es imposible por permisos.';


--
-- Name: trg_pago_requiere_repartidor_fn(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_pago_requiere_repartidor_fn() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE v_rep uuid;
BEGIN
  SELECT repartidor_id INTO v_rep FROM public.envios WHERE id = NEW.envio_id;
  IF v_rep IS NULL THEN
    RAISE EXCEPTION 'pago_sin_repartidor: el envio % no tiene repartidor asignado; un cobro requiere repartidor para ser liquidable (A4)', NEW.envio_id
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: trg_pago_sync_envio_cobrado_fn(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_pago_sync_envio_cobrado_fn() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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
$$;


--
-- Name: FUNCTION trg_pago_sync_envio_cobrado_fn(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.trg_pago_sync_envio_cobrado_fn() IS 'Sincroniza envios.monto_cobrado desde pagos.monto_recibido para envios contra_entrega. Cache unidireccional: pagos es la fuente de verdad, envios.monto_cobrado es derivado. Anular un pago resetea el cache a 0.';


--
-- Name: trg_pagos_no_delete_fn(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_pagos_no_delete_fn() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  RAISE EXCEPTION 'pago_no_eliminable: un pago no se borra, se anula via anular_pago_atomico'
    USING ERRCODE = 'P0001';
END;
$$;


--
-- Name: trg_pagos_no_update_fisico_fn(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_pagos_no_update_fisico_fn() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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
$$;


--
-- Name: try_acquire_system_lock(text, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.try_acquire_system_lock(p_name text, p_owner text, p_ttl_seconds integer) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_now     TIMESTAMPTZ := NOW();
  v_expires TIMESTAMPTZ := NOW() + make_interval(secs => p_ttl_seconds);
  v_holder  TEXT;
BEGIN
  IF p_name IS NULL OR length(p_name) = 0 THEN
    RAISE EXCEPTION 'lock name required';
  END IF;
  IF p_owner IS NULL OR length(p_owner) = 0 THEN
    RAISE EXCEPTION 'owner required';
  END IF;
  IF p_ttl_seconds IS NULL OR p_ttl_seconds <= 0 OR p_ttl_seconds > 86400 THEN
    RAISE EXCEPTION 'ttl_seconds must be between 1 and 86400';
  END IF;

  INSERT INTO public.system_locks (name, owner, acquired_at, expires_at)
  VALUES (p_name, p_owner, v_now, v_expires)
  ON CONFLICT (name) DO UPDATE
    SET owner       = EXCLUDED.owner,
        acquired_at = EXCLUDED.acquired_at,
        expires_at  = EXCLUDED.expires_at
    WHERE public.system_locks.expires_at < v_now;

  SELECT owner INTO v_holder FROM public.system_locks WHERE name = p_name;
  RETURN v_holder = p_owner;
END;
$$;


--
-- Name: FUNCTION try_acquire_system_lock(p_name text, p_owner text, p_ttl_seconds integer); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.try_acquire_system_lock(p_name text, p_owner text, p_ttl_seconds integer) IS 'Toma un lock distribuido por nombre con TTL en segundos. Retorna true si lo tomo, false si otro holder lo tiene vigente.';


--
-- Name: update_cliente_envio_counts(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_cliente_envio_counts() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE clientes SET
    total_envios   = (SELECT COUNT(*) FROM envios WHERE cliente_id = COALESCE(NEW.cliente_id, OLD.cliente_id)),
    envios_activos = (SELECT COUNT(*) FROM envios WHERE cliente_id = COALESCE(NEW.cliente_id, OLD.cliente_id) AND estado IN ('pendiente', 'recolectado', 'en_transito', 'en_deposito', 'en_reparto'))
  WHERE id = COALESCE(NEW.cliente_id, OLD.cliente_id);

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;


--
-- Name: envios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.envios (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    tracking_number character varying(20) NOT NULL,
    cliente_id uuid NOT NULL,
    cliente_nombre character varying(300) NOT NULL,
    codigo_referencia character varying(100),
    origen character varying(100) NOT NULL,
    destino character varying(100) NOT NULL,
    destinatario_nombre text NOT NULL,
    destinatario_direccion text NOT NULL,
    destinatario_telefono text NOT NULL,
    destinatario_telefono2 text,
    destinatario_cedula text,
    destinatario_ciudad character varying(100) NOT NULL,
    destinatario_departamento character varying(100) DEFAULT ''::character varying NOT NULL,
    destinatario_barrio character varying(100),
    destinatario_referencia text,
    destinatario_ubicacion_url text,
    cantidad integer DEFAULT 1 NOT NULL,
    producto character varying(500) DEFAULT ''::character varying NOT NULL,
    peso numeric(8,2) NOT NULL,
    dimensiones_largo numeric(6,1),
    dimensiones_ancho numeric(6,1),
    dimensiones_alto numeric(6,1),
    fragil boolean DEFAULT false NOT NULL,
    valor_declarado bigint DEFAULT 0 NOT NULL,
    instrucciones_entrega text,
    horario_entrega character varying(100),
    notas text,
    estado public.envio_estado DEFAULT 'pendiente'::public.envio_estado NOT NULL,
    costo bigint DEFAULT 0 NOT NULL,
    monto_a_cobrar bigint DEFAULT 0 NOT NULL,
    tipo_pago public.tipo_pago DEFAULT 'anticipado'::public.tipo_pago NOT NULL,
    repartidor_id uuid,
    repartidor_asignado_en timestamp with time zone,
    problema_descripcion text,
    problema_fecha timestamp with time zone,
    tags text[] DEFAULT '{}'::text[],
    tarifa_id uuid,
    fecha date DEFAULT CURRENT_DATE NOT NULL,
    eliminado boolean DEFAULT false NOT NULL,
    eliminado_por uuid,
    eliminado_en timestamp with time zone,
    motivo_eliminacion text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    seguro_adicional boolean DEFAULT false NOT NULL,
    costo_seguro bigint DEFAULT 0 NOT NULL,
    destinatario_email character varying(320),
    foto_entrega_url text,
    entregado_por_nombre text,
    entregado_por_documento text,
    fecha_entrega_real timestamp with time zone,
    monto_cobrado bigint,
    recolectado_en timestamp with time zone,
    entrega_notas text,
    tiene_incidencia boolean DEFAULT false NOT NULL,
    incidencia_nota text,
    incidencia_reportada_en timestamp with time zone,
    incidencia_reportada_por uuid,
    cod_pago_pendiente boolean DEFAULT false NOT NULL,
    api_idempotency_key text,
    CONSTRAINT envios_costo_check CHECK ((costo >= 0)),
    CONSTRAINT envios_i1_monto_cubre_tarifa CHECK (((eliminado = true) OR ((tipo_pago = 'anticipado'::public.tipo_pago) AND (monto_a_cobrar = (costo + costo_seguro))) OR ((tipo_pago = 'contra_entrega'::public.tipo_pago) AND (monto_a_cobrar >= (costo + costo_seguro))))),
    CONSTRAINT envios_monto_a_cobrar_check CHECK ((monto_a_cobrar >= 0)),
    CONSTRAINT envios_peso_check CHECK ((peso >= (0)::numeric)),
    CONSTRAINT envios_tipo_pago_no_cc CHECK ((tipo_pago <> 'cuenta_corriente'::public.tipo_pago)),
    CONSTRAINT envios_valor_declarado_check CHECK ((valor_declarado >= 0))
);


--
-- Name: COLUMN envios.seguro_adicional; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.envios.seguro_adicional IS 'True si el cliente agrego seguro adicional al envio. False si solo tiene la cobertura incluida por default.';


--
-- Name: COLUMN envios.costo_seguro; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.envios.costo_seguro IS 'Monto cobrado por el seguro adicional (Gs). Snapshot inmutable calculado al momento de crear el envio.';


--
-- Name: COLUMN envios.destinatario_email; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.envios.destinatario_email IS 'Optional email of the end recipient. When present, we notify them on envio created, state changes, delivered, and problems. Independent from clientes.email (which is the empresa contact).';


--
-- Name: COLUMN envios.foto_entrega_url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.envios.foto_entrega_url IS 'Path en bucket pod-entregas (formato envio_id/pod_TS.ext). Se borra a los 30 dias por politica de retencion. Cuando es NULL despues de fecha_entrega_real, la foto fue purgada por la rutina de cleanup.';


--
-- Name: COLUMN envios.monto_cobrado; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.envios.monto_cobrado IS 'Monto efectivo cobrado al destinatario en COD. Puede diferir de monto_a_cobrar.';


--
-- Name: COLUMN envios.tiene_incidencia; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.envios.tiene_incidencia IS 'Flag que el repartidor activa al reportar un incidente. No cambia estado principal.';


--
-- Name: COLUMN envios.cod_pago_pendiente; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.envios.cod_pago_pendiente IS 'TRUE si un envio COD se marco entregado pero el registro del pago fallo (cobrado en la calle sin asiento). Cola de reconciliacion manual. Se limpia cuando el pago se registra correctamente.';


--
-- Name: COLUMN envios.api_idempotency_key; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.envios.api_idempotency_key IS 'Idempotency-Key del POST /api/v1/envios, unica por cliente. Un retry con la misma key devuelve el envio original en vez de crear otro. NULL en envios creados por portal/admin.';


--
-- Name: CONSTRAINT envios_i1_monto_cubre_tarifa ON envios; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON CONSTRAINT envios_i1_monto_cubre_tarifa ON public.envios IS 'I1 declarativo (M5 Step6): todo envio vivo cubre la tarifa GO EXPRESS. anticipado exige igualdad exacta (el cobro en calle ES la tarifa), contra_entrega exige cobertura (el excedente es producto de la tienda). eliminado=TRUE queda exento: la remediacion de historico irreconciliable es anular. Complementa (no reemplaza) el trigger trg_envio_i1_cubre_tarifa, que da mensajes de error de negocio.';


--
-- Name: CONSTRAINT envios_tipo_pago_no_cc ON envios; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON CONSTRAINT envios_tipo_pago_no_cc ON public.envios IS 'Modelo COD-only (036). cuenta_corriente queda fuera del sistema; solo anticipado y contra_entrega son validos. El valor del enum no se dropea (dependencias), se bloquea aca.';


--
-- Name: update_envio_estado_atomico(uuid, public.envio_estado, text, text, text, uuid, boolean, uuid, text, uuid, text, inet, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_envio_estado_atomico(p_envio_id uuid, p_nuevo_estado public.envio_estado, p_descripcion text, p_ubicacion text, p_problema_descr text, p_repartidor_id uuid, p_apply_repartidor boolean, p_actor_id uuid, p_actor_nombre text, p_audit_actor_id uuid, p_extra_descr text, p_ip inet, p_user_agent text) RETURNS public.envios
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_envio_previo  envios;
  v_envio_actual  envios;
  v_allowed       envio_estado[];
  v_descripcion_audit TEXT;
BEGIN
  IF p_descripcion IS NULL OR length(p_descripcion) = 0 THEN
    RAISE EXCEPTION 'descripcion_requerida: la descripcion no puede ser vacia'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_envio_previo
    FROM envios
   WHERE id = p_envio_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'envio_no_encontrado: %', p_envio_id
      USING ERRCODE = 'P0001';
  END IF;

  IF v_envio_previo.eliminado THEN
    RAISE EXCEPTION 'envio_eliminado: % esta eliminado, no se puede modificar', v_envio_previo.tracking_number
      USING ERRCODE = 'P0001';
  END IF;

  v_allowed := CASE v_envio_previo.estado
    WHEN 'pendiente'    THEN ARRAY['recolectado', 'problema']::envio_estado[]
    WHEN 'recolectado'  THEN ARRAY['en_transito', 'problema']::envio_estado[]
    WHEN 'en_transito'  THEN ARRAY['en_deposito', 'en_reparto', 'problema']::envio_estado[]
    WHEN 'en_deposito'  THEN ARRAY['en_reparto', 'problema']::envio_estado[]
    WHEN 'en_reparto'   THEN ARRAY['entregado', 'fallido', 'problema']::envio_estado[]
    WHEN 'fallido'      THEN ARRAY['en_reparto', 'problema']::envio_estado[]
    WHEN 'entregado'    THEN ARRAY[]::envio_estado[]
    WHEN 'problema'     THEN ARRAY['pendiente', 'recolectado', 'en_transito', 'en_deposito', 'en_reparto', 'fallido']::envio_estado[]
    ELSE ARRAY[]::envio_estado[]
  END;

  IF NOT (p_nuevo_estado = ANY(v_allowed)) THEN
    RAISE EXCEPTION 'transicion_invalida: % a % no es una transicion valida desde % (allowed: %)',
      v_envio_previo.estado, p_nuevo_estado, v_envio_previo.tracking_number, v_allowed
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE envios
     SET estado                  = p_nuevo_estado,
         problema_descripcion    = CASE
           WHEN p_nuevo_estado = 'problema' THEN p_problema_descr
           WHEN v_envio_previo.estado = 'problema' AND p_nuevo_estado <> 'problema' THEN NULL
           ELSE problema_descripcion
         END,
         problema_fecha          = CASE
           WHEN p_nuevo_estado = 'problema' THEN NOW()
           WHEN v_envio_previo.estado = 'problema' AND p_nuevo_estado <> 'problema' THEN NULL
           ELSE problema_fecha
         END,
         repartidor_id           = CASE
           WHEN p_apply_repartidor THEN p_repartidor_id
           ELSE repartidor_id
         END,
         repartidor_asignado_en  = CASE
           WHEN p_apply_repartidor AND p_repartidor_id IS NOT NULL THEN NOW()
           ELSE repartidor_asignado_en
         END,
         recolectado_en          = CASE
           WHEN p_nuevo_estado = 'recolectado' AND v_envio_previo.recolectado_en IS NULL THEN NOW()
           ELSE recolectado_en
         END,
         -- A1: marcar entregado por admin debe sellar la fecha de entrega, igual que el flujo
         -- del repartidor. Sin esto el envio entregado nunca entra a una liquidacion.
         fecha_entrega_real      = CASE
           WHEN p_nuevo_estado = 'entregado' AND v_envio_previo.fecha_entrega_real IS NULL THEN NOW()
           ELSE fecha_entrega_real
         END,
         updated_at              = NOW()
   WHERE id = p_envio_id
  RETURNING * INTO v_envio_actual;

  INSERT INTO eventos_envio (envio_id, estado, descripcion, ubicacion, registrado_por_nombre)
  VALUES (p_envio_id, p_nuevo_estado, p_descripcion, p_ubicacion, p_actor_nombre);

  v_descripcion_audit := format(
    'Envio %s: "%s" a "%s". %s%s',
    v_envio_actual.tracking_number,
    v_envio_previo.estado,
    p_nuevo_estado,
    p_descripcion,
    CASE WHEN p_extra_descr IS NOT NULL THEN ' ' || p_extra_descr ELSE '' END
  );

  INSERT INTO auditoria_log (
    usuario, usuario_id, accion, entidad, entidad_id,
    descripcion, valor_anterior, valor_nuevo, ip_address, user_agent
  ) VALUES (
    p_actor_nombre, p_audit_actor_id, 'cambio_estado', 'envio', p_envio_id::TEXT,
    v_descripcion_audit,
    jsonb_build_object('estado', v_envio_previo.estado, 'repartidor_id', v_envio_previo.repartidor_id),
    jsonb_build_object('estado', v_envio_actual.estado, 'repartidor_id', v_envio_actual.repartidor_id),
    p_ip, p_user_agent
  );

  RETURN v_envio_actual;
END;
$$;


--
-- Name: FUNCTION update_envio_estado_atomico(p_envio_id uuid, p_nuevo_estado public.envio_estado, p_descripcion text, p_ubicacion text, p_problema_descr text, p_repartidor_id uuid, p_apply_repartidor boolean, p_actor_id uuid, p_actor_nombre text, p_audit_actor_id uuid, p_extra_descr text, p_ip inet, p_user_agent text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.update_envio_estado_atomico(p_envio_id uuid, p_nuevo_estado public.envio_estado, p_descripcion text, p_ubicacion text, p_problema_descr text, p_repartidor_id uuid, p_apply_repartidor boolean, p_actor_id uuid, p_actor_nombre text, p_audit_actor_id uuid, p_extra_descr text, p_ip inet, p_user_agent text) IS 'Transiciona el estado de un envio bajo SELECT FOR UPDATE, valida la transicion contra la matriz hardcodeada (sincronizada con TS), inserta eventos_envio y auditoria_log en la misma transaccion. Errores estables: envio_no_encontrado, envio_eliminado, transicion_invalida.';


--
-- Name: update_pago_atomico(uuid, bigint, public.metodo_pago, date, text, text, boolean, boolean, boolean, boolean, uuid, text, inet, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_pago_atomico(p_pago_id uuid, p_monto_recibido bigint, p_metodo_pago public.metodo_pago, p_fecha_pago date, p_referencia text, p_notas text, p_apply_metodo boolean, p_apply_fecha boolean, p_apply_referencia boolean, p_apply_notas boolean, p_actualizado_por uuid, p_usuario_nombre text, p_ip inet, p_user_agent text) RETURNS public.pagos
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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

  PERFORM 1 FROM envios WHERE id = v_pago_previo.envio_id FOR UPDATE;  -- E: lock del envio (recurso comun) ANTES del guard; serializa contra crear/cerrar_liquidacion aunque el detalle aun no exista (cierra TOCTOU C1/C2)
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
$$;


--
-- Name: FUNCTION update_pago_atomico(p_pago_id uuid, p_monto_recibido bigint, p_metodo_pago public.metodo_pago, p_fecha_pago date, p_referencia text, p_notas text, p_apply_metodo boolean, p_apply_fecha boolean, p_apply_referencia boolean, p_apply_notas boolean, p_actualizado_por uuid, p_usuario_nombre text, p_ip inet, p_user_agent text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.update_pago_atomico(p_pago_id uuid, p_monto_recibido bigint, p_metodo_pago public.metodo_pago, p_fecha_pago date, p_referencia text, p_notas text, p_apply_metodo boolean, p_apply_fecha boolean, p_apply_referencia boolean, p_apply_notas boolean, p_actualizado_por uuid, p_usuario_nombre text, p_ip inet, p_user_agent text) IS 'Actualiza pago bajo lock + auditoria en la misma transaccion. Pago a cuenta corriente con cambio de monto_recibido: rechaza con pago_cc_no_editable (Opcion A append-only). Valida monto_recibido <= costo real del envio, no contra monto_total del caller.';


--
-- Name: update_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: api_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.api_keys (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cliente_id uuid NOT NULL,
    nombre text NOT NULL,
    key_hash text NOT NULL,
    key_prefix text NOT NULL,
    permisos text[] NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    revocada_en timestamp with time zone,
    revocada_por uuid,
    expira_en timestamp with time zone,
    last_used_at timestamp with time zone,
    creado_por uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT api_keys_nombre_no_vacio CHECK ((length(TRIM(BOTH FROM nombre)) >= 3)),
    CONSTRAINT api_keys_permisos_validos CHECK (((cardinality(permisos) > 0) AND (permisos <@ ARRAY['crear_envios'::text, 'consultar_envios'::text, 'consultar_tarifas'::text])))
);


--
-- Name: TABLE api_keys; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.api_keys IS 'Credenciales del API Gateway v1 (Fase 1). Una key pertenece a UN cliente y solo opera sobre sus envios. key_hash es sha256 hex del plaintext (que se entrega una sola vez al crear); el middleware valida activo + no revocada + no expirada y anota last_used_at. Revocar es definitivo (activo=FALSE); rotar crea una key nueva y deja la vieja con expira_en = ahora + ventana.';


--
-- Name: COLUMN api_keys.key_hash; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.api_keys.key_hash IS 'sha256 hex de la key completa. Nunca plaintext. El lookup del middleware es por igualdad sobre el indice unico.';


--
-- Name: COLUMN api_keys.key_prefix; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.api_keys.key_prefix IS 'Primeros 12 caracteres de la key (ge_live_ + 4). Unico dato mostrable en UI y logs para identificarla.';


--
-- Name: COLUMN api_keys.expira_en; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.api_keys.expira_en IS 'Fin de la ventana de rotacion. La key sigue operativa hasta esta fecha aunque exista una sucesora. NULL = sin expiracion.';


--
-- Name: auditoria_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auditoria_log (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    usuario character varying(200) NOT NULL,
    usuario_id uuid NOT NULL,
    accion public.auditoria_accion NOT NULL,
    entidad public.auditoria_entidad NOT NULL,
    entidad_id character varying(100) NOT NULL,
    descripcion text NOT NULL,
    valor_anterior jsonb,
    valor_nuevo jsonb,
    ip_address inet,
    user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ciudades; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ciudades (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nombre text NOT NULL,
    departamento_id uuid NOT NULL,
    es_capital boolean DEFAULT false NOT NULL,
    orden integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE ciudades; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.ciudades IS 'Catalogo de 263 distritos de Paraguay. Fuente: DGEEC. Habilitada es derivada (existe tarifa activa).';


--
-- Name: COLUMN ciudades.nombre; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ciudades.nombre IS 'Nombre oficial del distrito. Unique por departamento.';


--
-- Name: COLUMN ciudades.departamento_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ciudades.departamento_id IS 'FK al departamento al que pertenece. RESTRICT para evitar borrar departamentos con ciudades.';


--
-- Name: COLUMN ciudades.es_capital; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ciudades.es_capital IS 'True si es la capital del departamento. Se renderiza primero y con icono.';


--
-- Name: COLUMN ciudades.orden; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ciudades.orden IS 'Orden dentro del grupo de departamento. Capital (0) primero, resto alfabetico (1..N).';


--
-- Name: clientes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clientes (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    auth_id uuid,
    razon_social character varying(300) NOT NULL,
    ruc text NOT NULL,
    contacto_nombre text NOT NULL,
    contacto_cargo character varying(100),
    telefono text NOT NULL,
    email text NOT NULL,
    direccion text,
    ciudad character varying(100),
    estado public.cliente_estado DEFAULT 'activo'::public.cliente_estado NOT NULL,
    plan public.cliente_plan DEFAULT 'basico'::public.cliente_plan NOT NULL,
    total_envios integer DEFAULT 0 NOT NULL,
    envios_activos integer DEFAULT 0 NOT NULL,
    notas text,
    eliminado boolean DEFAULT false NOT NULL,
    eliminado_por uuid,
    eliminado_en timestamp with time zone,
    motivo_eliminacion text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    portal_activo boolean DEFAULT false NOT NULL,
    portal_status public.portal_status_tipo DEFAULT 'sin_invitar'::public.portal_status_tipo NOT NULL,
    portal_invited_at timestamp with time zone,
    es_mostrador boolean DEFAULT false NOT NULL
);


--
-- Name: COLUMN clientes.es_mostrador; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.clientes.es_mostrador IS 'Cliente sentinela para envios walk-in. Solo un row deberia tener TRUE. Permite override de cliente_nombre por envio.';


--
-- Name: configuracion; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.configuracion (
    key character varying(100) NOT NULL,
    value jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid
);


--
-- Name: TABLE configuracion; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.configuracion IS 'Key-value config global del sistema. Keys notables: seguro_config (JSONB), notificaciones_config (JSONB), empresa (JSONB), tracking_prefix, tracking_year.';


--
-- Name: departamentos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.departamentos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nombre text NOT NULL,
    capital text NOT NULL,
    orden integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE departamentos; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.departamentos IS 'Catalogo de departamentos de Paraguay. 18 filas, inmutable.';


--
-- Name: COLUMN departamentos.nombre; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.departamentos.nombre IS 'Nombre oficial del departamento. Unique.';


--
-- Name: COLUMN departamentos.capital; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.departamentos.capital IS 'Ciudad capital del departamento. Referencia textual, no FK.';


--
-- Name: COLUMN departamentos.orden; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.departamentos.orden IS 'Orden de visualizacion en selects. Asuncion primero, resto alfabetico.';


--
-- Name: eventos_envio; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.eventos_envio (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    envio_id uuid NOT NULL,
    estado public.envio_estado NOT NULL,
    descripcion text NOT NULL,
    ubicacion character varying(200),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    registrado_por_nombre text
);


--
-- Name: intentos_contacto; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.intentos_contacto (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    envio_id uuid NOT NULL,
    tipo public.intento_contacto_tipo NOT NULL,
    descripcion text,
    registrado_por uuid,
    registrado_por_nombre text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: inventario_almacen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventario_almacen (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    envio_id uuid,
    tracking_number character varying(20) NOT NULL,
    cliente_nombre character varying(300) NOT NULL,
    ubicacion character varying(200) NOT NULL,
    zona character varying(10) NOT NULL,
    estante character varying(10),
    estado_almacen public.estado_almacen DEFAULT 'recibido'::public.estado_almacen NOT NULL,
    fecha_ingreso timestamp with time zone DEFAULT now(),
    fecha_salida timestamp with time zone,
    peso numeric(8,2) NOT NULL,
    dimensiones_largo numeric(6,1),
    dimensiones_ancho numeric(6,1),
    dimensiones_alto numeric(6,1),
    volumen numeric(10,2),
    notas text,
    prioridad public.prioridad_tipo DEFAULT 'normal'::public.prioridad_tipo NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: liquidacion_ajustes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.liquidacion_ajustes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    liquidacion_id uuid NOT NULL,
    tipo public.tipo_ajuste_liquidacion NOT NULL,
    monto bigint NOT NULL,
    motivo text NOT NULL,
    creado_por uuid NOT NULL,
    eliminado boolean DEFAULT false NOT NULL,
    eliminado_por uuid,
    eliminado_en timestamp with time zone,
    motivo_eliminacion text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT liquidacion_ajustes_monto_positivo CHECK ((monto > 0))
);


--
-- Name: TABLE liquidacion_ajustes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.liquidacion_ajustes IS 'Asientos contables de la diferencia de caja al cerrar una liquidacion (M2 Step6). cobranza_repartidor = faltante que el repartidor debe a GO EXPRESS (esperado - recibido). sobrante_a_investigar = efectivo excedente sin duenio conocido (recibido - esperado). Un cierre con_diferencia genera exactamente un asiento activo; reabrir la liquidacion lo anula (soft-delete) porque pertenece al cierre anterior.';


--
-- Name: COLUMN liquidacion_ajustes.monto; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.liquidacion_ajustes.monto IS 'BIGINT Gs, siempre positivo. El signo lo da el tipo: cobranza_repartidor suma como cuenta por cobrar, sobrante_a_investigar resta del efectivo repartible.';


--
-- Name: liquidacion_envios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.liquidacion_envios (
    liquidacion_id uuid NOT NULL,
    envio_id uuid NOT NULL,
    monto_esperado bigint NOT NULL,
    monto_cobrado bigint NOT NULL,
    conciliado boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE liquidacion_envios; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.liquidacion_envios IS 'Snapshot de los envios incluidos en una liquidacion. monto_esperado y monto_cobrado se congelan en el momento de crear la liquidacion para que cierres tardios no se vean afectados por ediciones posteriores del pago.';


--
-- Name: COLUMN liquidacion_envios.monto_esperado; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.liquidacion_envios.monto_esperado IS 'Snapshot de envios.monto_a_cobrar al momento de crear la liquidacion.';


--
-- Name: COLUMN liquidacion_envios.monto_cobrado; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.liquidacion_envios.monto_cobrado IS 'Snapshot de envios.monto_cobrado al momento de crear la liquidacion.';


--
-- Name: COLUMN liquidacion_envios.conciliado; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.liquidacion_envios.conciliado IS 'Marca que el envio ya paso por una liquidacion cerrada. Usado por el unique parcial para bloquear doble-liquidacion.';


--
-- Name: movimientos_almacen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.movimientos_almacen (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    paquete_id uuid NOT NULL,
    tracking_number character varying(20) NOT NULL,
    tipo public.movimiento_tipo NOT NULL,
    ubicacion_origen character varying(200),
    ubicacion_destino character varying(200),
    usuario character varying(200) NOT NULL,
    usuario_id uuid NOT NULL,
    notas text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: notas_internas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notas_internas (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    envio_id uuid NOT NULL,
    texto text NOT NULL,
    usuario character varying(200) NOT NULL,
    usuario_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: notificaciones_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notificaciones_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    envio_id uuid NOT NULL,
    evento public.notif_evento NOT NULL,
    canal public.notif_canal NOT NULL,
    destinatario text NOT NULL,
    status public.notif_status NOT NULL,
    proveedor_message_id text,
    error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE notificaciones_log; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.notificaciones_log IS 'Log inmutable de cada intento de notificacion outbound (email/whatsapp). Insert-only desde notificaciones.service.ts. RLS deny all, solo service_role.';


--
-- Name: picking_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.picking_items (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    envio_id uuid NOT NULL,
    tracking_number character varying(20) NOT NULL,
    cliente_nombre character varying(300) NOT NULL,
    ubicacion character varying(200) NOT NULL,
    destino character varying(100) NOT NULL,
    peso numeric(8,2) NOT NULL,
    prioridad public.prioridad_tipo DEFAULT 'normal'::public.prioridad_tipo NOT NULL,
    pickeado boolean DEFAULT false NOT NULL,
    empaquetado boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: productos_guardados; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.productos_guardados (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    cliente_id uuid NOT NULL,
    nombre character varying(300) NOT NULL,
    descripcion text,
    peso numeric(8,2) NOT NULL,
    dimensiones_largo numeric(6,1),
    dimensiones_ancho numeric(6,1),
    dimensiones_alto numeric(6,1),
    fragil boolean DEFAULT false NOT NULL,
    valor_declarado bigint DEFAULT 0,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: repartidores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.repartidores (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    nombre character varying(200) NOT NULL,
    telefono text NOT NULL,
    vehiculo public.vehiculo_tipo NOT NULL,
    placa character varying(20) NOT NULL,
    licencia character varying(50),
    estado public.repartidor_estado DEFAULT 'activo'::public.repartidor_estado NOT NULL,
    eliminado boolean DEFAULT false NOT NULL,
    eliminado_por uuid,
    eliminado_en timestamp with time zone,
    motivo_eliminacion text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    auth_id uuid,
    email text,
    portal_status text DEFAULT 'no_invitado'::text NOT NULL,
    portal_invited_at timestamp with time zone,
    CONSTRAINT repartidores_portal_status_check CHECK ((portal_status = ANY (ARRAY['no_invitado'::text, 'invitado'::text, 'activo'::text])))
);


--
-- Name: COLUMN repartidores.auth_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.repartidores.auth_id IS 'Supabase Auth user id for portal login. Null if not yet invited.';


--
-- Name: COLUMN repartidores.portal_status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.repartidores.portal_status IS 'no_invitado | invitado | activo. Drives invite button state in admin UI.';


--
-- Name: system_locks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_locks (
    name text NOT NULL,
    owner text NOT NULL,
    acquired_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL
);


--
-- Name: TABLE system_locks; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.system_locks IS 'Locks distribuidos por nombre, con TTL. Pensado para jobs del API que corren en multiples instancias (Railway). Se acquire/release via try_acquire_system_lock / release_system_lock.';


--
-- Name: COLUMN system_locks.owner; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.system_locks.owner IS 'Identificador unico del holder (host:pid:uuid). Solo el owner puede release; la expiracion permite re-acquire si el holder crashea.';


--
-- Name: COLUMN system_locks.expires_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.system_locks.expires_at IS 'Timestamp tras el cual cualquier instancia puede tomar el lock (failsafe contra crashes).';


--
-- Name: tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tags (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    cliente_id uuid NOT NULL,
    nombre character varying(100) NOT NULL,
    color character varying(30) DEFAULT 'default'::character varying,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tarifas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tarifas (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    origen character varying(100) NOT NULL,
    destino character varying(100) NOT NULL,
    tipo_servicio public.tipo_servicio NOT NULL,
    precio_base bigint NOT NULL,
    peso_base numeric(6,2) NOT NULL,
    precio_por_kg_extra bigint DEFAULT 0 NOT NULL,
    factor_dimensional integer DEFAULT 5000 NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    creado_por uuid NOT NULL,
    eliminado boolean DEFAULT false NOT NULL,
    eliminado_por uuid,
    eliminado_en timestamp with time zone,
    motivo_eliminacion text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    origen_ciudad_id uuid,
    destino_ciudad_id uuid,
    CONSTRAINT tarifas_precio_base_check CHECK ((precio_base > 0)),
    CONSTRAINT tarifas_precio_por_kg_extra_check CHECK ((precio_por_kg_extra >= 0))
);


--
-- Name: COLUMN tarifas.origen_ciudad_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tarifas.origen_ciudad_id IS 'FK al catalogo de ciudades. Reemplaza la columna origen (text) que queda para retrocompatibilidad 1 sprint.';


--
-- Name: COLUMN tarifas.destino_ciudad_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tarifas.destino_ciudad_id IS 'FK al catalogo de ciudades. Reemplaza la columna destino (text) que queda para retrocompatibilidad 1 sprint.';


--
-- Name: tracking_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tracking_seq
    START WITH 1000
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: usuarios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usuarios (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    auth_id uuid,
    nombre character varying(200) NOT NULL,
    email character varying(320) NOT NULL,
    rol public.user_role DEFAULT 'operador'::public.user_role NOT NULL,
    estado public.user_status DEFAULT 'activo'::public.user_status NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: api_keys api_keys_key_hash_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_key_hash_unique UNIQUE (key_hash);


--
-- Name: api_keys api_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_pkey PRIMARY KEY (id);


--
-- Name: auditoria_log auditoria_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auditoria_log
    ADD CONSTRAINT auditoria_log_pkey PRIMARY KEY (id);


--
-- Name: ciudades ciudades_nombre_departamento_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ciudades
    ADD CONSTRAINT ciudades_nombre_departamento_id_key UNIQUE (nombre, departamento_id);


--
-- Name: ciudades ciudades_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ciudades
    ADD CONSTRAINT ciudades_pkey PRIMARY KEY (id);


--
-- Name: clientes clientes_auth_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clientes
    ADD CONSTRAINT clientes_auth_id_key UNIQUE (auth_id);


--
-- Name: clientes clientes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clientes
    ADD CONSTRAINT clientes_pkey PRIMARY KEY (id);


--
-- Name: configuracion configuracion_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.configuracion
    ADD CONSTRAINT configuracion_pkey PRIMARY KEY (key);


--
-- Name: departamentos departamentos_nombre_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departamentos
    ADD CONSTRAINT departamentos_nombre_key UNIQUE (nombre);


--
-- Name: departamentos departamentos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departamentos
    ADD CONSTRAINT departamentos_pkey PRIMARY KEY (id);


--
-- Name: envios envios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.envios
    ADD CONSTRAINT envios_pkey PRIMARY KEY (id);


--
-- Name: envios envios_tracking_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.envios
    ADD CONSTRAINT envios_tracking_number_key UNIQUE (tracking_number);


--
-- Name: eventos_envio eventos_envio_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eventos_envio
    ADD CONSTRAINT eventos_envio_pkey PRIMARY KEY (id);


--
-- Name: intentos_contacto intentos_contacto_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.intentos_contacto
    ADD CONSTRAINT intentos_contacto_pkey PRIMARY KEY (id);


--
-- Name: inventario_almacen inventario_almacen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventario_almacen
    ADD CONSTRAINT inventario_almacen_pkey PRIMARY KEY (id);


--
-- Name: liquidacion_ajustes liquidacion_ajustes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.liquidacion_ajustes
    ADD CONSTRAINT liquidacion_ajustes_pkey PRIMARY KEY (id);


--
-- Name: liquidacion_envios liquidacion_envios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.liquidacion_envios
    ADD CONSTRAINT liquidacion_envios_pkey PRIMARY KEY (liquidacion_id, envio_id);


--
-- Name: liquidaciones_repartidor liquidaciones_repartidor_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.liquidaciones_repartidor
    ADD CONSTRAINT liquidaciones_repartidor_pkey PRIMARY KEY (id);


--
-- Name: liquidaciones_repartidor liquidaciones_repartidor_rango_no_solapado; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.liquidaciones_repartidor
    ADD CONSTRAINT liquidaciones_repartidor_rango_no_solapado EXCLUDE USING gist (repartidor_id WITH =, daterange(fecha_desde, fecha_hasta, '[]'::text) WITH &&);


--
-- Name: CONSTRAINT liquidaciones_repartidor_rango_no_solapado ON liquidaciones_repartidor; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON CONSTRAINT liquidaciones_repartidor_rango_no_solapado ON public.liquidaciones_repartidor IS 'Imposible a nivel DB tener dos liquidaciones del mismo repartidor con rangos de fecha solapados. Complementa el chequeo en crear_liquidacion cerrando la race window entre dos transacciones concurrentes.';


--
-- Name: movimientos_almacen movimientos_almacen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.movimientos_almacen
    ADD CONSTRAINT movimientos_almacen_pkey PRIMARY KEY (id);


--
-- Name: notas_internas notas_internas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notas_internas
    ADD CONSTRAINT notas_internas_pkey PRIMARY KEY (id);


--
-- Name: notificaciones_log notificaciones_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notificaciones_log
    ADD CONSTRAINT notificaciones_log_pkey PRIMARY KEY (id);


--
-- Name: pagos pagos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pagos
    ADD CONSTRAINT pagos_pkey PRIMARY KEY (id);


--
-- Name: picking_items picking_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.picking_items
    ADD CONSTRAINT picking_items_pkey PRIMARY KEY (id);


--
-- Name: productos_guardados productos_guardados_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.productos_guardados
    ADD CONSTRAINT productos_guardados_pkey PRIMARY KEY (id);


--
-- Name: repartidores repartidores_auth_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.repartidores
    ADD CONSTRAINT repartidores_auth_id_key UNIQUE (auth_id);


--
-- Name: repartidores repartidores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.repartidores
    ADD CONSTRAINT repartidores_pkey PRIMARY KEY (id);


--
-- Name: system_locks system_locks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_locks
    ADD CONSTRAINT system_locks_pkey PRIMARY KEY (name);


--
-- Name: tags tags_cliente_id_nombre_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_cliente_id_nombre_key UNIQUE (cliente_id, nombre);


--
-- Name: tags tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_pkey PRIMARY KEY (id);


--
-- Name: tarifas tarifas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tarifas
    ADD CONSTRAINT tarifas_pkey PRIMARY KEY (id);


--
-- Name: usuarios usuarios_auth_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_auth_id_key UNIQUE (auth_id);


--
-- Name: usuarios usuarios_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_email_key UNIQUE (email);


--
-- Name: usuarios usuarios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_pkey PRIMARY KEY (id);


--
-- Name: idx_api_keys_cliente; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_api_keys_cliente ON public.api_keys USING btree (cliente_id);


--
-- Name: idx_api_keys_creado_por; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_api_keys_creado_por ON public.api_keys USING btree (creado_por);


--
-- Name: idx_api_keys_revocada_por; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_api_keys_revocada_por ON public.api_keys USING btree (revocada_por) WHERE (revocada_por IS NOT NULL);


--
-- Name: idx_auditoria_accion; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_auditoria_accion ON public.auditoria_log USING btree (accion);


--
-- Name: idx_auditoria_entidad; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_auditoria_entidad ON public.auditoria_log USING btree (entidad, entidad_id);


--
-- Name: idx_auditoria_entidad_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_auditoria_entidad_fecha ON public.auditoria_log USING btree (entidad, entidad_id, created_at DESC);


--
-- Name: INDEX idx_auditoria_entidad_fecha; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON INDEX public.idx_auditoria_entidad_fecha IS 'Acelera la consulta del log de auditoria de una entidad ordenado por fecha. Reemplaza el plan que combinaba idx_auditoria_entidad + filesort.';


--
-- Name: idx_auditoria_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_auditoria_fecha ON public.auditoria_log USING btree (created_at DESC);


--
-- Name: idx_auditoria_usuario; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_auditoria_usuario ON public.auditoria_log USING btree (usuario_id);


--
-- Name: idx_ciudades_departamento; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ciudades_departamento ON public.ciudades USING btree (departamento_id);


--
-- Name: idx_ciudades_departamento_orden; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ciudades_departamento_orden ON public.ciudades USING btree (departamento_id, orden);


--
-- Name: idx_clientes_auth_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clientes_auth_id ON public.clientes USING btree (auth_id) WHERE (auth_id IS NOT NULL);


--
-- Name: idx_clientes_contacto_nombre; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clientes_contacto_nombre ON public.clientes USING gin (contacto_nombre public.gin_trgm_ops);


--
-- Name: idx_clientes_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clientes_created_at ON public.clientes USING btree (created_at DESC) WHERE (eliminado = false);


--
-- Name: idx_clientes_email_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_clientes_email_unique ON public.clientes USING btree (email) WHERE (eliminado = false);


--
-- Name: idx_clientes_estado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clientes_estado ON public.clientes USING btree (estado) WHERE (eliminado = false);


--
-- Name: idx_clientes_mostrador_unico; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_clientes_mostrador_unico ON public.clientes USING btree (es_mostrador) WHERE ((es_mostrador = true) AND (eliminado = false));


--
-- Name: idx_clientes_razon_social; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clientes_razon_social ON public.clientes USING gin (razon_social public.gin_trgm_ops);


--
-- Name: idx_clientes_ruc_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_clientes_ruc_unique ON public.clientes USING btree (ruc) WHERE (eliminado = false);


--
-- Name: idx_departamentos_orden; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_departamentos_orden ON public.departamentos USING btree (orden);


--
-- Name: idx_envios_api_idempotency; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_envios_api_idempotency ON public.envios USING btree (cliente_id, api_idempotency_key) WHERE (api_idempotency_key IS NOT NULL);


--
-- Name: idx_envios_cliente; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_envios_cliente ON public.envios USING btree (cliente_id);


--
-- Name: idx_envios_cliente_eliminado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_envios_cliente_eliminado ON public.envios USING btree (cliente_id, eliminado) WHERE (eliminado = false);


--
-- Name: idx_envios_cliente_estado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_envios_cliente_estado ON public.envios USING btree (cliente_id, estado);


--
-- Name: idx_envios_cod_pago_pendiente; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_envios_cod_pago_pendiente ON public.envios USING btree (cod_pago_pendiente) WHERE (cod_pago_pendiente = true);


--
-- Name: idx_envios_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_envios_created_at ON public.envios USING btree (created_at DESC);


--
-- Name: idx_envios_destinatario_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_envios_destinatario_email ON public.envios USING btree (destinatario_email) WHERE ((eliminado = false) AND (destinatario_email IS NOT NULL));


--
-- Name: idx_envios_destinatario_nombre; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_envios_destinatario_nombre ON public.envios USING gin (destinatario_nombre public.gin_trgm_ops);


--
-- Name: idx_envios_destinatario_telefono; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_envios_destinatario_telefono ON public.envios USING btree (destinatario_telefono);


--
-- Name: idx_envios_estado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_envios_estado ON public.envios USING btree (estado);


--
-- Name: idx_envios_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_envios_fecha ON public.envios USING btree (fecha DESC);


--
-- Name: idx_envios_fecha_eliminado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_envios_fecha_eliminado ON public.envios USING btree (fecha, eliminado) WHERE (eliminado = false);


--
-- Name: idx_envios_incidencia; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_envios_incidencia ON public.envios USING btree (tiene_incidencia, created_at DESC) WHERE ((tiene_incidencia = true) AND (eliminado = false));


--
-- Name: idx_envios_not_deleted; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_envios_not_deleted ON public.envios USING btree (id) WHERE (eliminado = false);


--
-- Name: idx_envios_repartidor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_envios_repartidor ON public.envios USING btree (repartidor_id) WHERE (repartidor_id IS NOT NULL);


--
-- Name: idx_envios_repartidor_entregado_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_envios_repartidor_entregado_fecha ON public.envios USING btree (repartidor_id, fecha_entrega_real DESC) WHERE ((estado = 'entregado'::public.envio_estado) AND (tipo_pago = 'contra_entrega'::public.tipo_pago) AND (eliminado = false));


--
-- Name: idx_envios_repartidor_estado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_envios_repartidor_estado ON public.envios USING btree (repartidor_id, estado) WHERE ((eliminado = false) AND (repartidor_id IS NOT NULL));


--
-- Name: INDEX idx_envios_repartidor_estado; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON INDEX public.idx_envios_repartidor_estado IS 'Driver portal mis-envios: filtro por (repartidor_id, estado) para listas pendientes/entregados. Parcial sobre no eliminados con repartidor asignado.';


--
-- Name: idx_envios_repartidor_fecha_entrega; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_envios_repartidor_fecha_entrega ON public.envios USING btree (repartidor_id, fecha_entrega_real DESC) WHERE (eliminado = false);


--
-- Name: idx_envios_tags; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_envios_tags ON public.envios USING gin (tags);


--
-- Name: idx_envios_tarifa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_envios_tarifa ON public.envios USING btree (tarifa_id) WHERE (tarifa_id IS NOT NULL);


--
-- Name: idx_eventos_envio; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_eventos_envio ON public.eventos_envio USING btree (envio_id, created_at);


--
-- Name: idx_intentos_contacto_envio; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_intentos_contacto_envio ON public.intentos_contacto USING btree (envio_id, created_at DESC);


--
-- Name: idx_intentos_contacto_registrado_por; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_intentos_contacto_registrado_por ON public.intentos_contacto USING btree (registrado_por);


--
-- Name: idx_inventario_envio; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventario_envio ON public.inventario_almacen USING btree (envio_id) WHERE (envio_id IS NOT NULL);


--
-- Name: idx_inventario_estado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventario_estado ON public.inventario_almacen USING btree (estado_almacen);


--
-- Name: idx_inventario_fecha_ingreso; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventario_fecha_ingreso ON public.inventario_almacen USING btree (fecha_ingreso);


--
-- Name: idx_inventario_fecha_salida; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventario_fecha_salida ON public.inventario_almacen USING btree (fecha_salida) WHERE (estado_almacen = 'despachado'::public.estado_almacen);


--
-- Name: idx_inventario_tracking; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventario_tracking ON public.inventario_almacen USING btree (tracking_number);


--
-- Name: idx_liquidacion_ajustes_creado_por; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_liquidacion_ajustes_creado_por ON public.liquidacion_ajustes USING btree (creado_por);


--
-- Name: idx_liquidacion_ajustes_liquidacion; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_liquidacion_ajustes_liquidacion ON public.liquidacion_ajustes USING btree (liquidacion_id) WHERE (eliminado = false);


--
-- Name: idx_liquidacion_ajustes_tipo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_liquidacion_ajustes_tipo ON public.liquidacion_ajustes USING btree (tipo) WHERE (eliminado = false);


--
-- Name: idx_liquidacion_envios_envio; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_liquidacion_envios_envio ON public.liquidacion_envios USING btree (envio_id);


--
-- Name: idx_liquidaciones_estado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_liquidaciones_estado ON public.liquidaciones_repartidor USING btree (estado, created_at DESC);


--
-- Name: idx_liquidaciones_repartidor_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_liquidaciones_repartidor_fecha ON public.liquidaciones_repartidor USING btree (repartidor_id, created_at DESC);


--
-- Name: idx_movimientos_paquete; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_movimientos_paquete ON public.movimientos_almacen USING btree (paquete_id);


--
-- Name: idx_notas_envio; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notas_envio ON public.notas_internas USING btree (envio_id, created_at);


--
-- Name: idx_notificaciones_log_envio; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notificaciones_log_envio ON public.notificaciones_log USING btree (envio_id, created_at DESC);


--
-- Name: idx_notificaciones_log_fallidos; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notificaciones_log_fallidos ON public.notificaciones_log USING btree (created_at DESC) WHERE (status = 'fallido'::public.notif_status);


--
-- Name: idx_pagos_activos_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pagos_activos_fecha ON public.pagos USING btree (fecha_pago DESC) WHERE (anulado = false);


--
-- Name: idx_pagos_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pagos_created_at ON public.pagos USING btree (created_at DESC);


--
-- Name: idx_pagos_envio; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pagos_envio ON public.pagos USING btree (envio_id);


--
-- Name: idx_pagos_estado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pagos_estado ON public.pagos USING btree (estado_pago);


--
-- Name: idx_pagos_fecha_pago; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pagos_fecha_pago ON public.pagos USING btree (fecha_pago) WHERE (estado_pago = 'pagado'::public.estado_pago);


--
-- Name: idx_picking_empaquetado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_picking_empaquetado ON public.picking_items USING btree (empaquetado) WHERE (empaquetado = false);


--
-- Name: idx_picking_envio; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_picking_envio ON public.picking_items USING btree (envio_id);


--
-- Name: idx_productos_cliente; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_productos_cliente ON public.productos_guardados USING btree (cliente_id);


--
-- Name: idx_repartidores_auth_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_repartidores_auth_id ON public.repartidores USING btree (auth_id);


--
-- Name: idx_repartidores_email_lower; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_repartidores_email_lower ON public.repartidores USING btree (lower(email)) WHERE ((email IS NOT NULL) AND (eliminado = false));


--
-- Name: idx_repartidores_estado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_repartidores_estado ON public.repartidores USING btree (estado) WHERE (eliminado = false);


--
-- Name: idx_tags_cliente; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tags_cliente ON public.tags USING btree (cliente_id);


--
-- Name: idx_tarifas_cotizador; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tarifas_cotizador ON public.tarifas USING btree (origen_ciudad_id, destino_ciudad_id, tipo_servicio) WHERE ((eliminado = false) AND (activo = true));


--
-- Name: idx_tarifas_destino_ciudad; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tarifas_destino_ciudad ON public.tarifas USING btree (destino_ciudad_id) WHERE (eliminado = false);


--
-- Name: idx_tarifas_origen_ciudad; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tarifas_origen_ciudad ON public.tarifas USING btree (origen_ciudad_id) WHERE (eliminado = false);


--
-- Name: idx_tarifas_ruta; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tarifas_ruta ON public.tarifas USING btree (origen, destino) WHERE ((eliminado = false) AND (activo = true));


--
-- Name: idx_usuarios_auth_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_usuarios_auth_id ON public.usuarios USING btree (auth_id) WHERE (auth_id IS NOT NULL);


--
-- Name: liquidacion_envios_unique_conciliado; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX liquidacion_envios_unique_conciliado ON public.liquidacion_envios USING btree (envio_id) WHERE (conciliado = true);


--
-- Name: INDEX liquidacion_envios_unique_conciliado; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON INDEX public.liquidacion_envios_unique_conciliado IS 'Un envio solo puede aparecer en una liquidacion cerrada. El INSERT del crear_liquidacion se corre primero, el UPDATE a conciliado = TRUE se hace al cerrar. Esto permite liquidaciones pendientes solapadas (caso raro) pero bloquea cualquier cierre duplicado.';


--
-- Name: pagos_envio_id_unique_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX pagos_envio_id_unique_active ON public.pagos USING btree (envio_id) WHERE (anulado = false);


--
-- Name: INDEX pagos_envio_id_unique_active; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON INDEX public.pagos_envio_id_unique_active IS 'Un unico pago activo por envio. Anular un pago libera la clave para que el mismo envio pueda recibir un nuevo cobro.';


--
-- Name: tarifas_ruta_servicio_unica; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX tarifas_ruta_servicio_unica ON public.tarifas USING btree (public.tarifa_norm_ciudad((origen)::text), public.tarifa_norm_ciudad((destino)::text), tipo_servicio) WHERE ((activo = true) AND (eliminado = false));


--
-- Name: api_keys trg_api_keys_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_api_keys_updated_at BEFORE UPDATE ON public.api_keys FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: ciudades trg_ciudades_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_ciudades_updated_at BEFORE UPDATE ON public.ciudades FOR EACH ROW EXECUTE FUNCTION public.trg_ciudades_updated_at();


--
-- Name: clientes trg_clientes_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_clientes_updated_at BEFORE UPDATE ON public.clientes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: configuracion trg_configuracion_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_configuracion_updated_at BEFORE UPDATE ON public.configuracion FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: departamentos trg_departamentos_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_departamentos_updated_at BEFORE UPDATE ON public.departamentos FOR EACH ROW EXECUTE FUNCTION public.trg_ciudades_updated_at();


--
-- Name: envios trg_envio_block_cod_monto_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_envio_block_cod_monto_change BEFORE UPDATE OF monto_a_cobrar, costo, costo_seguro ON public.envios FOR EACH ROW EXECUTE FUNCTION public.trg_envio_block_cod_monto_change_fn();


--
-- Name: envios trg_envio_block_tipo_pago_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_envio_block_tipo_pago_change BEFORE UPDATE OF tipo_pago ON public.envios FOR EACH ROW EXECUTE FUNCTION public.trg_envio_block_tipo_pago_change_fn();


--
-- Name: envios trg_envio_i1_cubre_tarifa; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_envio_i1_cubre_tarifa BEFORE INSERT OR UPDATE OF monto_a_cobrar, costo, costo_seguro, tipo_pago ON public.envios FOR EACH ROW EXECUTE FUNCTION public.trg_envio_i1_cubre_tarifa_fn();


--
-- Name: envios trg_envios_count; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_envios_count AFTER INSERT OR DELETE OR UPDATE OF estado ON public.envios FOR EACH ROW EXECUTE FUNCTION public.update_cliente_envio_counts();


--
-- Name: envios trg_envios_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_envios_updated_at BEFORE UPDATE ON public.envios FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: inventario_almacen trg_inventario_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_inventario_updated_at BEFORE UPDATE ON public.inventario_almacen FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: liquidacion_ajustes trg_liquidacion_ajustes_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_liquidacion_ajustes_updated_at BEFORE UPDATE ON public.liquidacion_ajustes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: liquidacion_envios trg_liquidacion_envios_inmutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_liquidacion_envios_inmutable BEFORE INSERT OR DELETE OR UPDATE ON public.liquidacion_envios FOR EACH ROW EXECUTE FUNCTION public.trg_liquidacion_envios_inmutable_fn();


--
-- Name: liquidaciones_repartidor trg_liquidacion_inmutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_liquidacion_inmutable BEFORE DELETE OR UPDATE ON public.liquidaciones_repartidor FOR EACH ROW EXECUTE FUNCTION public.trg_liquidacion_inmutable_fn();


--
-- Name: envios trg_no_truncate; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_no_truncate BEFORE TRUNCATE ON public.envios FOR EACH STATEMENT EXECUTE FUNCTION public.trg_ledger_no_truncate_fn();


--
-- Name: liquidacion_envios trg_no_truncate; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_no_truncate BEFORE TRUNCATE ON public.liquidacion_envios FOR EACH STATEMENT EXECUTE FUNCTION public.trg_ledger_no_truncate_fn();


--
-- Name: liquidaciones_repartidor trg_no_truncate; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_no_truncate BEFORE TRUNCATE ON public.liquidaciones_repartidor FOR EACH STATEMENT EXECUTE FUNCTION public.trg_ledger_no_truncate_fn();


--
-- Name: pagos trg_no_truncate; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_no_truncate BEFORE TRUNCATE ON public.pagos FOR EACH STATEMENT EXECUTE FUNCTION public.trg_ledger_no_truncate_fn();


--
-- Name: pagos trg_pago_requiere_repartidor; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_pago_requiere_repartidor BEFORE INSERT ON public.pagos FOR EACH ROW EXECUTE FUNCTION public.trg_pago_requiere_repartidor_fn();


--
-- Name: pagos trg_pago_sync_envio_cobrado; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_pago_sync_envio_cobrado AFTER INSERT OR UPDATE OF monto_recibido, anulado ON public.pagos FOR EACH ROW EXECUTE FUNCTION public.trg_pago_sync_envio_cobrado_fn();


--
-- Name: pagos trg_pagos_no_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_pagos_no_delete BEFORE DELETE ON public.pagos FOR EACH ROW EXECUTE FUNCTION public.trg_pagos_no_delete_fn();


--
-- Name: pagos trg_pagos_no_update_fisico; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_pagos_no_update_fisico BEFORE UPDATE ON public.pagos FOR EACH ROW EXECUTE FUNCTION public.trg_pagos_no_update_fisico_fn();


--
-- Name: pagos trg_pagos_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_pagos_updated_at BEFORE UPDATE ON public.pagos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: picking_items trg_picking_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_picking_updated_at BEFORE UPDATE ON public.picking_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: productos_guardados trg_productos_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_productos_updated_at BEFORE UPDATE ON public.productos_guardados FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: repartidores trg_repartidores_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_repartidores_updated_at BEFORE UPDATE ON public.repartidores FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: tarifas trg_tarifas_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_tarifas_updated_at BEFORE UPDATE ON public.tarifas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: usuarios trg_usuarios_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_usuarios_updated_at BEFORE UPDATE ON public.usuarios FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: api_keys api_keys_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id);


--
-- Name: api_keys api_keys_creado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_creado_por_fkey FOREIGN KEY (creado_por) REFERENCES public.usuarios(id);


--
-- Name: api_keys api_keys_revocada_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_revocada_por_fkey FOREIGN KEY (revocada_por) REFERENCES public.usuarios(id);


--
-- Name: auditoria_log auditoria_log_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auditoria_log
    ADD CONSTRAINT auditoria_log_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id);


--
-- Name: ciudades ciudades_departamento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ciudades
    ADD CONSTRAINT ciudades_departamento_id_fkey FOREIGN KEY (departamento_id) REFERENCES public.departamentos(id) ON DELETE RESTRICT;


--
-- Name: clientes clientes_eliminado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clientes
    ADD CONSTRAINT clientes_eliminado_por_fkey FOREIGN KEY (eliminado_por) REFERENCES public.usuarios(id);


--
-- Name: configuracion configuracion_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.configuracion
    ADD CONSTRAINT configuracion_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.usuarios(id);


--
-- Name: envios envios_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.envios
    ADD CONSTRAINT envios_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE RESTRICT;


--
-- Name: envios envios_eliminado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.envios
    ADD CONSTRAINT envios_eliminado_por_fkey FOREIGN KEY (eliminado_por) REFERENCES public.usuarios(id) ON DELETE SET NULL;


--
-- Name: envios envios_incidencia_reportada_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.envios
    ADD CONSTRAINT envios_incidencia_reportada_por_fkey FOREIGN KEY (incidencia_reportada_por) REFERENCES public.repartidores(id);


--
-- Name: envios envios_repartidor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.envios
    ADD CONSTRAINT envios_repartidor_id_fkey FOREIGN KEY (repartidor_id) REFERENCES public.repartidores(id) ON DELETE SET NULL;


--
-- Name: envios envios_tarifa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.envios
    ADD CONSTRAINT envios_tarifa_id_fkey FOREIGN KEY (tarifa_id) REFERENCES public.tarifas(id) ON DELETE RESTRICT;


--
-- Name: eventos_envio eventos_envio_envio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eventos_envio
    ADD CONSTRAINT eventos_envio_envio_id_fkey FOREIGN KEY (envio_id) REFERENCES public.envios(id) ON DELETE CASCADE;


--
-- Name: intentos_contacto intentos_contacto_envio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.intentos_contacto
    ADD CONSTRAINT intentos_contacto_envio_id_fkey FOREIGN KEY (envio_id) REFERENCES public.envios(id) ON DELETE CASCADE;


--
-- Name: intentos_contacto intentos_contacto_registrado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.intentos_contacto
    ADD CONSTRAINT intentos_contacto_registrado_por_fkey FOREIGN KEY (registrado_por) REFERENCES public.usuarios(id) ON DELETE SET NULL;


--
-- Name: inventario_almacen inventario_almacen_envio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventario_almacen
    ADD CONSTRAINT inventario_almacen_envio_id_fkey FOREIGN KEY (envio_id) REFERENCES public.envios(id);


--
-- Name: liquidacion_ajustes liquidacion_ajustes_creado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.liquidacion_ajustes
    ADD CONSTRAINT liquidacion_ajustes_creado_por_fkey FOREIGN KEY (creado_por) REFERENCES public.usuarios(id);


--
-- Name: liquidacion_ajustes liquidacion_ajustes_eliminado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.liquidacion_ajustes
    ADD CONSTRAINT liquidacion_ajustes_eliminado_por_fkey FOREIGN KEY (eliminado_por) REFERENCES public.usuarios(id);


--
-- Name: liquidacion_ajustes liquidacion_ajustes_liquidacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.liquidacion_ajustes
    ADD CONSTRAINT liquidacion_ajustes_liquidacion_id_fkey FOREIGN KEY (liquidacion_id) REFERENCES public.liquidaciones_repartidor(id);


--
-- Name: liquidacion_envios liquidacion_envios_envio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.liquidacion_envios
    ADD CONSTRAINT liquidacion_envios_envio_id_fkey FOREIGN KEY (envio_id) REFERENCES public.envios(id);


--
-- Name: liquidacion_envios liquidacion_envios_liquidacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.liquidacion_envios
    ADD CONSTRAINT liquidacion_envios_liquidacion_id_fkey FOREIGN KEY (liquidacion_id) REFERENCES public.liquidaciones_repartidor(id) ON DELETE CASCADE;


--
-- Name: liquidaciones_repartidor liquidaciones_repartidor_cerrada_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.liquidaciones_repartidor
    ADD CONSTRAINT liquidaciones_repartidor_cerrada_por_fkey FOREIGN KEY (cerrada_por) REFERENCES public.usuarios(id);


--
-- Name: liquidaciones_repartidor liquidaciones_repartidor_creado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.liquidaciones_repartidor
    ADD CONSTRAINT liquidaciones_repartidor_creado_por_fkey FOREIGN KEY (creado_por) REFERENCES public.usuarios(id);


--
-- Name: liquidaciones_repartidor liquidaciones_repartidor_repartidor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.liquidaciones_repartidor
    ADD CONSTRAINT liquidaciones_repartidor_repartidor_id_fkey FOREIGN KEY (repartidor_id) REFERENCES public.repartidores(id);


--
-- Name: movimientos_almacen movimientos_almacen_paquete_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.movimientos_almacen
    ADD CONSTRAINT movimientos_almacen_paquete_id_fkey FOREIGN KEY (paquete_id) REFERENCES public.inventario_almacen(id) ON DELETE CASCADE;


--
-- Name: movimientos_almacen movimientos_almacen_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.movimientos_almacen
    ADD CONSTRAINT movimientos_almacen_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id);


--
-- Name: notas_internas notas_internas_envio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notas_internas
    ADD CONSTRAINT notas_internas_envio_id_fkey FOREIGN KEY (envio_id) REFERENCES public.envios(id) ON DELETE CASCADE;


--
-- Name: notas_internas notas_internas_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notas_internas
    ADD CONSTRAINT notas_internas_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id);


--
-- Name: notificaciones_log notificaciones_log_envio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notificaciones_log
    ADD CONSTRAINT notificaciones_log_envio_id_fkey FOREIGN KEY (envio_id) REFERENCES public.envios(id) ON DELETE CASCADE;


--
-- Name: pagos pagos_anulado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pagos
    ADD CONSTRAINT pagos_anulado_por_fkey FOREIGN KEY (anulado_por) REFERENCES public.usuarios(id);


--
-- Name: pagos pagos_creado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pagos
    ADD CONSTRAINT pagos_creado_por_fkey FOREIGN KEY (creado_por) REFERENCES public.usuarios(id);


--
-- Name: pagos pagos_envio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pagos
    ADD CONSTRAINT pagos_envio_id_fkey FOREIGN KEY (envio_id) REFERENCES public.envios(id) ON DELETE RESTRICT;


--
-- Name: picking_items picking_items_envio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.picking_items
    ADD CONSTRAINT picking_items_envio_id_fkey FOREIGN KEY (envio_id) REFERENCES public.envios(id) ON DELETE CASCADE;


--
-- Name: productos_guardados productos_guardados_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.productos_guardados
    ADD CONSTRAINT productos_guardados_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE CASCADE;


--
-- Name: repartidores repartidores_auth_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.repartidores
    ADD CONSTRAINT repartidores_auth_id_fkey FOREIGN KEY (auth_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: repartidores repartidores_eliminado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.repartidores
    ADD CONSTRAINT repartidores_eliminado_por_fkey FOREIGN KEY (eliminado_por) REFERENCES public.usuarios(id);


--
-- Name: tags tags_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE CASCADE;


--
-- Name: tarifas tarifas_creado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tarifas
    ADD CONSTRAINT tarifas_creado_por_fkey FOREIGN KEY (creado_por) REFERENCES public.usuarios(id);


--
-- Name: tarifas tarifas_destino_ciudad_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tarifas
    ADD CONSTRAINT tarifas_destino_ciudad_id_fkey FOREIGN KEY (destino_ciudad_id) REFERENCES public.ciudades(id) ON DELETE RESTRICT;


--
-- Name: tarifas tarifas_eliminado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tarifas
    ADD CONSTRAINT tarifas_eliminado_por_fkey FOREIGN KEY (eliminado_por) REFERENCES public.usuarios(id);


--
-- Name: tarifas tarifas_origen_ciudad_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tarifas
    ADD CONSTRAINT tarifas_origen_ciudad_id_fkey FOREIGN KEY (origen_ciudad_id) REFERENCES public.ciudades(id) ON DELETE RESTRICT;


--
-- Name: api_keys; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

--
-- Name: auditoria_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.auditoria_log ENABLE ROW LEVEL SECURITY;

--
-- Name: ciudades; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ciudades ENABLE ROW LEVEL SECURITY;

--
-- Name: clientes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;

--
-- Name: configuracion; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.configuracion ENABLE ROW LEVEL SECURITY;

--
-- Name: api_keys deny_anon; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_anon ON public.api_keys TO anon USING (false) WITH CHECK (false);


--
-- Name: auditoria_log deny_anon; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_anon ON public.auditoria_log TO anon USING (false) WITH CHECK (false);


--
-- Name: clientes deny_anon; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_anon ON public.clientes TO anon USING (false) WITH CHECK (false);


--
-- Name: configuracion deny_anon; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_anon ON public.configuracion TO anon USING (false) WITH CHECK (false);


--
-- Name: envios deny_anon; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_anon ON public.envios TO anon USING (false) WITH CHECK (false);


--
-- Name: eventos_envio deny_anon; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_anon ON public.eventos_envio TO anon USING (false) WITH CHECK (false);


--
-- Name: intentos_contacto deny_anon; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_anon ON public.intentos_contacto TO anon USING (false) WITH CHECK (false);


--
-- Name: inventario_almacen deny_anon; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_anon ON public.inventario_almacen TO anon USING (false) WITH CHECK (false);


--
-- Name: movimientos_almacen deny_anon; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_anon ON public.movimientos_almacen TO anon USING (false) WITH CHECK (false);


--
-- Name: notas_internas deny_anon; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_anon ON public.notas_internas TO anon USING (false) WITH CHECK (false);


--
-- Name: pagos deny_anon; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_anon ON public.pagos TO anon USING (false) WITH CHECK (false);


--
-- Name: picking_items deny_anon; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_anon ON public.picking_items TO anon USING (false) WITH CHECK (false);


--
-- Name: productos_guardados deny_anon; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_anon ON public.productos_guardados TO anon USING (false) WITH CHECK (false);


--
-- Name: repartidores deny_anon; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_anon ON public.repartidores TO anon USING (false) WITH CHECK (false);


--
-- Name: tags deny_anon; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_anon ON public.tags TO anon USING (false) WITH CHECK (false);


--
-- Name: tarifas deny_anon; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_anon ON public.tarifas TO anon USING (false) WITH CHECK (false);


--
-- Name: usuarios deny_anon; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_anon ON public.usuarios TO anon USING (false) WITH CHECK (false);


--
-- Name: notificaciones_log deny_anon_notif_log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_anon_notif_log ON public.notificaciones_log TO anon USING (false) WITH CHECK (false);


--
-- Name: api_keys deny_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_authenticated ON public.api_keys TO authenticated USING (false) WITH CHECK (false);


--
-- Name: auditoria_log deny_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_authenticated ON public.auditoria_log TO authenticated USING (false) WITH CHECK (false);


--
-- Name: clientes deny_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_authenticated ON public.clientes TO authenticated USING (false) WITH CHECK (false);


--
-- Name: configuracion deny_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_authenticated ON public.configuracion TO authenticated USING (false) WITH CHECK (false);


--
-- Name: envios deny_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_authenticated ON public.envios TO authenticated USING (false) WITH CHECK (false);


--
-- Name: eventos_envio deny_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_authenticated ON public.eventos_envio TO authenticated USING (false) WITH CHECK (false);


--
-- Name: intentos_contacto deny_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_authenticated ON public.intentos_contacto TO authenticated USING (false) WITH CHECK (false);


--
-- Name: inventario_almacen deny_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_authenticated ON public.inventario_almacen TO authenticated USING (false) WITH CHECK (false);


--
-- Name: movimientos_almacen deny_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_authenticated ON public.movimientos_almacen TO authenticated USING (false) WITH CHECK (false);


--
-- Name: notas_internas deny_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_authenticated ON public.notas_internas TO authenticated USING (false) WITH CHECK (false);


--
-- Name: pagos deny_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_authenticated ON public.pagos TO authenticated USING (false) WITH CHECK (false);


--
-- Name: picking_items deny_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_authenticated ON public.picking_items TO authenticated USING (false) WITH CHECK (false);


--
-- Name: productos_guardados deny_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_authenticated ON public.productos_guardados TO authenticated USING (false) WITH CHECK (false);


--
-- Name: repartidores deny_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_authenticated ON public.repartidores TO authenticated USING (false) WITH CHECK (false);


--
-- Name: tags deny_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_authenticated ON public.tags TO authenticated USING (false) WITH CHECK (false);


--
-- Name: tarifas deny_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_authenticated ON public.tarifas TO authenticated USING (false) WITH CHECK (false);


--
-- Name: usuarios deny_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_authenticated ON public.usuarios TO authenticated USING (false) WITH CHECK (false);


--
-- Name: notificaciones_log deny_authenticated_notif_log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_authenticated_notif_log ON public.notificaciones_log TO authenticated USING (false) WITH CHECK (false);


--
-- Name: departamentos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.departamentos ENABLE ROW LEVEL SECURITY;

--
-- Name: envios; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.envios ENABLE ROW LEVEL SECURITY;

--
-- Name: eventos_envio; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.eventos_envio ENABLE ROW LEVEL SECURITY;

--
-- Name: intentos_contacto; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.intentos_contacto ENABLE ROW LEVEL SECURITY;

--
-- Name: inventario_almacen; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inventario_almacen ENABLE ROW LEVEL SECURITY;

--
-- Name: liquidacion_ajustes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.liquidacion_ajustes ENABLE ROW LEVEL SECURITY;

--
-- Name: liquidacion_envios; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.liquidacion_envios ENABLE ROW LEVEL SECURITY;

--
-- Name: liquidaciones_repartidor; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.liquidaciones_repartidor ENABLE ROW LEVEL SECURITY;

--
-- Name: movimientos_almacen; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.movimientos_almacen ENABLE ROW LEVEL SECURITY;

--
-- Name: notas_internas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notas_internas ENABLE ROW LEVEL SECURITY;

--
-- Name: notificaciones_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notificaciones_log ENABLE ROW LEVEL SECURITY;

--
-- Name: pagos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pagos ENABLE ROW LEVEL SECURITY;

--
-- Name: picking_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.picking_items ENABLE ROW LEVEL SECURITY;

--
-- Name: productos_guardados; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.productos_guardados ENABLE ROW LEVEL SECURITY;

--
-- Name: repartidores; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.repartidores ENABLE ROW LEVEL SECURITY;

--
-- Name: system_locks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.system_locks ENABLE ROW LEVEL SECURITY;

--
-- Name: tags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;

--
-- Name: tarifas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tarifas ENABLE ROW LEVEL SECURITY;

--
-- Name: usuarios; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

\unrestrict rd4efFyKNHsniRUYc3PCBaHaOPvdypGL2JazaPnCiWibFr0gk5qelmVeiAE74cm


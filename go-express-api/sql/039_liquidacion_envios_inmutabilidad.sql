-- 039: Inmutabilidad a nivel DB del DETALLE de liquidaciones (liquidacion_envios).
-- 038 sello el HEADER (liquidaciones_repartidor). Este cierra el ultimo flanco del ALTA: el detalle
-- (donde viven monto_esperado, monto_cobrado y conciliado por envio) seguia siendo mutable por
-- UPDATE/DELETE ad-hoc mientras la liquidacion padre estaba sellada. Eso permitia mover plata o
-- des-conciliar un envio por fuera de reabrir_liquidacion, sin auditoria.
--
-- Regla (espeja a 038 pero con una excepcion que el detalle SI necesita): una liquidacion sellada
-- tiene cerrada_en IS NOT NULL en su header. Por eso:
--   - se BLOQUEA todo UPDATE/DELETE de una fila de detalle cuyo padre tiene cerrada_en IS NOT NULL,
--   - SALVO la transicion de sellado de cerrar_liquidacion (conciliado FALSE -> TRUE): cerrar
--     primero pone cerrada_en=NOW() en el header y DESPUES hace el blanket conciliado=TRUE sobre el
--     detalle; en ese instante el padre ya esta sellado pero el UPDATE es legitimo. Se reconoce por
--     OLD.conciliado=FALSE AND NEW.conciliado=TRUE y se PERMITE.
--   - se PERMITE todo cuando el padre tiene cerrada_en IS NULL (pendiente): cubre el des-conciliar
--     de reabrir_liquidacion (que pone cerrada_en=NULL en el header ANTES de tocar el detalle) y el
--     DELETE/UPSERT de cerrar_liquidacion (que corre con el padre todavia pendiente).
--
-- Por que la excepcion no es explotable: para colar una fila con conciliado=TRUE bajo un padre
-- sellado, un actor necesitaria primero dejarla en conciliado=FALSE bajo ese mismo padre sellado,
-- lo cual este trigger ya bloquea. Las filas de un padre sellado estan todas en conciliado=TRUE; la
-- unica forma de que OLD.conciliado=FALSE bajo padre sellado es dentro del propio cerrar_liquidacion
-- (la fila se inserto FALSE con el padre aun pendiente, en la misma tx). Camino cerrado.
--
-- Orden de disparo de triggers en cerrar_liquidacion: el blanket UPDATE conciliado=TRUE ocurre con
-- el header ya en cerrada_en=NOW() (mismo statement-order que el codigo de 036). Verificado contra
-- la definicion viva de cerrar_liquidacion (036, secciones 4.2). Idempotente. Rollback al final.

BEGIN;

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
  -- El header pendiente es la unica superficie de escritura legitima del detalle (cerrar arma el set
  -- con el padre pendiente; reabrir nula cerrada_en antes de des-conciliar).
  IF v_cerrada_en IS NULL THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  -- Padre sellado: unica mutacion permitida es la transicion de sellado de cerrar_liquidacion.
  IF TG_OP = 'UPDATE' AND OLD.conciliado = FALSE AND NEW.conciliado = TRUE THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'liquidacion_envios_inmutable: el detalle del envio % pertenece a la liquidacion sellada %; reabrila para corregir',
    CASE WHEN TG_OP = 'DELETE' THEN OLD.envio_id ELSE NEW.envio_id END, v_liq_id
    USING ERRCODE = 'P0001';
END;
$function$;

DROP TRIGGER IF EXISTS trg_liquidacion_envios_inmutable ON public.liquidacion_envios;
CREATE TRIGGER trg_liquidacion_envios_inmutable
  BEFORE UPDATE OR DELETE ON public.liquidacion_envios
  FOR EACH ROW EXECUTE FUNCTION public.trg_liquidacion_envios_inmutable_fn();

COMMIT;

-- ROLLBACK: DROP TRIGGER IF EXISTS trg_liquidacion_envios_inmutable ON public.liquidacion_envios;
--           DROP FUNCTION IF EXISTS public.trg_liquidacion_envios_inmutable_fn();

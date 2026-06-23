-- 042: cierra bloqueantes de la re-auditoria Step6 ronda final.
-- A1-A3 (re-parenting): el trigger del detalle solo chequeaba el padre NUEVO (NEW.liquidacion_id).
-- Un UPDATE que mueve una fila de una liquidacion CERRADA a una pendiente pasaba (NEW pendiente).
-- Fix: bloquear TODO cambio de liquidacion_id (ningun flujo legitimo re-parenta un detalle) y chequear
-- el padre VIEJO. Idempotente.
BEGIN;
CREATE OR REPLACE FUNCTION public.trg_liquidacion_envios_inmutable_fn()
 RETURNS trigger LANGUAGE plpgsql AS $function$
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
$function$;
COMMIT;

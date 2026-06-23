-- 044: A4. Un envio con pago COD pero repartidor_id NULL queda irreconciliable (crear_liquidacion
-- filtra por repartidor). En el modelo COD-only todo pago proviene de un cobro en campo => exige
-- repartidor asignado. Trigger BEFORE INSERT en pagos que lo enforza. 0 pagos en prod (no rompe data).
-- Gaston autorizo asumiendo el riesgo de flujos edge (walk-in/mostrador); el re-audit lo valida. Idempotente.
BEGIN;
CREATE OR REPLACE FUNCTION public.trg_pago_requiere_repartidor_fn()
 RETURNS trigger LANGUAGE plpgsql AS $function$
DECLARE v_rep uuid;
BEGIN
  SELECT repartidor_id INTO v_rep FROM public.envios WHERE id = NEW.envio_id;
  IF v_rep IS NULL THEN
    RAISE EXCEPTION 'pago_sin_repartidor: el envio % no tiene repartidor asignado; un cobro requiere repartidor para ser liquidable (A4)', NEW.envio_id
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS trg_pago_requiere_repartidor ON public.pagos;
CREATE TRIGGER trg_pago_requiere_repartidor
  BEFORE INSERT ON public.pagos
  FOR EACH ROW EXECUTE FUNCTION public.trg_pago_requiere_repartidor_fn();
COMMIT;
-- ROLLBACK: DROP TRIGGER IF EXISTS trg_pago_requiere_repartidor ON public.pagos; DROP FUNCTION IF EXISTS public.trg_pago_requiere_repartidor_fn();

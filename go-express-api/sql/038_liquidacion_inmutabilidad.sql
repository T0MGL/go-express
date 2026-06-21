-- 038: Inmutabilidad a nivel DB de liquidaciones cerradas (cierra el ALTA "el sello del cierre es violable").
-- Regla a prueba de reabrir: una liquidacion sellada tiene cerrada_en IS NOT NULL. reabrir_liquidacion la
-- transiciona a estado=pendiente con cerrada_en=NULL. Por eso:
--   - se BLOQUEA todo UPDATE que deje cerrada_en NOT NULL viniendo de NOT NULL (tampering en sello vivo)
--   - se PERMITE el UPDATE que pone cerrada_en=NULL (eso ES reabrir, transicion legitima y visible)
--   - se BLOQUEA todo DELETE de una liquidacion sellada
-- Header de la liquidacion (donde viven tarifa_retenida/payout_tienda/monto_total_*). El detalle
-- (liquidacion_envios) va en el pase re-auditado. Idempotente.

BEGIN;

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
  IF OLD.cerrada_en IS NOT NULL AND NEW.cerrada_en IS NOT NULL THEN
    RAISE EXCEPTION 'liquidacion_cerrada_inmutable: la liquidacion cerrada % solo se modifica via reabrir_liquidacion', OLD.id
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_liquidacion_inmutable ON public.liquidaciones_repartidor;
CREATE TRIGGER trg_liquidacion_inmutable
  BEFORE UPDATE OR DELETE ON public.liquidaciones_repartidor
  FOR EACH ROW EXECUTE FUNCTION public.trg_liquidacion_inmutable_fn();

COMMIT;

-- ROLLBACK: DROP TRIGGER IF EXISTS trg_liquidacion_inmutable ON public.liquidaciones_repartidor;
--           DROP FUNCTION IF EXISTS public.trg_liquidacion_inmutable_fn();

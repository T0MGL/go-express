-- 037: Hardening de invariantes del nucleo COD (parte aplicable y testeable de forma autonoma).
-- Cierra los ALTA: I1 solo enforzado en INSERT, y anticipado con monto_a_cobrar inflado (payout fantasma).
-- NO incluye la inmutabilidad de liquidaciones cerradas (Fix 3): esa interactua con reabrir_liquidacion
-- y va en el pase re-auditado. Con 0 liquidaciones en prod no hay exposicion dia 1.
-- Idempotente. Rollback al final.

BEGIN;

-- Fix 1 + Fix 2: I1 en INSERT y UPDATE, con igualdad exacta para anticipado (Opcion A: repartidor
-- cobra exactamente la tarifa, payout a la tienda = 0; cualquier exceso seria deuda fantasma a un tercero).
CREATE OR REPLACE FUNCTION public.trg_envio_i1_cubre_tarifa_fn()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
$function$;

DROP TRIGGER IF EXISTS trg_envio_i1_cubre_tarifa ON public.envios;
CREATE TRIGGER trg_envio_i1_cubre_tarifa
  BEFORE INSERT OR UPDATE OF monto_a_cobrar, costo, costo_seguro, tipo_pago ON public.envios
  FOR EACH ROW EXECUTE FUNCTION public.trg_envio_i1_cubre_tarifa_fn();

COMMIT;

-- ROLLBACK manual (revertir a I1 solo-INSERT, sin igualdad anticipado):
-- CREATE OR REPLACE FUNCTION public.trg_envio_i1_cubre_tarifa_fn() RETURNS trigger LANGUAGE plpgsql AS $f$
-- BEGIN IF NEW.monto_a_cobrar < NEW.costo + COALESCE(NEW.costo_seguro,0) THEN
--   RAISE EXCEPTION 'monto_a_cobrar_insuficiente' USING ERRCODE='P0001'; END IF; RETURN NEW; END; $f$;
-- DROP TRIGGER IF EXISTS trg_envio_i1_cubre_tarifa ON public.envios;
-- CREATE TRIGGER trg_envio_i1_cubre_tarifa BEFORE INSERT ON public.envios
--   FOR EACH ROW EXECUTE FUNCTION public.trg_envio_i1_cubre_tarifa_fn();

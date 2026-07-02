-- 050: M5 (Step6). I1 (monto_a_cobrar cubre la tarifa) vivia solo en el trigger
-- trg_envio_i1_cubre_tarifa (037), que es by-column: no protege filas pre-trigger ni un UPDATE
-- que no toque las columnas listadas. Prueba viva: GE2026001000 (contra_entrega entregado,
-- monto_a_cobrar=0 < costo 24000) viola I1 historicamente y es inliquidable: create_pago_atomico
-- computa monto 0 y el envio nunca entra a una liquidacion, GO EXPRESS no puede facturar su flete.
--
-- Fix:
--  1. CHECK declarativo de I1 a nivel tabla (NOT VALID primero para poder remediar el
--     historico). Exime eliminado=TRUE: la remediacion canonica de una fila historica
--     irreconciliable es ANULARLA (soft-delete), y puede haber otros soft-deleted que violen I1.
--  2. Remediacion de GE2026001000: ANULAR (decision de Gaston sobre el hallazgo M5: el cobro
--     fue 0, no hay efectivo de tercero, la perdida es el flete propio de GO EXPRESS, se asume
--     como subsidio y se anula el envio). Guard por tracking_number, idempotente (skip si ya
--     esta eliminado).
--  3. VALIDATE CONSTRAINT: si alguna otra fila viva viola I1, el VALIDATE falla y la migracion
--     entera aborta (wrapper BEGIN/COMMIT): ese caso requiere decision operativa, no silencio.
BEGIN;

DO $$
BEGIN
  ALTER TABLE public.envios
    ADD CONSTRAINT envios_i1_monto_cubre_tarifa CHECK (
      eliminado = TRUE
      OR (tipo_pago = 'anticipado'     AND monto_a_cobrar =  costo + costo_seguro)
      OR (tipo_pago = 'contra_entrega' AND monto_a_cobrar >= costo + costo_seguro)
    ) NOT VALID;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END;
$$;

-- Remediacion M5: GE2026001000 se anula. Sin pago activo ni liquidacion (verificado en prod:
-- 0 pagos, 0 liquidaciones), el soft-delete no toca plata de tercero.
DO $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.envios
     SET eliminado          = TRUE,
         eliminado_por      = '00000000-0000-4000-a000-000000000001',
         eliminado_en       = NOW(),
         motivo_eliminacion = 'Anulado por remediacion M5 (re-audit Step6 2026-06-23): monto_a_cobrar=0 viola I1 (costo 24000 sin cobertura), envio irreconciliable e inliquidable. Cobro real fue 0: la perdida es flete propio de GO EXPRESS, asumida como subsidio. Decision de Gaston, migracion 050.'
   WHERE tracking_number = 'GE2026001000'
     AND eliminado = FALSE
     AND monto_a_cobrar < costo + costo_seguro;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE '050: remediacion GE2026001000 aplicada a % fila(s) (0 = ya remediada o inexistente)', v_count;
END;
$$;

ALTER TABLE public.envios VALIDATE CONSTRAINT envios_i1_monto_cubre_tarifa;

COMMENT ON CONSTRAINT envios_i1_monto_cubre_tarifa ON public.envios IS
  'I1 declarativo (M5 Step6): todo envio vivo cubre la tarifa GO EXPRESS. anticipado exige igualdad exacta (el cobro en calle ES la tarifa), contra_entrega exige cobertura (el excedente es producto de la tienda). eliminado=TRUE queda exento: la remediacion de historico irreconciliable es anular. Complementa (no reemplaza) el trigger trg_envio_i1_cubre_tarifa, que da mensajes de error de negocio.';

COMMIT;
-- ROLLBACK: ALTER TABLE public.envios DROP CONSTRAINT envios_i1_monto_cubre_tarifa;
-- la anulacion de GE2026001000 se revierte solo con decision operativa explicita
-- (UPDATE envios SET eliminado=FALSE ... WHERE tracking_number='GE2026001000').

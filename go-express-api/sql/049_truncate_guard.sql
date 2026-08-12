-- 049: M4 (Step6). TRUNCATE saltea el sello de inmutabilidad: los triggers de 038/039/040/042
-- son BEFORE ... FOR EACH ROW y no disparan en TRUNCATE, y TRUNCATE estaba concedido a
-- anon/authenticated/service_role. Un TRUNCATE de liquidacion_envios vaciaba el detalle sellado
-- sin error ni traza (reproducido en el audit).
--
-- Fix en dos capas sobre las cuatro tablas del ledger financiero (liquidaciones_repartidor,
-- liquidacion_envios, pagos, envios):
--  1. REVOKE TRUNCATE a los roles de request (no hay mapeo PostgREST para TRUNCATE, ningun
--     path legitimo lo usa).
--  2. Trigger BEFORE TRUNCATE FOR EACH STATEMENT con RAISE EXCEPTION incondicional: ni siquiera
--     un rol privilegiado vacia un ledger financiero de un statement. Si un mantenimiento real
--     lo necesitara (no deberia), el DBA puede DROP TRIGGER explicitamente, que es la traza.
--
-- Idempotente (REVOKE idempotente, CREATE OR REPLACE + DROP IF EXISTS). Transaccional.
BEGIN;

REVOKE TRUNCATE ON public.liquidaciones_repartidor, public.liquidacion_envios, public.pagos, public.envios
  FROM anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.trg_ledger_no_truncate_fn()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION 'truncate_prohibido: % es parte del ledger financiero, TRUNCATE no esta permitido (M4 Step6)', TG_TABLE_NAME
    USING ERRCODE = 'P0001';
END;
$function$;

COMMENT ON FUNCTION public.trg_ledger_no_truncate_fn() IS
  'M4 Step6: TRUNCATE no dispara los triggers FOR EACH ROW del sello de inmutabilidad. Este guard STATEMENT-level lo rechaza incondicionalmente en las tablas del ledger (liquidaciones, detalle, pagos, envios).';

DROP TRIGGER IF EXISTS trg_no_truncate ON public.liquidaciones_repartidor;
CREATE TRIGGER trg_no_truncate
  BEFORE TRUNCATE ON public.liquidaciones_repartidor
  FOR EACH STATEMENT EXECUTE FUNCTION public.trg_ledger_no_truncate_fn();

DROP TRIGGER IF EXISTS trg_no_truncate ON public.liquidacion_envios;
CREATE TRIGGER trg_no_truncate
  BEFORE TRUNCATE ON public.liquidacion_envios
  FOR EACH STATEMENT EXECUTE FUNCTION public.trg_ledger_no_truncate_fn();

DROP TRIGGER IF EXISTS trg_no_truncate ON public.pagos;
CREATE TRIGGER trg_no_truncate
  BEFORE TRUNCATE ON public.pagos
  FOR EACH STATEMENT EXECUTE FUNCTION public.trg_ledger_no_truncate_fn();

DROP TRIGGER IF EXISTS trg_no_truncate ON public.envios;
CREATE TRIGGER trg_no_truncate
  BEFORE TRUNCATE ON public.envios
  FOR EACH STATEMENT EXECUTE FUNCTION public.trg_ledger_no_truncate_fn();

COMMIT;
-- ROLLBACK: DROP TRIGGER trg_no_truncate en las cuatro tablas, DROP FUNCTION
-- trg_ledger_no_truncate_fn(), y GRANT TRUNCATE ON ... TO anon, authenticated, service_role
-- (solo si de verdad se quiere volver al agujero).

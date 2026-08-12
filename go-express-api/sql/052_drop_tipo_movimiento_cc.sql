-- 052: B1/B2 (Step6). El enum tipo_movimiento_cc quedo como codigo muerto tras la remocion del
-- modelo de cuenta corriente (036: tabla movimientos_cuenta_corriente y RPCs CC dropeadas). Sin
-- dependientes vivos, se dropea para que el schema no anuncie un modelo que no existe.
--
-- El enum tipo_pago CONSERVA el label cuenta_corriente (dropear un valor de enum no es posible
-- sin recrear el tipo y sus dependencias); sigue neutralizado por el CHECK
-- envios_tipo_pago_no_cc, que se mantiene intacto.
--
-- Guard: si pg_depend registra cualquier dependiente real (columna, funcion, cast), la
-- migracion aborta en vez de dropear a ciegas. Idempotente (DROP IF EXISTS + skip si no existe).
BEGIN;

DO $$
DECLARE
  v_dep_count integer;
BEGIN
  IF to_regtype('public.tipo_movimiento_cc') IS NULL THEN
    RAISE NOTICE '052: tipo_movimiento_cc ya no existe, nada que hacer';
    RETURN;
  END IF;

  -- Dependientes reales del tipo (excluye las filas internas del propio tipo y su array).
  SELECT count(*) INTO v_dep_count
    FROM pg_depend d
   WHERE d.refobjid = 'public.tipo_movimiento_cc'::regtype
     AND d.deptype NOT IN ('i', 'a')
     AND d.classid <> 'pg_type'::regclass;

  IF v_dep_count > 0 THEN
    RAISE EXCEPTION '052: tipo_movimiento_cc tiene % dependiente(s) vivos, revisar pg_depend antes de dropear', v_dep_count;
  END IF;

  DROP TYPE public.tipo_movimiento_cc;
  RAISE NOTICE '052: tipo_movimiento_cc dropeado (cero dependientes)';
END;
$$;

COMMIT;
-- ROLLBACK: CREATE TYPE public.tipo_movimiento_cc AS ENUM
--   ('debito', 'credito', 'ajuste', 'nota_credito', 'reverso');

-- 055: quitar EXECUTE del rol publico sobre las funciones del schema public.
--
-- Postgres otorga EXECUTE a PUBLIC por defecto en toda funcion nueva. Con
-- PostgREST expuesto, eso vuelve invocable por HTTP cualquier funcion usando la
-- publishable key, que viaja en el bundle del frontend. Las RPC de pagos y
-- liquidaciones son SECURITY DEFINER: corren como el owner y saltean RLS, sin
-- validar quien llama. El resultado era que un anonimo podia registrar, editar
-- o anular pagos.
--
-- Se excluyen las funciones que pertenecen a una extension: revocarles EXECUTE
-- rompe defaults de columna como gen_random_uuid(), que se evaluan con los
-- privilegios de quien inserta.
--
-- El backend accede con service_role, que queda grantado explicitamente. El
-- frontend no invoca RPCs (no hay un solo .rpc() en src/), y ninguna funcion
-- aparece referenciada dentro de una policy RLS, donde un revoke romperia toda
-- escritura de la tabla.

DO $$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS firma
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d
        WHERE d.objid = p.oid AND d.deptype = 'e'
      )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn.firma);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn.firma);
  END LOOP;
END $$;

-- Las funciones que se creen de ahora en mas nacen sin EXECUTE para el publico.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO service_role;

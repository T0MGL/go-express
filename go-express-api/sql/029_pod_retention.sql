-- 029_pod_retention.sql
-- Soporte para la rutina de retencion de fotos POD (proof of delivery).
--
-- Politica: las fotos del bucket "pod-entregas" se conservan 30 dias desde su
-- creacion. Despues, la rutina diaria del API las borra del bucket via
-- supabase.storage.remove() y nullea envios.foto_entrega_url para los envios
-- afectados. La columna queda en null pero el envio mantiene el resto del POD
-- (entregado_por_nombre, fecha_entrega_real, monto_cobrado, etc), que es
-- evidencia legal suficiente.

-- 1) Indice parcial sobre storage.objects para acelerar el listado de objetos
--    viejos del bucket POD. Sin el, la rutina escanea storage.objects entera.
--    El bucket arranca vacio en produccion, no usamos CONCURRENTLY (no hace falta).
--
-- NOTA: storage.objects es propiedad de supabase_storage_admin. El rol postgres
-- no puede crear indexes ahi. Wrapeamos en DO block tolerante: si falla por
-- permisos, la migracion continua. A 100 envios/dia y retencion 30d el bucket
-- queda en ~3000 objetos, scan secuencial es sub-ms y no necesitas el index.
-- Si crece (multi-cliente sostenido), crear manualmente desde Supabase Dashboard
-- > Database > Indexes con rol elevado, o solicitar a soporte.
DO $migration$
BEGIN
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_storage_objects_pod_created_at
           ON storage.objects (created_at)
           WHERE bucket_id = ''pod-entregas''';
  EXECUTE 'COMMENT ON INDEX storage.idx_storage_objects_pod_created_at IS
           ''Acelera la rutina diaria de retencion 30d de fotos POD. Ver podCleanup.service.ts.''';
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Skip: index on storage.objects requires supabase_storage_admin. Create via Dashboard if bucket grows beyond 50k objects.';
  WHEN OTHERS THEN
    RAISE NOTICE 'Skip storage index: %', SQLERRM;
END
$migration$;

COMMENT ON COLUMN envios.foto_entrega_url IS
  'Path en bucket pod-entregas (formato envio_id/pod_TS.ext). Se borra a los 30 dias por politica de retencion. Cuando es NULL despues de fecha_entrega_real, la foto fue purgada por la rutina de cleanup.';

-- 2) Lock distribuido para jobs del API.
--
-- pg_advisory_lock es session-scope: con PostgREST/PgBouncer el lock se libera apenas
-- la conexion vuelve al pool, asi que entre dos llamadas RPC el lock no persiste y dos
-- instancias del API podrian correr el mismo job en paralelo. Implementamos lock por
-- fila con TTL: atomico via INSERT ON CONFLICT, auto-expiracion si el holder crashea.

CREATE TABLE IF NOT EXISTS public.system_locks (
  name        TEXT PRIMARY KEY,
  owner       TEXT NOT NULL,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL
);

COMMENT ON TABLE public.system_locks IS
  'Locks distribuidos por nombre, con TTL. Pensado para jobs del API que corren en multiples instancias (Railway). Se acquire/release via try_acquire_system_lock / release_system_lock.';
COMMENT ON COLUMN public.system_locks.owner IS
  'Identificador unico del holder (host:pid:uuid). Solo el owner puede release; la expiracion permite re-acquire si el holder crashea.';
COMMENT ON COLUMN public.system_locks.expires_at IS
  'Timestamp tras el cual cualquier instancia puede tomar el lock (failsafe contra crashes).';

ALTER TABLE public.system_locks ENABLE ROW LEVEL SECURITY;

-- Sin policies: PostgREST con RLS activo + cero policies bloquea anon y authenticated.
-- service_role bypassea RLS, que es exactamente quien debe acceder.

CREATE OR REPLACE FUNCTION public.try_acquire_system_lock(
  p_name        TEXT,
  p_owner       TEXT,
  p_ttl_seconds INTEGER
) RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
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

  -- Atomico: insertamos el lock si no existe; si existe pero expiro, lo tomamos.
  -- Si existe y no expiro, el WHERE del UPDATE rechaza el cambio.
  INSERT INTO public.system_locks (name, owner, acquired_at, expires_at)
  VALUES (p_name, p_owner, v_now, v_expires)
  ON CONFLICT (name) DO UPDATE
    SET owner       = EXCLUDED.owner,
        acquired_at = EXCLUDED.acquired_at,
        expires_at  = EXCLUDED.expires_at
    WHERE public.system_locks.expires_at < v_now;

  -- Verificamos quien quedo como holder. Solo nosotros si el lock es nuestro.
  SELECT owner INTO v_holder FROM public.system_locks WHERE name = p_name;
  RETURN v_holder = p_owner;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_system_lock(
  p_name  TEXT,
  p_owner TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
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

REVOKE ALL ON TABLE public.system_locks FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.try_acquire_system_lock(TEXT, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_system_lock(TEXT, TEXT) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.try_acquire_system_lock(TEXT, TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_system_lock(TEXT, TEXT) TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.system_locks TO service_role;

COMMENT ON FUNCTION public.try_acquire_system_lock(TEXT, TEXT, INTEGER) IS
  'Toma un lock distribuido por nombre con TTL en segundos. Retorna true si lo tomo, false si otro holder lo tiene vigente.';
COMMENT ON FUNCTION public.release_system_lock(TEXT, TEXT) IS
  'Libera un lock distribuido. Solo el owner puede liberar (idempotente: retorna false si ya estaba liberado o expiro).';

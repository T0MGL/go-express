#!/usr/bin/env bash
# Reset deterministico del Postgres del stack Supabase LOCAL de test.
# Replay: 000_baseline_prod_schema.sql (schema vivo de prod post-045) + migraciones 046+ en
# orden + grants estilo Supabase (el baseline se dumpea sin ACLs) + seed minimo.
# Procedimiento completo desde cero: docs/test-db-local.md
set -euo pipefail

DB_URL="${TEST_DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
case "$DB_URL" in
  *127.0.0.1*|*localhost*) ;;
  *) echo "test-db-reset: TEST_DATABASE_URL no es local, abortando" >&2; exit 1 ;;
esac

HERE="$(cd "$(dirname "$0")/.." && pwd)"
run() { psql "$DB_URL" -v ON_ERROR_STOP=1 -q "$@"; }

echo "test-db-reset: replay de baseline + migraciones sobre $DB_URL"

run -c 'DROP SCHEMA IF EXISTS public CASCADE;'
run -c 'DROP EXTENSION IF EXISTS pg_trgm CASCADE;'
run -c 'CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;'
run -c 'CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;'
run -c 'CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;'

# pg_trgm vive en el schema public en prod (el baseline referencia public.gin_trgm_ops), asi
# que se instala ahi apenas el baseline crea el schema.
sed '/^CREATE SCHEMA public;$/a\
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;
' "$HERE/sql/000_baseline_prod_schema.sql" | run -f -

# Grants que Supabase aplica por default y que el dump del baseline no trae (se dumpeo con
# --no-owner/--no-acl). Van ANTES de las migraciones 047/049/051, que revocan sobre esta base
# exactamente igual que en prod.
run <<'SQL'
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
SQL

# El baseline se dumpea solo con schema, sin datos, asi que el catalogo de 18 departamentos
# y 263 distritos no llega. Los tests de ciudades, cotizador y envios lo dan por hecho.
# 027 es idempotente (CREATE TABLE IF NOT EXISTS + INSERT ON CONFLICT), se puede replayear.
echo "  aplicando 027_ciudades_catalog.sql (catalogo)"
run -f "$HERE/sql/027_ciudades_catalog.sql"

# Migraciones posteriores al baseline, en orden estricto. Se listan por numero en vez de
# enumerarlas a mano: una migracion nueva entraba en prod y el schema de test se quedaba
# atras hasta que alguien se acordaba de sumar el glob.
for f in $(ls "$HERE"/sql/[0-9][0-9][0-9]_*.sql | sort); do
  n=$(basename "$f" | cut -c1-3)
  [ "$n" -ge 046 ] || continue
  echo "  aplicando $(basename "$f")"
  run -f "$f"
done

# Seed minimo espejo de prod: usuario SISTEMA (FK de auditoria/seeds), seguro_config vivo,
# tarifa Asuncion -> Ciudad del Este. Los tests siembran el resto (cliente, repartidor,
# tarifa Asuncion -> Encarnacion) via tests/setup/seed.ts.
run <<'SQL'
INSERT INTO public.usuarios (id, nombre, email, rol, estado)
VALUES ('00000000-0000-4000-a000-000000000001', 'Admin GoExpress', 'admin@goexpress.com.py', 'admin', 'activo')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.configuracion (key, value)
VALUES ('seguro_config', '{"tasaAdicional":0.1,"umbralIncluido":200000,"minimoAdicional":5000,"maximoAsegurable":50000000}'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- generate_tracking_number() lee estos keys; sin ellos devuelve NULL y todo INSERT de
-- envios revienta contra el NOT NULL de tracking_number. Espejo de prod (GE + anio).
INSERT INTO public.configuracion (key, value)
VALUES ('tracking_prefix', '"GE"'::jsonb), ('tracking_year', '"2026"'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

INSERT INTO public.tarifas (origen, destino, tipo_servicio, precio_base, peso_base, precio_por_kg_extra, factor_dimensional, activo, eliminado, creado_por)
SELECT 'Asunción', 'Ciudad del Este', 'estandar', 30000, 3, 5000, 5000, TRUE, FALSE, '00000000-0000-4000-a000-000000000001'
WHERE NOT EXISTS (
  SELECT 1 FROM public.tarifas
   WHERE public.tarifa_norm_ciudad(origen) = 'asuncion'
     AND public.tarifa_norm_ciudad(destino) = 'ciudad del este'
     AND tipo_servicio = 'estandar' AND activo = TRUE AND eliminado = FALSE
);

NOTIFY pgrst, 'reload schema';
SQL

echo "test-db-reset: OK"

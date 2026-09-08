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
# tarifa Asuncion -> Ciudad del Este, cliente mostrador y bucket pod-entregas. Los tests siembran el resto (cliente, repartidor,
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

-- La ruta se identifica por el par de ids de ciudad (057). origen/destino los pone el trigger.
INSERT INTO public.tarifas (
  origen, destino, origen_ciudad_id, destino_ciudad_id, tipo_servicio,
  precio_base, peso_base, precio_por_kg_extra, factor_dimensional, activo, eliminado, creado_por
)
SELECT co.nombre, cd.nombre, co.id, cd.id, 'estandar',
       30000, 3, 5000, 5000, TRUE, FALSE, '00000000-0000-4000-a000-000000000001'
  FROM public.ciudades co, public.ciudades cd
 WHERE public.norm_ciudad(co.nombre) = 'asuncion'
   AND public.norm_ciudad(cd.nombre) = 'ciudad del este'
ON CONFLICT DO NOTHING;

-- Cliente mostrador (026) y bucket de comprobantes (015): los sembraron migraciones
-- anteriores al baseline, y el baseline es un dump de schema sin filas. En prod estan; sin
-- esto la instancia de test miente sobre el estado de produccion y los tests de walk-in y de
-- limpieza de POD fallan por drift, no por codigo.
INSERT INTO public.clientes (
  razon_social, ruc, contacto_nombre, telefono, email, ciudad, estado, plan, es_mostrador, notas
) VALUES (
  'Mostrador', 'MOSTRADOR-SIN-RUC', 'Cliente sin cuenta', '+595000000000',
  'mostrador@goexpress.local', 'Asunción', 'activo', 'basico', TRUE,
  'Cliente sentinela para envios walk-in. No editar ni eliminar.'
)
ON CONFLICT DO NOTHING;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('pod-entregas', 'pod-entregas', FALSE, 2097152, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types,
  public = FALSE;

NOTIFY pgrst, 'reload schema';
SQL

echo "test-db-reset: OK"

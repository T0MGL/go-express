# Test DB local (stack Supabase via CLI)

`npm test` (Vitest + Supertest + supabase-js) necesita un stack Supabase completo, no un
Postgres pelado: los services usan PostgREST (`.from()`/`.rpc()`) y el flujo de auth valida
JWT contra GoTrue. El guard `tests/setup/guardNotProd.ts` + `scripts/run-tests.mjs` bloquean
cualquier corrida contra prod: sin `TEST_DATABASE_URL`/`TEST_SUPABASE_URL` no-prod, la suite
se salta entera.

## Levantar desde cero (macOS, sin Docker Desktop)

```bash
# 1. Runtime de contenedores (una sola vez)
brew install colima docker
colima start --cpu 4 --memory 8

# 2. Stack Supabase local (desde go-express-api/; el proyecto ya esta inicializado en supabase/)
supabase start
# Anotar del output: API URL (http://127.0.0.1:54321), DB URL (puerto 54322),
# anon key y service_role key del stack local.

# 3. Schema + migraciones + seed minimo (deterministico, re-ejecutable)
#    Replay: sql/000_baseline_prod_schema.sql (prod post-045) + sql/046_*.sql en adelante,
#    grants estilo Supabase, seed de usuario SISTEMA + seguro_config + tarifa espejo de prod.
bash scripts/test-db-reset.sh

# 4. Variables en go-express-api/.env (valores reales JAMAS commiteados; placeholders en
#    .env.example)
#    TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
#    TEST_SUPABASE_URL=http://127.0.0.1:54321
#    TEST_SUPABASE_SERVICE_ROLE_KEY=<service_role key del paso 2>
#    TEST_SUPABASE_ANON_KEY=<anon key del paso 2>

# 5. Correr
npm test
INVARIANT_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npm run test:invariants
```

## Notas

- `scripts/test-db-reset.sh` es idempotente y destructivo SOLO sobre el schema `public` del
  Postgres local (aborta si `TEST_DATABASE_URL` no apunta a localhost). Correrlo de nuevo
  deja la DB en el estado canonico: baseline prod + migraciones nuevas + seed minimo.
- La suite de invariantes (`npm run test:invariants`) corre todo dentro de
  `BEGIN ... ROLLBACK` via `INVARIANT_DATABASE_URL`. Contra prod usar UNICAMENTE el pooler
  session (`aws-1-us-east-1.pooler.supabase.com:5432`), jamas el transaction pooler (6543):
  los guards por GUC (`app.pago_rpc`, `app.reabrir_rpc`) dependen de semantica de sesion.
- Los tests de las migraciones 046-052 dentro de la suite de invariantes se auto-skipean
  (con nota) cuando el schema no las tiene aplicadas, asi la misma suite corre contra prod
  antes del deploy de las migraciones sin falsos rojos.
- Seed y config que los asserts asumen: `seguro_config` espejo de prod (tasa 0.1, umbral
  200000), tarifa Asunción -> Ciudad del Este (30000 Gs, peso base 3), y `tracking_prefix`
  ("GE") + `tracking_year` ("2026") en configuracion, sin los cuales
  `generate_tracking_number()` devuelve NULL y todo INSERT de envios revienta. Si cambian
  en prod, actualizar `scripts/test-db-reset.sh` y `tests/setup/seed.ts`.

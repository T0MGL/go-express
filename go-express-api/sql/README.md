# GO EXPRESS API: SQL

## Source of truth

`000_baseline_prod_schema.sql` is the canonical baseline. It reflects the live
production schema (Supabase Postgres 17.6) as of 2026-06-17 and is the source of
truth for the current state of the database: 23 tables, 23 enums, 20 business
functions (non-extension; a raw `pg_proc` count of public returns ~243 once
pg_trgm/unaccent/btree_gist functions are included), 17 triggers, 36 RLS policies,
the gist EXCLUDE constraint on `liquidaciones_repartidor`, and every index and
foreign key.

The baseline was materialized from a read-only `pg_dump --schema-only` of the prod
public schema, then verified object-by-object against a live introspection of prod
on a clean PG17 cluster (tables, enums, function identity arguments, triggers,
policies, the EXCLUDE constraintdef, indexes, and column definitions all match).

It applies cleanly on a vanilla PG17 cluster. A short preamble reconstructs the
environment Supabase provides implicitly (extensions in their prod schemas:
`uuid-ossp` and `pgcrypto` in `extensions`, `btree_gist`/`pg_trgm`/`unaccent` in
`public`; the `anon` and `authenticated` roles targeted by the RLS policies; and a
minimal `auth.users` so the `repartidores.auth_id` foreign key resolves). The
preamble does not alter the functional public schema.

## History

`001_schema.sql` through `033_ledger_money_core.sql` are kept as historical record
of how the schema evolved. They are NOT the source of truth and may have diverged
from what was actually applied to prod (some objects were created or altered
directly in prod outside the migration chain). Do not audit against them; audit
against the baseline.

`033_repro_prod_begin_rollback.sql` is a throwaway repro/rollback harness, not a
real migration.

## Going forward

Every future migration starts from `000_baseline_prod_schema.sql`. Number new
migrations `034_...` onward. Re-materialize the baseline from prod whenever it
drifts, and re-run the fidelity check before trusting it.

-- ================================================================
-- GO EXPRESS -- Migration 002: Auth-aware RLS policies
-- Applied after Supabase Auth integration is live.
--
-- Previous state: all tables deny anon + authenticated; only
-- service_role (used by backend) can access data.
--
-- This migration adds authenticated-user read policies for tables
-- that the admin panel accesses via Supabase Auth JWTs. The backend
-- still uses service_role for all writes. These policies allow the
-- supabase.auth.getUser() call in adminAuth middleware to work
-- (it uses the user's JWT, not service_role).
--
-- Client portal: clientes can read their own data via auth_id match.
-- ================================================================

-- NOTE: service_role bypasses RLS entirely, so backend writes are unaffected.
-- These policies ONLY apply when the Supabase client uses anon/authenticated keys.

-- Since the backend still uses service_role for ALL data access, and the
-- frontend only talks to the backend (not directly to Supabase), the current
-- deny-all RLS policies are correct. No changes needed.

-- If in the future the frontend queries Supabase directly, add policies like:
--   CREATE POLICY "cliente_read_own" ON clientes
--     FOR SELECT TO authenticated
--     USING (auth_id = auth.uid());
--
--   CREATE POLICY "cliente_read_own_envios" ON envios
--     FOR SELECT TO authenticated
--     USING (cliente_id IN (
--       SELECT id FROM clientes WHERE auth_id = auth.uid()
--     ));

-- For now, this migration documents the architecture decision:
-- All data flows through the Express API using service_role.
-- No direct Supabase client queries from the frontend.

-- Link admin auth user to usuarios table (idempotent)
UPDATE usuarios
SET auth_id = '652110eb-670c-4613-8b2d-7a8882992346'
WHERE id = '00000000-0000-4000-a000-000000000001'
  AND auth_id IS NULL;

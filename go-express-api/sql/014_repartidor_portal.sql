-- 014_repartidor_portal.sql
-- Extend repartidores table for portal auth (Supabase Auth + email invite flow).

alter table repartidores
  add column if not exists auth_id uuid unique references auth.users(id) on delete set null,
  add column if not exists email text,
  add column if not exists portal_status text not null default 'no_invitado',
  add column if not exists portal_invited_at timestamptz;

create index if not exists idx_repartidores_auth_id on repartidores (auth_id);
create unique index if not exists idx_repartidores_email_lower
  on repartidores (lower(email))
  where email is not null and eliminado = false;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'repartidores_portal_status_check'
  ) then
    alter table repartidores
      add constraint repartidores_portal_status_check
      check (portal_status in ('no_invitado', 'invitado', 'activo'));
  end if;
end$$;

comment on column repartidores.auth_id is 'Supabase Auth user id for portal login. Null if not yet invited.';
comment on column repartidores.portal_status is 'no_invitado | invitado | activo. Drives invite button state in admin UI.';

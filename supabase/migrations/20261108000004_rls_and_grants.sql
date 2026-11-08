-- Konveko MVP: access control
-- Model:
--   * anon: no access at all.
--   * authenticated + active app_user: read production data.
--   * admin: write master data directly (RLS policies below).
--   * production writes (batch, bundle, movement, stock, discrepancy, audit):
--     ONLY through the app.* functions. No direct INSERT/UPDATE/DELETE grants.

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------
alter table public.product_variant  enable row level security;
alter table public.fabric_roll      enable row level security;
alter table public.holder           enable row level security;
alter table public.app_user         enable row level security;
alter table public.reason           enable row level security;
alter table public.production_batch enable row level security;
alter table public.bundle           enable row level security;
alter table public.movement         enable row level security;
alter table public.stock_ledger     enable row level security;
alter table public.discrepancy      enable row level security;
alter table public.audit_log        enable row level security;

create function app.is_active_user()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.app_user where id = (select auth.uid()) and is_active);
$$;

-- ---------------------------------------------------------------------------
-- Grants (explicit; do not rely on Supabase default privileges)
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon;
revoke all on all functions in schema app from public, anon;
revoke all on schema app from public, anon;

grant usage on schema app to authenticated;
grant execute on all functions in schema app to authenticated;
grant execute on all functions in schema public to authenticated;

grant select on all tables in schema public to authenticated;   -- includes views
grant insert, update on public.product_variant, public.fabric_roll, public.holder,
                        public.app_user, public.reason to authenticated;

-- ---------------------------------------------------------------------------
-- Read policies
-- ---------------------------------------------------------------------------
create policy "staff read" on public.product_variant  for select to authenticated using ((select app.is_active_user()));
create policy "staff read" on public.fabric_roll      for select to authenticated using ((select app.is_active_user()));
create policy "staff read" on public.holder           for select to authenticated using ((select app.is_active_user()));
create policy "staff read" on public.reason           for select to authenticated using ((select app.is_active_user()));
create policy "staff read" on public.production_batch for select to authenticated using ((select app.is_active_user()));
create policy "staff read" on public.bundle           for select to authenticated using ((select app.is_active_user()));
create policy "staff read" on public.movement         for select to authenticated using ((select app.is_active_user()));
create policy "staff read" on public.stock_ledger     for select to authenticated using ((select app.is_active_user()));
create policy "staff read" on public.discrepancy      for select to authenticated using ((select app.is_active_user()));

create policy "self or admin/supervisor read" on public.app_user
  for select to authenticated
  using (
    id = (select auth.uid())
    or (select app.has_role('admin'))
    or (select app.has_role('supervisor'))
  );

create policy "admin/supervisor read" on public.audit_log
  for select to authenticated
  using ((select app.has_role('admin')) or (select app.has_role('supervisor')));

-- ---------------------------------------------------------------------------
-- Admin writes on master data (FR-01..FR-04a). No deletes: deactivate instead.
-- ---------------------------------------------------------------------------
create policy "admin insert" on public.product_variant for insert to authenticated with check ((select app.has_role('admin')));
create policy "admin update" on public.product_variant for update to authenticated using ((select app.has_role('admin'))) with check ((select app.has_role('admin')));

create policy "admin insert" on public.fabric_roll for insert to authenticated with check ((select app.has_role('admin')));
create policy "admin update" on public.fabric_roll for update to authenticated using ((select app.has_role('admin'))) with check ((select app.has_role('admin')));

create policy "admin insert" on public.holder for insert to authenticated with check ((select app.has_role('admin')));
create policy "admin update" on public.holder for update to authenticated using ((select app.has_role('admin'))) with check ((select app.has_role('admin')));

create policy "admin insert" on public.reason for insert to authenticated with check ((select app.has_role('admin')));
create policy "admin update" on public.reason for update to authenticated using ((select app.has_role('admin'))) with check ((select app.has_role('admin')));

create policy "admin insert" on public.app_user for insert to authenticated with check ((select app.has_role('admin')));
create policy "admin update" on public.app_user for update to authenticated using ((select app.has_role('admin'))) with check ((select app.has_role('admin')));

-- Future tables/functions: do not inherit the Supabase default grants silently.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on functions from public, anon, authenticated;
alter default privileges in schema app revoke all on functions from public, anon, authenticated;

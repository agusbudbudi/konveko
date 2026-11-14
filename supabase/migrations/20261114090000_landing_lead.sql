-- Landing page contact form: a visitor leaves a name and WhatsApp number instead of opening WhatsApp.
-- Written by the server only (service_role, from app/actions/lead.ts). Nobody signed in to the app
-- can read or write it; read the rows in the Supabase table editor.
--
-- Abuse limits live here because serverless instances do not share memory:
--   * the same phone number within 24 hours is accepted but not stored twice
--   * more than 5 submissions per IP per hour are refused

create table public.landing_lead (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 2 and 80),
  phone       text not null check (phone ~ '^628\d{7,11}$'),
  team_size   text check (team_size in ('1-10', '11-30', '31-100', '100+')),
  ip_hash     text,                          -- md5 of the client IP, for the rate limit only
  created_at  timestamptz not null default now()
);
create index landing_lead_created_idx on public.landing_lead (created_at desc);
create index landing_lead_ip_idx on public.landing_lead (ip_hash, created_at desc);

alter table public.landing_lead enable row level security;   -- no policies: service_role only

-- Returns 'ok', 'duplicate' (same phone in the last 24 hours, nothing stored) or 'rate_limited'.
create function public.landing_lead_submit(p_name text, p_phone text, p_team_size text, p_ip text)
returns text
language plpgsql security invoker set search_path = ''
as $$
declare
  v_ip text := case when coalesce(p_ip, '') in ('', 'unknown') then null else md5(p_ip) end;
begin
  if exists (select 1 from public.landing_lead where phone = p_phone and created_at > now() - interval '24 hours') then
    return 'duplicate';
  end if;
  if v_ip is not null
     and (select count(*) from public.landing_lead where ip_hash = v_ip and created_at > now() - interval '1 hour') >= 5 then
    return 'rate_limited';
  end if;
  insert into public.landing_lead (name, phone, team_size, ip_hash)
  values (btrim(p_name), p_phone, p_team_size, v_ip);
  return 'ok';
end $$;

revoke all on table public.landing_lead from public, anon, authenticated;
revoke all on function public.landing_lead_submit(text, text, text, text) from public, anon, authenticated;
grant select, insert on table public.landing_lead to service_role;
grant execute on function public.landing_lead_submit(text, text, text, text) to service_role;

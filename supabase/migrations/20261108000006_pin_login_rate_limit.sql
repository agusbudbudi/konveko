-- Konveko MVP: rate limit + lockout for phone + PIN login.
-- A 6-digit PIN has only 1,000,000 combinations, so attempts are limited per
-- phone number and per client IP. State lives in the database because
-- serverless instances do not share memory.
-- Only the server (service_role) may call these functions.

create table app.login_attempt (
  key             text primary key,          -- 'phone:62812...' or 'ip:1.2.3.4'
  failed_count    integer not null default 0,
  window_started  timestamptz not null default now(),
  locked_until    timestamptz
);

-- Policy: per phone 5 failures / 15 min -> locked 15 min.
--         per IP   20 failures / 15 min -> locked 15 min.
create function app.login_limit(p_key text)
returns integer
language sql immutable set search_path = ''
as $$ select case when p_key like 'ip:%' then 20 else 5 end $$;

-- Returns the lock expiry if any key is locked, else null.
create function app.pin_login_check(p_keys text[])
returns timestamptz
language sql stable security definer set search_path = ''
as $$
  select max(locked_until)
  from app.login_attempt
  where key = any (p_keys) and locked_until > now();
$$;

create function app.pin_login_record(p_keys text[], p_success boolean)
returns timestamptz
language plpgsql security definer set search_path = ''
as $$
declare
  k text;
  v_locked timestamptz;
begin
  foreach k in array p_keys loop
    if p_success and k like 'phone:%' then
      delete from app.login_attempt where key = k;
    elsif not p_success then
      insert into app.login_attempt as a (key, failed_count, window_started)
      values (k, 1, now())
      on conflict (key) do update
      set failed_count = case when a.window_started < now() - interval '15 minutes'
                              then 1 else a.failed_count + 1 end,
          window_started = case when a.window_started < now() - interval '15 minutes'
                                then now() else a.window_started end;
      update app.login_attempt
      set locked_until = now() + interval '15 minutes'
      where key = k and failed_count >= app.login_limit(k)
        and (locked_until is null or locked_until < now());
    end if;
  end loop;
  return app.pin_login_check(p_keys);
end $$;

create function public.pin_login_check(p_keys text[])
returns timestamptz language sql stable security invoker set search_path = ''
as $$ select app.pin_login_check(p_keys) $$;

create function public.pin_login_record(p_keys text[], p_success boolean)
returns timestamptz language sql security invoker set search_path = ''
as $$ select app.pin_login_record(p_keys, p_success) $$;

revoke all on table app.login_attempt from public, anon, authenticated;
revoke all on function app.login_limit(text), app.pin_login_check(text[]), app.pin_login_record(text[], boolean),
                       public.pin_login_check(text[]), public.pin_login_record(text[], boolean)
  from public, anon, authenticated;
grant usage on schema app to service_role;
grant execute on function app.login_limit(text), app.pin_login_check(text[]), app.pin_login_record(text[], boolean),
                          public.pin_login_check(text[]), public.pin_login_record(text[], boolean)
  to service_role;

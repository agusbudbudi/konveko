-- FR-23: scan history shows who scanned. app_user RLS only lets admin and
-- supervisor read other users (phone and email are personal data), so expose
-- just id + name to active staff through a narrow function.

create function app.staff_names(p_ids uuid[])
returns table (id uuid, name text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not app.is_active_user() then
    raise exception 'Sesi tidak valid. Silakan login ulang.' using detail = 'unauthenticated';
  end if;
  return query
    select u.id, u.name from public.app_user u where u.id = any (p_ids);
end $$;

create function public.staff_names(p_ids uuid[])
returns table (id uuid, name text)
language sql stable security invoker set search_path = ''
as $$ select * from app.staff_names(p_ids) $$;

revoke all on function app.staff_names(uuid[]), public.staff_names(uuid[]) from public, anon;
grant execute on function app.staff_names(uuid[]), public.staff_names(uuid[]) to authenticated;

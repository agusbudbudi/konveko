-- A piece that left the warehouse (status 'keluar') can have its label reprinted, e.g. when
-- a store asks for a new one. The QR token stays the same, so the new label replaces the old
-- one. The reprint is logged like any other ('cetak' event, print_count + 1).
-- Cancelled pieces ('batal') stay unprintable: their label is void.

create or replace function app.mark_printed(p_piece_ids uuid[])
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  u public.app_user := app.current_app_user();
  v_n integer;
begin
  perform app.require_any_role(u, array['finishing', 'supervisor', 'admin']::public.app_role[], 'mencetak label pcs');
  with upd as (
    update public.piece
    set printed_at = coalesce(printed_at, now()), print_count = print_count + 1
    where id = any (p_piece_ids) and status in ('aktif', 'keluar')
    returning id, print_count
  ), ev as (
    insert into public.piece_event (piece_id, type, note, created_by)
    select id, 'cetak', case when print_count > 1 then 'Cetak ulang' end, u.id from upd
  )
  select count(*) into v_n from upd;
  return v_n;
end $$;

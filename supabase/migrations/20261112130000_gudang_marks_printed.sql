-- Stok opname: stok awal pcs are labelled by the warehouse staff who counted them, so the
-- gudang role may now mark piece labels as printed (finishing, supervisor and admin already could).
-- Same function as 20261111160000 otherwise.

create or replace function app.mark_printed(p_piece_ids uuid[])
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  u public.app_user := app.current_app_user();
  v_n integer;
begin
  perform app.require_any_role(u, array['finishing', 'gudang', 'supervisor', 'admin']::public.app_role[], 'mencetak label pcs');
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

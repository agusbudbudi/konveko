-- Fase 2: reject and rework (doc/PRD Fase 2 - Reject dan rework.md).
--
-- Every reject already is a piece (grade 'reject', from finish_sew or finish_finishing),
-- and a damaged return is a piece with condition 'rusak'. A supervisor or admin sends
-- such pieces to rework with create_rework(codes, start_step, note):
--   * pieces are grouped per origin bundle and source; each group becomes one rework
--     bundle, a child of the origin bundle (rework_of_bundle_id), same batch and variant
--   * source 'jahit'     = reject from finish_sew        -> always starts at jahit
--     source 'finishing' = reject from finish_finishing  -> starts at jahit or finishing
--     source 'retur'     = good grade, condition rusak   -> starts at jahit or finishing
--   * the old pieces get status 'rework' and leave their rack; the rework bundle runs the
--     normal scan flow, and its finishing scan creates new pieces with new labels
--   * cancel_rework(code, note) undoes a rework bundle that was never scanned
--
-- Reconciliation (per origin bundle B, rework children R):
--   reject(B) = reject recorded on B - B's reject pieces now in rework   (net)
--   target(B) = ready + reject + wip + selisih of B and of its 'jahit'/'finishing' children
-- A rework bundle's target_qty is never added to the batch target. 'retur' rework bundles
-- are outside production reconciliation (their pieces were counted as ready long ago):
-- not in batch numbers, not in batch status, and no stock_ledger rows.
--
-- Invariants (tested):
--   per bundle: reject (net) = 'reject' pieces with status aktif or keluar
--   per bundle: reject_awal  = 'reject' pieces with status aktif, keluar or rework
--   per batch:  target = ready + reject + wip + selisih (over active non-retur bundles)

-- ---------------------------------------------------------------------------
-- Types, columns, tables
-- ---------------------------------------------------------------------------
create type public.rework_source as enum ('jahit', 'finishing', 'retur');
create type public.rework_step as enum ('jahit', 'finishing');

alter table public.bundle
  add column rework_of_bundle_id uuid references public.bundle (id),
  add column rework_source       public.rework_source,
  add column start_step          public.rework_step not null default 'jahit',
  add column rework_note         text,
  add column rework_by           uuid references public.app_user (id),
  add column cancelled_at        timestamptz,
  add column cancelled_by        uuid references public.app_user (id),
  add column cancel_note         text,
  add constraint bundle_rework_shape check (
    (rework_of_bundle_id is null) = (rework_source is null)
    and (rework_source is not null or start_step = 'jahit')
    and (rework_source is distinct from 'jahit' or start_step = 'jahit')
    and (cancelled_at is null or rework_of_bundle_id is not null)
  );
create index bundle_rework_of_idx on public.bundle (rework_of_bundle_id) where rework_of_bundle_id is not null;

-- Which pieces went into which rework bundle, and the rack they came from
-- (so a cancelled rework puts them back).
create table public.bundle_rework_piece (
  bundle_id         uuid not null references public.bundle (id),
  piece_id          uuid not null references public.piece (id),
  from_location_id  uuid references public.location (id),
  primary key (bundle_id, piece_id)
);
create index bundle_rework_piece_piece_idx on public.bundle_rework_piece (piece_id);

alter table public.movement drop constraint movement_shape;
alter table public.movement add constraint movement_shape check (
  case
    when type in ('cut', 'split', 'rework') then
      qty_sent is not null and qty_received is null and qty_good is null and qty_reject is null
    when type in ('receive_sew', 'receive_finishing') then
      qty_sent is not null and qty_received is not null and qty_received <= qty_sent
      and qty_good is null and qty_reject is null
    when type in ('finish_sew', 'finish_finishing') then
      qty_received is not null and qty_good is not null and qty_reject is not null
      and qty_good + qty_reject = qty_received
    when type = 'correction' then
      corrects_movement_id is not null and (note is not null and length(trim(note)) > 0)
    else false
  end
);

-- ---------------------------------------------------------------------------
-- Derived state
-- ---------------------------------------------------------------------------
-- Same columns as before, plus reject_awal, reworked, rework_of_bundle_id, rework_source.
-- `reject` is now net of the pieces sent to rework.
create or replace view public.bundle_reconciliation
with (security_invoker = true) as
with steps as (
  select
    em.bundle_id,
    max(em.qty_sent)     filter (where em.type = 'receive_sew')       as rs_sent,
    max(em.qty_received) filter (where em.type = 'receive_sew')       as rs_received,
    max(em.qty_good)     filter (where em.type = 'finish_sew')        as fs_good,
    max(em.qty_reject)   filter (where em.type = 'finish_sew')        as fs_reject,
    max(em.qty_sent)     filter (where em.type = 'receive_finishing') as rf_sent,
    max(em.qty_received) filter (where em.type = 'receive_finishing') as rf_received,
    max(em.qty_good)     filter (where em.type = 'finish_finishing')  as ff_good,
    max(em.qty_reject)   filter (where em.type = 'finish_finishing')  as ff_reject,
    max(em.scanned_at)                                                as last_movement_at
  from public.effective_movement em
  group by em.bundle_id
),
reworked as (
  select p.bundle_id, count(*)::int as qty
  from public.piece p
  where p.status = 'rework' and p.grade = 'reject'
  group by p.bundle_id
),
derived as (
  select
    b.id as bundle_id,
    b.code,
    b.batch_id,
    b.variant_id,
    b.target_qty,
    b.rework_of_bundle_id,
    b.rework_source,
    s.rs_sent, s.rs_received, s.fs_good, s.fs_reject,
    s.rf_sent, s.rf_received, s.ff_good, s.ff_reject,
    coalesce(rw.qty, 0) as reworked,
    s.last_movement_at,
    last.to_holder_id as derived_holder_id,
    case
      when b.cancelled_at is not null then 'batal'::public.bundle_status
      when exists (select 1 from public.bundle ch where ch.parent_bundle_id = b.id)
        then 'dipecah'::public.bundle_status
      else case last.type
        when 'receive_sew'       then 'proses_jahit'::public.bundle_status
        when 'finish_sew'        then 'siap_finishing'::public.bundle_status
        when 'receive_finishing' then 'proses_finishing'::public.bundle_status
        when 'finish_finishing'  then 'ready_stock'::public.bundle_status
        when 'rework' then case b.start_step
          when 'finishing' then 'siap_finishing'::public.bundle_status
          else 'siap_jahit'::public.bundle_status end
        else 'siap_jahit'::public.bundle_status
      end
    end as derived_status
  from public.bundle b
  left join steps s on s.bundle_id = b.id
  left join reworked rw on rw.bundle_id = b.id
  left join lateral (
    select em.type, em.to_holder_id
    from public.effective_movement em
    where em.bundle_id = b.id
    order by em.seq desc
    limit 1
  ) last on true
)
select
  d.bundle_id,
  d.code,
  d.batch_id,
  d.variant_id,
  d.derived_status                      as status,
  d.derived_status not in ('dipecah', 'batal') as is_active,
  d.derived_holder_id                   as holder_id,
  d.target_qty,
  coalesce(d.ff_good, 0)                as ready,
  coalesce(d.fs_reject, 0) + coalesce(d.ff_reject, 0) - d.reworked as reject,
  case d.derived_status
    when 'siap_jahit'     then d.target_qty
    -- a rework bundle that starts at finishing has no finish_sew
    when 'siap_finishing' then coalesce(d.fs_good, d.target_qty)
    else 0
  end                                   as wip_menunggu,
  case d.derived_status
    when 'proses_jahit'     then d.rs_received
    when 'proses_finishing' then d.rf_received
    else 0
  end                                   as wip_dikerjakan,
  coalesce(d.rs_sent - d.rs_received, 0) + coalesce(d.rf_sent - d.rf_received, 0) as selisih,
  -- qty acuan for the next scan (BR-01)
  case d.derived_status
    when 'siap_jahit'       then d.target_qty
    when 'proses_jahit'     then d.rs_received
    when 'siap_finishing'   then coalesce(d.fs_good, d.target_qty)
    when 'proses_finishing' then d.rf_received
    when 'ready_stock'      then d.ff_good
    else 0
  end                                   as ref_qty,
  d.last_movement_at,
  coalesce(d.fs_reject, 0) + coalesce(d.ff_reject, 0) as reject_awal,
  d.reworked,
  d.rework_of_bundle_id,
  d.rework_source
from derived d;

-- Active bundles of production (retur rework excluded). Target only from non-rework
-- bundles; a rework bundle's numbers come out of its origin's reject.
create or replace view public.batch_variant_reconciliation
with (security_invoker = true) as
select
  r.batch_id,
  r.variant_id,
  count(*)                          as bundle_count,
  (sum(r.target_qty) filter (where r.rework_of_bundle_id is null))::int as target,
  sum(r.ready)::int                 as ready,
  sum(r.reject)::int                as reject,
  sum(r.wip_menunggu)::int          as wip_menunggu,
  sum(r.wip_dikerjakan)::int        as wip_dikerjakan,
  sum(r.wip_menunggu + r.wip_dikerjakan)::int as wip,
  sum(r.selisih)::int               as selisih,
  sum(r.reject_awal)::int           as reject_awal,
  sum(r.reworked)::int              as reworked
from public.bundle_reconciliation r
where r.is_active and r.rework_source is distinct from 'retur'
group by r.batch_id, r.variant_id;

create or replace view public.batch_reconciliation
with (security_invoker = true) as
select
  pb.id                              as batch_id,
  pb.code,
  pb.status,
  pb.created_at,
  pb.completed_at,
  coalesce(sum(v.target), 0)::int          as target,
  coalesce(sum(v.ready), 0)::int           as ready,
  coalesce(sum(v.reject), 0)::int          as reject,
  coalesce(sum(v.wip_menunggu), 0)::int    as wip_menunggu,
  coalesce(sum(v.wip_dikerjakan), 0)::int  as wip_dikerjakan,
  coalesce(sum(v.wip), 0)::int             as wip,
  coalesce(sum(v.selisih), 0)::int         as selisih,
  (select count(*) from public.discrepancy d
     join public.bundle b on b.id = d.bundle_id
    where b.batch_id = pb.id and d.status = 'terbuka')::int as open_discrepancies,
  coalesce(sum(v.reject_awal), 0)::int     as reject_awal,
  coalesce(sum(v.reworked), 0)::int        as reworked
from public.production_batch pb
left join public.batch_variant_reconciliation v on v.batch_id = pb.id
group by pb.id;

create or replace view public.wip_list
with (security_invoker = true) as
select
  b.id as bundle_id,
  b.code,
  b.batch_id,
  pb.code as batch_code,
  b.variant_id,
  b.current_status,
  b.current_qty,
  b.current_holder_id,
  h.name as holder_name,
  b.last_movement_at,
  ((now() at time zone 'Asia/Jakarta')::date - (b.last_movement_at at time zone 'Asia/Jakarta')::date)::int as days_since_last_scan,
  b.rework_of_bundle_id
from public.bundle b
join public.production_batch pb on pb.id = b.batch_id
left join public.holder h on h.id = b.current_holder_id
where b.current_status not in ('ready_stock', 'dipecah', 'batal');

revoke all on public.bundle_reconciliation, public.batch_variant_reconciliation,
  public.batch_reconciliation, public.wip_list from anon, authenticated;
grant select on public.bundle_reconciliation, public.batch_variant_reconciliation,
  public.batch_reconciliation, public.wip_list to authenticated;

-- ---------------------------------------------------------------------------
-- Existing functions that must know about rework
-- ---------------------------------------------------------------------------
create or replace function app.status_label(p_status public.bundle_status)
returns text
language sql immutable set search_path = ''
as $$
  select case p_status
    when 'siap_jahit'       then 'siap jahit'
    when 'proses_jahit'     then 'proses jahit'
    when 'siap_finishing'   then 'siap finishing'
    when 'proses_finishing' then 'proses finishing'
    when 'ready_stock'      then 'ready stock'
    when 'dipecah'          then 'dipecah'
    when 'batal'            then 'batal'
  end;
$$;

create or replace function app.wrong_status_message(p_bundle public.bundle, p_action text)
returns text
language plpgsql stable set search_path = ''
as $$
declare
  v_unprinted integer;
  v_unshelved integer;
begin
  if p_bundle.current_status = 'ready_stock' then
    select count(*) filter (where p.printed_at is null),
           count(*)
      into v_unprinted, v_unshelved
    from public.piece p
    where p.bundle_id = p_bundle.id and p.status = 'aktif' and p.location_id is null;

    return case
      when v_unprinted > 0 then
        format('Bundle %s sudah selesai finishing (Ready stock), belum masuk rak. '
               'Langkah berikutnya: gudang cetak label pcs lalu simpan ke rak.', p_bundle.code)
      when v_unshelved > 0 then
        format('Bundle %s sudah selesai finishing (Ready stock), %s pcs belum masuk rak. '
               'Langkah berikutnya: gudang simpan ke rak.', p_bundle.code, v_unshelved)
      else
        format('Bundle %s sudah selesai dan semua pcs sudah masuk gudang.', p_bundle.code)
    end;
  end if;

  return case
    when p_bundle.current_status = 'batal' then
      format('Label ini sudah tidak berlaku. Rework %s dibatalkan.', p_bundle.code)
    when p_bundle.current_status = 'dipecah' then
      format('Label ini sudah tidak berlaku. Bundle %s dipecah menjadi %s.',
             p_bundle.code, app.split_children_codes(p_bundle.id))
    when p_action = 'terima' and p_bundle.current_status in ('proses_jahit', 'proses_finishing') then
      format('Bundle %s sudah diterima dan sedang %s. Gunakan scan selesai.',
             p_bundle.code, app.status_label(p_bundle.current_status))
    when p_action = 'selesai' and p_bundle.current_status in ('siap_jahit', 'siap_finishing') then
      format('Bundle %s belum di-scan terima. Scan terima dulu.', p_bundle.code)
    else
      format('Bundle %s berstatus %s, tidak bisa di-scan %s.',
             p_bundle.code, app.status_label(p_bundle.current_status), p_action)
  end;
end $$;

-- BR-06, with rework: cancelled bundles and 'retur' rework bundles do not decide the
-- batch status. A new rework bundle puts a finished batch back to 'berjalan'.
create or replace function app.refresh_batch(p_batch_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_any_scan boolean;
  v_all_ready boolean;
  v_new public.batch_status;
begin
  select exists (
    select 1 from public.effective_movement em
    join public.bundle b on b.id = em.bundle_id
    where b.batch_id = p_batch_id and em.type not in ('cut', 'split', 'rework')
  ) into v_any_scan;

  select bool_and(current_status = 'ready_stock') into v_all_ready
  from public.bundle
  where batch_id = p_batch_id and current_status not in ('dipecah', 'batal')
    and rework_source is distinct from 'retur';

  v_new := case
    when not v_any_scan then 'draft'
    when v_all_ready then 'selesai'
    else 'berjalan'
  end;

  update public.production_batch
  set status = v_new,
      completed_at = case when v_new = 'selesai' then coalesce(completed_at, now()) else null end
  where id = p_batch_id and status is distinct from v_new;
end $$;

-- Pieces in rework still count toward the movement that made them, and a correction
-- can never cancel them (it is refused, naming the rework bundle).
create or replace function app.sync_pieces(p_movement public.movement, p_grade public.piece_grade, p_target integer, p_by uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  b public.bundle;
  v_have integer;
  v_need integer;
  v_free uuid[];
  v_out integer;
  v_rework text;
begin
  p_target := coalesce(p_target, 0);
  -- shipped pieces and pieces in rework were produced too
  select count(*) into v_have from public.piece
  where finish_movement_id = p_movement.id and grade = p_grade and status in ('aktif', 'keluar', 'rework');

  if p_target > v_have then
    select * into b from public.bundle where id = p_movement.bundle_id;
    with ins as (
      insert into public.piece (grade, variant_id, bundle_id, batch_id, finish_movement_id)
      select p_grade, b.variant_id, b.id, b.batch_id, p_movement.id
      from generate_series(1, p_target - v_have)
      returning id
    )
    insert into public.piece_event (piece_id, type, created_by)
    select id, 'dibuat', p_by from ins;

  elsif p_target < v_have then
    v_need := v_have - p_target;
    select array_agg(id) into v_free from (
      select id from public.piece
      where finish_movement_id = p_movement.id and grade = p_grade and status = 'aktif'
        and location_id is null and outbound_id is null
      order by (printed_at is not null), code desc   -- unprinted first: no label to throw away
      limit v_need
      for update
    ) s;
    if coalesce(array_length(v_free, 1), 0) < v_need then
      select string_agg(distinct rb.code, ', ') into v_rework
      from public.piece p
      join public.bundle_rework_piece r on r.piece_id = p.id
      join public.bundle rb on rb.id = r.bundle_id and rb.cancelled_at is null
      where p.finish_movement_id = p_movement.id and p.grade = p_grade and p.status = 'rework';
      if v_rework is not null then
        raise exception 'Koreksi ini membatalkan % pcs %, tapi sebagian sudah dikirim ke rework %. Batalkan rework itu dulu.',
          v_need, app.grade_label(p_grade), v_rework using detail = 'pieces_in_rework';
      end if;
      select count(*) into v_out from public.piece
      where finish_movement_id = p_movement.id and grade = p_grade and (status = 'keluar' or outbound_id is not null);
      raise exception 'Koreksi ini membatalkan % pcs %, tapi hanya % pcs yang belum masuk rak%. Keluarkan dulu pcs dari rak.',
        v_need, app.grade_label(p_grade), coalesce(array_length(v_free, 1), 0),
        case when v_out > 0 then format(' (%s pcs sudah dipesan atau dikirim)', v_out) else '' end
        using detail = 'pieces_shelved';
    end if;
    update public.piece set status = 'batal' where id = any (v_free);
    insert into public.piece_event (piece_id, type, note, created_by)
    select unnest(v_free), 'batal', 'Koreksi scan', p_by;
  end if;
end $$;

-- A 'retur' rework bundle repairs pieces that were already counted as produced, so its
-- finishing result (and corrections of it) never adds to stock_ledger.
create function app.stock_ledger_skip_retur_rework()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if exists (select 1 from public.bundle where id = new.bundle_id and rework_source = 'retur') then
    return null;
  end if;
  return new;
end $$;

create trigger stock_ledger_skip_retur_rework
before insert on public.stock_ledger
for each row execute function app.stock_ledger_skip_retur_rework();

-- FR-07 with rework: a rework bundle cannot be split (its children would count as
-- new production and double the batch target).
create or replace function app.split_bundle(p_code text, p_qtys integer[])
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  u public.app_user := app.current_app_user();
  b public.bundle;
  v_qty integer;
  v_child public.bundle;
  v_children jsonb := '[]'::jsonb;
begin
  perform app.require_role(u, 'produksi', 'memecah bundle');
  b := app.find_bundle_for_update(p_code);

  if b.rework_of_bundle_id is not null then
    raise exception 'Bundle % adalah bundle rework dan tidak bisa dipecah.', b.code using detail = 'rework_bundle';
  end if;
  if b.current_status <> 'siap_jahit' then
    raise exception 'Bundle % tidak bisa dipecah karena berstatus %. Pecah hanya sebelum scan terima.',
      b.code, app.status_label(b.current_status) using detail = 'wrong_status';
  end if;
  if p_qtys is null or array_length(p_qtys, 1) < 2 then
    raise exception 'Isi minimal dua qty untuk memecah bundle.' using detail = 'qty_invalid';
  end if;
  if exists (select 1 from unnest(p_qtys) q where q is null or q <= 0) then
    raise exception 'Setiap qty pecahan harus lebih dari 0.' using detail = 'qty_invalid';
  end if;
  if (select sum(q) from unnest(p_qtys) q) <> b.target_qty then
    raise exception 'Jumlah pecahan (%) harus sama dengan qty bundle (%).',
      (select sum(q) from unnest(p_qtys) q), b.target_qty using detail = 'qty_mismatch';
  end if;

  insert into public.movement (bundle_id, type, from_holder_id, qty_sent, scanned_by, note)
  values (b.id, 'split', b.current_holder_id, b.target_qty, u.id,
          'Dipecah menjadi ' || array_to_string(p_qtys, ' + '));

  foreach v_qty in array p_qtys loop
    insert into public.bundle (batch_id, variant_id, target_qty, current_qty, current_holder_id, parent_bundle_id)
    values (b.batch_id, b.variant_id, v_qty, v_qty, b.current_holder_id, b.id)
    returning * into v_child;

    insert into public.movement (bundle_id, type, to_holder_id, qty_sent, scanned_by, note)
    values (v_child.id, 'split', b.current_holder_id, v_qty, u.id, 'Pecahan dari ' || b.code);

    perform app.refresh_bundle(v_child.id);
    v_children := v_children || jsonb_build_object('id', v_child.id, 'code', v_child.code, 'qty', v_qty);
  end loop;

  perform app.refresh_bundle(b.id);
  return jsonb_build_object('parent_code', b.code, 'children', v_children);
end $$;

-- FR-12, FR-18 with rework info for the scan screen badge.
create or replace function app.scan_lookup(p_code text)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  u public.app_user := app.current_app_user();
  b public.bundle;
  v_action text;
  v_role public.app_role;
  v_message text;
  v_allowed boolean := false;
begin
  select * into b from public.bundle
  where qr_token = trim(p_code) or code = upper(trim(p_code));
  if not found then
    raise exception 'Bundle tidak ditemukan. Cek lagi kodenya.' using detail = 'not_found';
  end if;

  v_action := case
    when b.current_status in ('siap_jahit', 'siap_finishing') then 'terima'
    when b.current_status in ('proses_jahit', 'proses_finishing') then 'selesai'
  end;
  v_role := case
    when b.current_status in ('siap_jahit', 'proses_jahit') then 'penjahit'::public.app_role
    when b.current_status in ('siap_finishing', 'proses_finishing') then 'finishing'::public.app_role
  end;

  if v_action is null then
    v_message := app.wrong_status_message(b, 'terima');
  elsif not (v_role = any (u.roles)) then
    v_message := format('Bundle %s berstatus %s. Langkah berikutnya untuk %s.',
                        b.code, app.status_label(b.current_status), v_role);
  elsif v_action = 'selesai' and b.current_holder_id is distinct from u.holder_id then
    v_message := format('Bundle %s sedang dipegang %s.', b.code,
                        (select name from public.holder where id = b.current_holder_id));
  else
    v_allowed := true;
  end if;

  return jsonb_build_object(
    'bundle_id', b.id,
    'code', b.code,
    'batch_code', (select code from public.production_batch where id = b.batch_id),
    'variant', (select jsonb_build_object('sku', sku, 'product_name', product_name, 'size', size, 'color', color)
                from public.product_variant where id = b.variant_id),
    'status', b.current_status,
    'ref_qty', b.current_qty,
    'holder_name', (select name from public.holder where id = b.current_holder_id),
    'last_movement_at', b.last_movement_at,
    'version', b.version,
    'next_action', v_action,
    'allowed', v_allowed,
    'message', v_message,
    'children', case when b.current_status = 'dipecah' then app.split_children_codes(b.id) end,
    'rework', case when b.rework_of_bundle_id is not null then jsonb_build_object(
      'of_code', (select code from public.bundle where id = b.rework_of_bundle_id),
      'source', b.rework_source,
      'start_step', b.start_step,
      'note', b.rework_note
    ) end
  );
end $$;

-- ---------------------------------------------------------------------------
-- Rework
-- ---------------------------------------------------------------------------
-- p_codes: piece codes or QR tokens (reject pieces and damaged returns).
-- p_start_step: where 'finishing' and 'retur' pieces start; 'jahit' pieces always start at jahit.
-- Codes that cannot go to rework are skipped with a reason; if none can, it raises.
create function app.create_rework(p_codes text[], p_start_step public.rework_step, p_note text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  u public.app_user := app.current_app_user();
  v_code text;
  p public.piece;
  v_reason text;
  v_ids uuid[] := '{}';
  v_skipped jsonb := '[]'::jsonb;
  g record;
  ob public.bundle;
  v_child public.bundle;
  v_step public.rework_step;
  v_qty integer;
  v_created jsonb := '[]'::jsonb;
  v_batches uuid[] := '{}';
  v_batch uuid;
begin
  perform app.require_any_role(u, array['supervisor', 'admin']::public.app_role[], 'mengirim barang ke rework');
  if p_note is null or length(trim(p_note)) = 0 then
    raise exception 'Catatan rework wajib diisi (apa yang perlu diperbaiki).' using detail = 'note_required';
  end if;
  if p_start_step is null then
    raise exception 'Pilih tujuan rework: jahit atau finishing.' using detail = 'step_required';
  end if;
  if p_codes is null or coalesce(array_length(p_codes, 1), 0) = 0 then
    raise exception 'Scan atau pilih minimal satu pcs.' using detail = 'codes_required';
  end if;

  foreach v_code in array p_codes loop
    continue when v_code is null or length(trim(v_code)) = 0;
    select * into p from public.piece
    where qr_token = trim(v_code) or code = upper(trim(v_code))
    for update;
    if not found then
      v_skipped := v_skipped || jsonb_build_object('code', upper(trim(v_code)), 'reason', 'Kode pcs tidak dikenali.');
      continue;
    end if;
    continue when p.id = any (v_ids);

    v_reason := case
      when p.status = 'rework' then format('Sudah di rework %s.',
        (select rb.code from public.bundle_rework_piece r
           join public.bundle rb on rb.id = r.bundle_id and rb.cancelled_at is null
          where r.piece_id = p.id limit 1))
      when p.status = 'keluar' then 'Sudah keluar gudang. Catat retur dulu.'
      when p.status <> 'aktif' then 'Pcs sudah dibatalkan.'
      when p.outbound_id is not null then format('Sedang dipesan di dokumen %s.',
        (select code from public.outbound where id = p.outbound_id))
      when p.grade = 'baik' and p.condition = 'baik' then 'Pcs baik, bukan reject atau rusak.'
    end;
    if v_reason is not null then
      v_skipped := v_skipped || jsonb_build_object('code', p.code, 'reason', v_reason);
      continue;
    end if;
    v_ids := v_ids || p.id;
  end loop;

  if coalesce(array_length(v_ids, 1), 0) = 0 then
    raise exception 'Tidak ada pcs yang bisa dikirim ke rework. %',
      (select string_agg(format('%s: %s', s->>'code', s->>'reason'), ' ') from jsonb_array_elements(v_skipped) s)
      using detail = 'nothing_to_rework';
  end if;

  for g in
    select p2.bundle_id,
           (case when p2.grade = 'baik' then 'retur'
                 when m.type = 'finish_sew' then 'jahit'
                 else 'finishing' end)::public.rework_source as source,
           array_agg(p2.id order by p2.code) as ids,
           array_agg(distinct p2.finish_movement_id) as movements
    from public.piece p2
    join public.movement m on m.id = p2.finish_movement_id
    where p2.id = any (v_ids)
    group by 1, 2
    order by min(p2.code)
  loop
    select * into ob from public.bundle where id = g.bundle_id for update;
    v_step := case when g.source = 'jahit' then 'jahit'::public.rework_step else p_start_step end;
    v_qty := array_length(g.ids, 1);

    insert into public.bundle (
      batch_id, variant_id, target_qty, current_qty,
      rework_of_bundle_id, rework_source, start_step, rework_note, rework_by
    ) values (
      ob.batch_id, ob.variant_id, v_qty, v_qty,
      ob.id, g.source, v_step, trim(p_note), u.id
    ) returning * into v_child;

    insert into public.movement (bundle_id, type, qty_sent, scanned_by, note)
    values (v_child.id, 'rework', v_qty, u.id, format('Rework dari %s. %s', ob.code, trim(p_note)));

    insert into public.bundle_rework_piece (bundle_id, piece_id, from_location_id)
    select v_child.id, pp.id, pp.location_id from public.piece pp where pp.id = any (g.ids);

    insert into public.piece_event (piece_id, type, from_location_id, note, created_by)
    select pp.id, 'rework', pp.location_id, format('Masuk rework %s. %s', v_child.code, trim(p_note)), u.id
    from public.piece pp where pp.id = any (g.ids);

    update public.piece set status = 'rework', location_id = null where id = any (g.ids);

    -- Reject notifications are settled once no reject of that scan is left undecided.
    if g.source <> 'retur' then
      perform app.settle_notifications('movement', mv.id, 'Semua reject dikirim ke rework.')
      from unnest(g.movements) as mv(id)
      where not exists (
        select 1 from public.piece q
        where q.finish_movement_id = mv.id and q.grade = 'reject' and q.status in ('aktif', 'keluar')
      );
    end if;

    perform app.refresh_bundle(v_child.id);
    if not (ob.batch_id = any (v_batches)) then
      v_batches := v_batches || ob.batch_id;
    end if;

    v_created := v_created || jsonb_build_object(
      'id', v_child.id, 'code', v_child.code, 'of_code', ob.code,
      'source', g.source, 'start_step', v_step, 'qty', v_qty
    );
  end loop;

  foreach v_batch in array v_batches loop
    perform app.refresh_batch(v_batch);
  end loop;

  return jsonb_build_object(
    'created', v_created,
    'skipped', v_skipped,
    'message', (
      select format('%s pcs dikirim ke rework: %s.', sum((c->>'qty')::int),
        string_agg(format('%s (dari %s, mulai %s)', c->>'code', c->>'of_code', c->>'start_step'), ', '))
      from jsonb_array_elements(v_created) c
    )
  );
end $$;

-- Undo a rework bundle that has not been scanned: its pieces go back to their rack.
create function app.cancel_rework(p_code text, p_note text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  u public.app_user := app.current_app_user();
  b public.bundle;
  v_count integer;
begin
  perform app.require_any_role(u, array['supervisor', 'admin']::public.app_role[], 'membatalkan rework');
  if p_note is null or length(trim(p_note)) = 0 then
    raise exception 'Alasan pembatalan wajib diisi.' using detail = 'note_required';
  end if;
  b := app.find_bundle_for_update(p_code);
  if b.rework_of_bundle_id is null then
    raise exception 'Bundle % bukan bundle rework.', b.code using detail = 'not_rework';
  end if;
  if b.cancelled_at is not null then
    raise exception 'Rework % sudah dibatalkan.', b.code using detail = 'already_cancelled';
  end if;
  if exists (select 1 from public.effective_movement where bundle_id = b.id and type <> 'rework') then
    raise exception 'Rework % sudah di-scan. Batalkan dulu scannya lewat koreksi.', b.code
      using detail = 'already_scanned';
  end if;

  -- back to the rack it came from, if that rack is still in use
  with back as (
    select r.piece_id,
           case when l.is_active then r.from_location_id end as location_id
    from public.bundle_rework_piece r
    join public.piece p on p.id = r.piece_id and p.status = 'rework'
    left join public.location l on l.id = r.from_location_id
    where r.bundle_id = b.id
    for update of p
  ), ev as (
    insert into public.piece_event (piece_id, type, to_location_id, note, created_by)
    select piece_id, 'batal_rework', location_id, format('Rework %s dibatalkan. %s', b.code, trim(p_note)), u.id
    from back
    returning piece_id
  )
  update public.piece p
  set status = 'aktif', location_id = back.location_id
  from back
  where p.id = back.piece_id;
  get diagnostics v_count = row_count;

  update public.bundle
  set cancelled_at = now(), cancelled_by = u.id, cancel_note = trim(p_note)
  where id = b.id;

  perform app.refresh_bundle(b.id);
  perform app.refresh_batch(b.batch_id);

  return jsonb_build_object(
    'code', b.code,
    'pieces', v_count,
    'message', format('Rework %s dibatalkan. %s pcs kembali ke reject bundle %s.', b.code, v_count,
      (select code from public.bundle where id = b.rework_of_bundle_id))
  );
end $$;

-- ---------------------------------------------------------------------------
-- Report: ready excludes repaired returns; rework numbers added to totals.
-- ---------------------------------------------------------------------------
create or replace function app.production_report(p_from date, p_to date)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  u public.app_user := app.current_app_user();
  v_start timestamptz;
  v_end timestamptz;
  v_result jsonb;
begin
  perform app.require_any_role(u, array['admin', 'supervisor', 'produksi']::public.app_role[], 'melihat laporan');
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'Pilih tanggal awal dan akhir yang benar.' using detail = 'range_invalid';
  end if;
  if p_to - p_from > 366 then
    raise exception 'Rentang laporan maksimal satu tahun.' using detail = 'range_too_long';
  end if;

  v_start := p_from::timestamp at time zone 'Asia/Jakarta';
  v_end := (p_to + 1)::timestamp at time zone 'Asia/Jakarta';

  with em as (
    select e.*, b.variant_id, b.batch_id, (e.scanned_at at time zone 'Asia/Jakarta')::date as day,
      b.rework_of_bundle_id is not null as is_rework,
      b.rework_source is not distinct from 'retur' as is_retur
    from public.effective_movement e
    join public.bundle b on b.id = e.bundle_id
    where e.scanned_at >= v_start and e.scanned_at < v_end
  ),
  totals as (
    select
      coalesce(sum(qty_sent) filter (where type = 'cut'), 0)::int                          as cut,
      count(distinct batch_id) filter (where type = 'cut')::int                            as batches,
      coalesce(sum(qty_received) filter (where type = 'finish_sew'), 0)::int               as sew_in,
      coalesce(sum(qty_good) filter (where type = 'finish_sew'), 0)::int                   as sew_good,
      coalesce(sum(qty_reject) filter (where type = 'finish_sew'), 0)::int                 as sew_reject,
      coalesce(sum(qty_received) filter (where type = 'finish_finishing'), 0)::int         as qc_in,
      coalesce(sum(qty_good) filter (where type = 'finish_finishing' and not is_retur), 0)::int as ready,
      coalesce(sum(qty_reject) filter (where type = 'finish_finishing'), 0)::int           as qc_reject,
      coalesce(sum(qty_sent - qty_received) filter (where type in ('receive_sew', 'receive_finishing')), 0)::int as selisih,
      count(*) filter (where type in ('receive_sew', 'receive_finishing') and qty_received < qty_sent)::int as selisih_events,
      coalesce(sum(qty_good) filter (where type = 'finish_finishing' and is_rework), 0)::int as rework_good,
      coalesce(sum(qty_reject) filter (where type = 'finish_finishing' and is_rework), 0)::int as rework_reject
    from em
  ),
  lead as (
    -- batch created -> finishing done, for bundles finished in the range (rework bundles excluded)
    select
      count(*)::int as bundles,
      round(percentile_cont(0.5) within group (order by extract(epoch from em.scanned_at - pb.created_at) / 86400)::numeric, 1) as median_days,
      round(percentile_cont(0.9) within group (order by extract(epoch from em.scanned_at - pb.created_at) / 86400)::numeric, 1) as p90_days
    from em join public.production_batch pb on pb.id = em.batch_id
    where em.type = 'finish_finishing' and not em.is_rework
  ),
  daily as (
    select d::date as day,
      coalesce(sum(em.qty_sent) filter (where em.type = 'cut'), 0)::int as cut,
      coalesce(sum(em.qty_good) filter (where em.type = 'finish_finishing' and not em.is_retur), 0)::int as ready,
      coalesce(sum(em.qty_reject) filter (where em.type in ('finish_sew', 'finish_finishing')), 0)::int as reject,
      coalesce(sum(em.qty_sent - em.qty_received) filter (where em.type in ('receive_sew', 'receive_finishing')), 0)::int as selisih
    from generate_series(p_from, p_to, interval '1 day') d
    left join em on em.day = d::date
    group by d
    order by d
  ),
  tailors as (
    select fs.to_holder_id as holder_id, h.name,
      count(*)::int as bundles,
      sum(fs.qty_received)::int as received,
      sum(fs.qty_good)::int as good,
      sum(fs.qty_reject)::int as reject,
      round(avg(extract(epoch from fs.scanned_at - rs.scanned_at) / 3600)::numeric, 1) as avg_hours
    from em fs
    join public.holder h on h.id = fs.to_holder_id
    left join public.effective_movement rs on rs.bundle_id = fs.bundle_id and rs.type = 'receive_sew'
    where fs.type = 'finish_sew'
    group by fs.to_holder_id, h.name
  ),
  variants as (
    select em.variant_id, pv.sku, pv.product_name, pv.size, pv.color,
      coalesce(sum(em.qty_good) filter (where em.type = 'finish_finishing' and not em.is_retur), 0)::int as ready,
      coalesce(sum(em.qty_reject) filter (where em.type in ('finish_sew', 'finish_finishing')), 0)::int as reject,
      coalesce(sum(em.qty_sent) filter (where em.type = 'cut'), 0)::int as cut
    from em join public.product_variant pv on pv.id = em.variant_id
    group by em.variant_id, pv.sku, pv.product_name, pv.size, pv.color
  ),
  reject_reasons as (
    select coalesce(r.label, 'Tanpa alasan') as label,
      case em.type when 'finish_sew' then 'jahit' else 'qc' end as stage,
      sum(em.qty_reject)::int as qty
    from em left join public.reason r on r.id = em.reason_id
    where em.type in ('finish_sew', 'finish_finishing') and em.qty_reject > 0
    group by 1, 2
  ),
  selisih_reasons as (
    select coalesce(r.label, 'Tanpa alasan') as label,
      case em.type when 'receive_sew' then 'produksi ke jahit' else 'jahit ke finishing' end as step,
      sum(em.qty_sent - em.qty_received)::int as qty
    from em left join public.reason r on r.id = em.reason_id
    where em.type in ('receive_sew', 'receive_finishing') and em.qty_received < em.qty_sent
    group by 1, 2
  )
  select jsonb_build_object(
    'from', p_from,
    'to', p_to,
    'days', p_to - p_from + 1,
    'totals', (select to_jsonb(t) from totals t)
      || jsonb_build_object(
        -- good pieces only, so it compares with "ready"; rejects go to reject racks
        'shelved', (select count(*) from public.piece_event pe
                    join public.piece p on p.id = pe.piece_id and p.grade = 'baik'
                    where pe.type = 'masuk_rak' and pe.created_at >= v_start and pe.created_at < v_end),
        'flags_open', (select count(*) from public.discrepancy d
                       where d.created_at >= v_start and d.created_at < v_end and d.status = 'terbuka'),
        -- pieces sent to rework in the range (cancelled rework bundles excluded)
        'reworked', (select count(*) from public.bundle_rework_piece r
                     join public.bundle rb on rb.id = r.bundle_id
                     where rb.cancelled_at is null and rb.created_at >= v_start and rb.created_at < v_end)
      ),
    'lead_time', (select to_jsonb(l) from lead l),
    'daily', coalesce((select jsonb_agg(to_jsonb(d) order by d.day) from daily d), '[]'::jsonb),
    'tailors', coalesce((select jsonb_agg(to_jsonb(t) order by t.received desc) from tailors t), '[]'::jsonb),
    'variants', coalesce((select jsonb_agg(to_jsonb(v) order by v.ready desc, v.cut desc) from variants v), '[]'::jsonb),
    'reject_reasons', coalesce((select jsonb_agg(to_jsonb(r) order by r.qty desc) from reject_reasons r), '[]'::jsonb),
    'selisih_reasons', coalesce((select jsonb_agg(to_jsonb(s) order by s.qty desc) from selisih_reasons s), '[]'::jsonb)
  ) into v_result;

  return v_result;
end $$;

-- ---------------------------------------------------------------------------
-- Public wrappers and access
-- ---------------------------------------------------------------------------
create function public.create_rework(p_codes text[], p_start_step public.rework_step, p_note text)
returns jsonb language sql security invoker set search_path = ''
as $$ select app.create_rework(p_codes, p_start_step, p_note) $$;

create function public.cancel_rework(p_code text, p_note text)
returns jsonb language sql security invoker set search_path = ''
as $$ select app.cancel_rework(p_code, p_note) $$;

alter table public.bundle_rework_piece enable row level security;
create policy "staff read" on public.bundle_rework_piece for select to authenticated using ((select app.is_active_user()));
revoke all on public.bundle_rework_piece from anon, authenticated;
grant select on public.bundle_rework_piece to authenticated;

revoke all on function
  app.stock_ledger_skip_retur_rework(),
  app.create_rework(text[], public.rework_step, text), app.cancel_rework(text, text),
  public.create_rework(text[], public.rework_step, text), public.cancel_rework(text, text)
from public, anon;
grant execute on function
  app.create_rework(text[], public.rework_step, text), app.cancel_rework(text, text),
  public.create_rework(text[], public.rework_step, text), public.cancel_rework(text, text)
to authenticated;

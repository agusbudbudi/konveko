-- Fase 2a: one row per finished piece (good and reject) and warehouse racks.
--
-- Pieces are created from finishing results, never typed in:
--   finish_finishing -> qty_good pieces 'baik' + qty_reject pieces 'reject'
--   finish_sew       -> qty_reject pieces 'reject'
-- A trigger on movement keeps the piece count equal to the effective
-- movement, so corrections and voids follow automatically. Removing pieces
-- only takes ones that are not on a rack (unprinted first); otherwise the
-- correction is refused until the pieces are taken off the rack.
--
-- piece.location_id / status are a projection of the append-only
-- piece_event log, written together in the same transaction.
-- stock_ledger stays the source of the stock total; invariant (tested):
--   per bundle: sum(stock_ledger.qty) = active 'baik' pieces
--   per bundle: reject = active 'reject' pieces

-- ---------------------------------------------------------------------------
-- Types and tables
-- ---------------------------------------------------------------------------
create type public.location_kind as enum ('stok', 'reject');
create type public.piece_grade as enum ('baik', 'reject');
create type public.piece_status as enum ('aktif', 'batal');
create type public.piece_event_type as enum ('dibuat', 'cetak', 'masuk_rak', 'pindah_rak', 'keluar_rak', 'batal');

create table public.location (
  id          uuid primary key default gen_random_uuid(),
  -- no dash, so a rack code never looks like a bundle (B-00001) or piece (P-0000001) code
  code        text not null unique check (code ~ '^[A-Z0-9]{1,8}$'),
  kind        public.location_kind not null default 'stok',
  note        text,
  qr_token    text not null unique default replace(gen_random_uuid()::text, '-', ''),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create sequence public.piece_code_seq;

create table public.piece (
  id                  uuid primary key default gen_random_uuid(),
  code                text not null unique
                      default 'P-' || lpad(nextval('public.piece_code_seq')::text, 7, '0'),
  qr_token            text not null unique default replace(gen_random_uuid()::text, '-', ''),
  grade               public.piece_grade not null,
  status              public.piece_status not null default 'aktif',
  variant_id          uuid not null references public.product_variant (id),
  bundle_id           uuid not null references public.bundle (id),
  batch_id            uuid not null references public.production_batch (id),
  finish_movement_id  uuid not null references public.movement (id),
  location_id         uuid references public.location (id),
  printed_at          timestamptz,
  print_count         integer not null default 0 check (print_count >= 0),
  created_at          timestamptz not null default now(),
  constraint piece_void_off_rack check (status = 'aktif' or location_id is null)
);
create index piece_bundle_idx on public.piece (bundle_id);
create index piece_movement_idx on public.piece (finish_movement_id, grade, status);
create index piece_variant_idx on public.piece (variant_id);
create index piece_batch_idx on public.piece (batch_id);
create index piece_location_idx on public.piece (location_id) where status = 'aktif';
create index piece_unprinted_idx on public.piece (created_at) where status = 'aktif' and printed_at is null;
create index piece_unshelved_idx on public.piece (bundle_id) where status = 'aktif' and location_id is null;

create table public.piece_event (
  id                uuid primary key default gen_random_uuid(),
  seq               bigint generated always as identity unique,
  piece_id          uuid not null references public.piece (id),
  type              public.piece_event_type not null,
  from_location_id  uuid references public.location (id),
  to_location_id    uuid references public.location (id),
  note              text,
  created_by        uuid not null references public.app_user (id),
  created_at        timestamptz not null default now()
);
create index piece_event_piece_idx on public.piece_event (piece_id, seq);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create function app.require_any_role(p_user public.app_user, p_roles public.app_role[], p_action text)
returns void
language plpgsql immutable set search_path = ''
as $$
begin
  if not (p_user.roles && p_roles) then
    raise exception 'Akun Anda tidak punya akses untuk %.', p_action using detail = 'forbidden_role';
  end if;
end $$;

create function app.grade_label(p_grade public.piece_grade)
returns text
language sql immutable set search_path = ''
as $$ select case p_grade when 'baik' then 'baik' else 'reject' end $$;

-- Make the number of active pieces of one grade from one finish movement
-- equal to p_target.
create function app.sync_pieces(p_movement public.movement, p_grade public.piece_grade, p_target integer, p_by uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  b public.bundle;
  v_have integer;
  v_need integer;
  v_free uuid[];
begin
  p_target := coalesce(p_target, 0);
  select count(*) into v_have from public.piece
  where finish_movement_id = p_movement.id and grade = p_grade and status = 'aktif';

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
        and location_id is null
      order by (printed_at is not null), code desc   -- unprinted first: no label to throw away
      limit v_need
      for update
    ) s;
    if coalesce(array_length(v_free, 1), 0) < v_need then
      raise exception 'Koreksi ini membatalkan % pcs %, tapi hanya % pcs yang belum masuk rak. Keluarkan dulu pcs dari rak.',
        v_need, app.grade_label(p_grade), coalesce(array_length(v_free, 1), 0)
        using detail = 'pieces_shelved';
    end if;
    update public.piece set status = 'batal' where id = any (v_free);
    insert into public.piece_event (piece_id, type, note, created_by)
    select unnest(v_free), 'batal', 'Koreksi scan', p_by;
  end if;
end $$;

create function app.movement_pieces()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  o public.movement;
begin
  if new.type = 'finish_finishing' then
    perform app.sync_pieces(new, 'baik', new.qty_good, new.scanned_by);
    perform app.sync_pieces(new, 'reject', new.qty_reject, new.scanned_by);
  elsif new.type = 'finish_sew' then
    perform app.sync_pieces(new, 'reject', new.qty_reject, new.scanned_by);
  elsif new.type = 'correction' then
    select * into o from public.movement where id = new.corrects_movement_id;
    if o.type = 'finish_finishing' then
      perform app.sync_pieces(o, 'baik', case when new.is_void then 0 else new.qty_good end, new.scanned_by);
      perform app.sync_pieces(o, 'reject', case when new.is_void then 0 else new.qty_reject end, new.scanned_by);
    elsif o.type = 'finish_sew' then
      perform app.sync_pieces(o, 'reject', case when new.is_void then 0 else new.qty_reject end, new.scanned_by);
    end if;
  end if;
  return null;
end $$;

create trigger movement_pieces
after insert on public.movement
for each row execute function app.movement_pieces();

-- Backfill pieces for finishing results recorded before this migration.
do $$
declare
  em record;
  o public.movement;
begin
  for em in
    select * from public.effective_movement where type in ('finish_sew', 'finish_finishing') order by seq
  loop
    select * into o from public.movement where id = em.id;
    if em.type = 'finish_finishing' then
      perform app.sync_pieces(o, 'baik', em.qty_good, em.scanned_by);
    end if;
    perform app.sync_pieces(o, 'reject', em.qty_reject, em.scanned_by);
  end loop;
end $$;

create function app.find_location(p_code text)
returns public.location
language plpgsql stable security definer set search_path = ''
as $$
declare
  l public.location;
begin
  select * into l from public.location
  where (qr_token = trim(p_code) or code = upper(trim(p_code))) and is_active;
  if not found then
    raise exception 'Rak tidak ditemukan. Scan QR rak atau ketik kodenya.' using detail = 'location_not_found';
  end if;
  return l;
end $$;

-- ---------------------------------------------------------------------------
-- Warehouse scan: what is this code? (read only)
-- ---------------------------------------------------------------------------
create function app.warehouse_lookup(p_code text)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  u public.app_user := app.current_app_user();
  v_code text := trim(p_code);
  l public.location;
  p public.piece;
  b public.bundle;
begin
  select * into l from public.location
  where (qr_token = v_code or code = upper(v_code)) and is_active;
  if found then
    return jsonb_build_object(
      'kind', 'location', 'id', l.id, 'code', l.code, 'location_kind', l.kind, 'note', l.note,
      'qty', (select count(*) from public.piece where location_id = l.id and status = 'aktif')
    );
  end if;

  select * into p from public.piece where qr_token = v_code or code = upper(v_code);
  if found then
    return jsonb_build_object(
      'kind', 'piece', 'id', p.id, 'code', p.code, 'grade', p.grade, 'status', p.status,
      'printed', p.printed_at is not null,
      'location_code', (select code from public.location where id = p.location_id),
      'bundle_code', (select code from public.bundle where id = p.bundle_id),
      'variant', (select jsonb_build_object('sku', sku, 'product_name', product_name, 'size', size, 'color', color)
                  from public.product_variant where id = p.variant_id)
    );
  end if;

  select * into b from public.bundle where qr_token = v_code or code = upper(v_code);
  if found then
    return jsonb_build_object(
      'kind', 'bundle', 'id', b.id, 'code', b.code, 'status', b.current_status,
      'variant', (select jsonb_build_object('sku', sku, 'product_name', product_name, 'size', size, 'color', color)
                  from public.product_variant where id = b.variant_id),
      'unshelved_baik', (select count(*) from public.piece
                         where bundle_id = b.id and status = 'aktif' and location_id is null and grade = 'baik'),
      'unshelved_reject', (select count(*) from public.piece
                           where bundle_id = b.id and status = 'aktif' and location_id is null and grade = 'reject'),
      'unprinted', (select count(*) from public.piece
                    where bundle_id = b.id and status = 'aktif' and location_id is null and printed_at is null),
      'shelved', (select count(*) from public.piece
                  where bundle_id = b.id and status = 'aktif' and location_id is not null)
    );
  end if;

  raise exception 'Kode tidak dikenali. Scan QR rak, bundle, atau pcs.' using detail = 'not_found';
end $$;

-- ---------------------------------------------------------------------------
-- Putaway: a bundle (all its unshelved pieces of the rack's grade) or one piece
-- ---------------------------------------------------------------------------
create function app.putaway(p_location text, p_code text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  u public.app_user := app.current_app_user();
  v_code text := trim(p_code);
  l public.location;
  p public.piece;
  b public.bundle;
  v_grade public.piece_grade;
  v_ids uuid[];
  v_unprinted integer;
  v_other integer;
begin
  perform app.require_any_role(u, array['gudang', 'supervisor']::public.app_role[], 'memasukkan barang ke rak');
  l := app.find_location(p_location);
  v_grade := case l.kind when 'stok' then 'baik'::public.piece_grade else 'reject'::public.piece_grade end;

  select * into p from public.piece where qr_token = v_code or code = upper(v_code) for update;
  if found then
    if p.status <> 'aktif' then
      raise exception 'Pcs % sudah dibatalkan. Buang labelnya.', p.code using detail = 'piece_void';
    end if;
    if p.grade <> v_grade then
      raise exception 'Pcs % adalah barang %, tidak bisa masuk rak % (%).',
        p.code, app.grade_label(p.grade), l.code, l.kind using detail = 'wrong_rack_kind';
    end if;
    if p.printed_at is null then
      raise exception 'Label pcs % belum dicetak.', p.code using detail = 'not_printed';
    end if;
    if p.location_id = l.id then
      raise exception 'Pcs % sudah di rak %.', p.code, l.code using detail = 'already_there';
    end if;
    insert into public.piece_event (piece_id, type, from_location_id, to_location_id, created_by)
    values (p.id, case when p.location_id is null then 'masuk_rak'::public.piece_event_type
                       else 'pindah_rak'::public.piece_event_type end,
            p.location_id, l.id, u.id);
    update public.piece set location_id = l.id where id = p.id;
    return jsonb_build_object(
      'moved', 1, 'location_code', l.code, 'code', p.code,
      'message', case when p.location_id is null
        then format('Pcs %s masuk rak %s.', p.code, l.code)
        else format('Pcs %s dipindah dari rak %s ke %s.', p.code,
                    (select code from public.location where id = p.location_id), l.code) end
    );
  end if;

  select * into b from public.bundle where qr_token = v_code or code = upper(v_code);
  if not found then
    raise exception 'Kode tidak dikenali. Scan QR bundle atau pcs.' using detail = 'not_found';
  end if;

  select array_agg(id), count(*) filter (where printed_at is null)
  into v_ids, v_unprinted
  from (
    select id, printed_at from public.piece
    where bundle_id = b.id and status = 'aktif' and location_id is null and grade = v_grade
    for update
  ) s;

  if v_ids is null then
    select count(*) into v_other from public.piece
    where bundle_id = b.id and status = 'aktif' and location_id is null;
    if v_other > 0 then
      raise exception 'Bundle % masih punya % pcs %, bukan barang untuk rak % (%).',
        b.code, v_other, case v_grade when 'baik' then 'reject' else 'baik' end, l.code, l.kind
        using detail = 'wrong_rack_kind';
    end if;
    raise exception 'Tidak ada pcs bundle % yang menunggu masuk rak.', b.code using detail = 'nothing_to_move';
  end if;
  if v_unprinted > 0 then
    raise exception '% label pcs bundle % belum dicetak. Cetak dulu di antrian label.', v_unprinted, b.code
      using detail = 'not_printed';
  end if;

  insert into public.piece_event (piece_id, type, to_location_id, created_by)
  select unnest(v_ids), 'masuk_rak', l.id, u.id;
  update public.piece set location_id = l.id where id = any (v_ids);

  return jsonb_build_object(
    'moved', array_length(v_ids, 1), 'location_code', l.code, 'code', b.code,
    'message', format('%s pcs %s bundle %s masuk rak %s.', array_length(v_ids, 1), app.grade_label(v_grade), b.code, l.code)
  );
end $$;

-- Take one piece off its rack (before a correction, or when it was shelved by mistake).
create function app.unshelve(p_code text, p_note text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  u public.app_user := app.current_app_user();
  p public.piece;
  v_from text;
begin
  perform app.require_any_role(u, array['gudang', 'supervisor']::public.app_role[], 'mengeluarkan barang dari rak');
  if p_note is null or length(trim(p_note)) = 0 then
    raise exception 'Alasan wajib diisi.' using detail = 'note_required';
  end if;
  select * into p from public.piece where qr_token = trim(p_code) or code = upper(trim(p_code)) for update;
  if not found then
    raise exception 'Pcs tidak ditemukan.' using detail = 'not_found';
  end if;
  if p.location_id is null then
    raise exception 'Pcs % tidak sedang di rak.', p.code using detail = 'not_on_rack';
  end if;
  v_from := (select code from public.location where id = p.location_id);
  insert into public.piece_event (piece_id, type, from_location_id, note, created_by)
  values (p.id, 'keluar_rak', p.location_id, trim(p_note), u.id);
  update public.piece set location_id = null where id = p.id;
  return jsonb_build_object('code', p.code, 'message', format('Pcs %s dikeluarkan dari rak %s.', p.code, v_from));
end $$;

-- Label queue: mark labels as printed. Printing again counts as a reprint.
create function app.mark_printed(p_piece_ids uuid[])
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
    where id = any (p_piece_ids) and status = 'aktif'
    returning id, print_count
  ), ev as (
    insert into public.piece_event (piece_id, type, note, created_by)
    select id, 'cetak', case when print_count > 1 then 'Cetak ulang' end, u.id from upd
  )
  select count(*) into v_n from upd;
  return v_n;
end $$;

-- ---------------------------------------------------------------------------
-- Views
-- ---------------------------------------------------------------------------
-- Stock per variant, grade, and rack (location null = belum di rak).
create view public.stock_location
with (security_invoker = true) as
select
  p.variant_id,
  pv.sku,
  pv.product_name,
  pv.size,
  pv.color,
  p.grade,
  p.location_id,
  l.code as location_code,
  count(*)::int as qty
from public.piece p
join public.product_variant pv on pv.id = p.variant_id
left join public.location l on l.id = p.location_id
where p.status = 'aktif'
group by p.variant_id, pv.sku, pv.product_name, pv.size, pv.color, p.grade, p.location_id, l.code;

-- Finished pieces waiting between finishing and the rack, per bundle.
create view public.bundle_unshelved
with (security_invoker = true) as
select
  b.id as bundle_id,
  b.code,
  b.variant_id,
  pb.code as batch_code,
  count(*) filter (where p.grade = 'baik')::int   as baik,
  count(*) filter (where p.grade = 'reject')::int as reject,
  count(*) filter (where p.printed_at is null)::int as unprinted,
  min(p.created_at) as since,
  floor(extract(epoch from (now() - min(p.created_at))) / 86400)::int as days_waiting
from public.piece p
join public.bundle b on b.id = p.bundle_id
join public.production_batch pb on pb.id = b.batch_id
where p.status = 'aktif' and p.location_id is null
group by b.id, b.code, b.variant_id, pb.code;

-- ---------------------------------------------------------------------------
-- Public wrappers
-- ---------------------------------------------------------------------------
create function public.warehouse_lookup(p_code text)
returns jsonb language sql stable security invoker set search_path = ''
as $$ select app.warehouse_lookup(p_code) $$;

create function public.putaway(p_location text, p_code text)
returns jsonb language sql security invoker set search_path = ''
as $$ select app.putaway(p_location, p_code) $$;

create function public.unshelve(p_code text, p_note text)
returns jsonb language sql security invoker set search_path = ''
as $$ select app.unshelve(p_code, p_note) $$;

create function public.mark_printed(p_piece_ids uuid[])
returns integer language sql security invoker set search_path = ''
as $$ select app.mark_printed(p_piece_ids) $$;

-- ---------------------------------------------------------------------------
-- Access control (same model as MVP: read for active staff, writes via app.*)
-- ---------------------------------------------------------------------------
alter table public.location    enable row level security;
alter table public.piece       enable row level security;
alter table public.piece_event enable row level security;

create policy "staff read" on public.location    for select to authenticated using ((select app.is_active_user()));
create policy "staff read" on public.piece       for select to authenticated using ((select app.is_active_user()));
create policy "staff read" on public.piece_event for select to authenticated using ((select app.is_active_user()));

create policy "admin insert" on public.location for insert to authenticated with check ((select app.has_role('admin')));
create policy "admin update" on public.location for update to authenticated
  using ((select app.has_role('admin'))) with check ((select app.has_role('admin')));

revoke all on public.location, public.piece, public.piece_event,
              public.stock_location, public.bundle_unshelved from anon, authenticated;
revoke all on sequence public.piece_code_seq from anon, authenticated;
grant select on public.location, public.piece, public.piece_event,
                public.stock_location, public.bundle_unshelved to authenticated;
grant insert, update on public.location to authenticated;

revoke all on function
  app.require_any_role(public.app_user, public.app_role[], text),
  app.grade_label(public.piece_grade),
  app.sync_pieces(public.movement, public.piece_grade, integer, uuid),
  app.movement_pieces(),
  app.find_location(text),
  app.warehouse_lookup(text), app.putaway(text, text), app.unshelve(text, text), app.mark_printed(uuid[]),
  public.warehouse_lookup(text), public.putaway(text, text), public.unshelve(text, text), public.mark_printed(uuid[])
from public, anon;
grant execute on function
  app.warehouse_lookup(text), app.putaway(text, text), app.unshelve(text, text), app.mark_printed(uuid[]),
  public.warehouse_lookup(text), public.putaway(text, text), public.unshelve(text, text), public.mark_printed(uuid[])
to authenticated;

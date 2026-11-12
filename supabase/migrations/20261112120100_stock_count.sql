-- Fase 2c: stok opname (doc/PRD Fase 2c - Stok opname.md).
--
-- A stock count (OP-000001) covers chosen racks. While it is open (menghitung / review)
-- those racks are locked: no piece event may move a piece onto or off them (trigger on
-- piece_event), so the system content of a locked rack cannot change and needs no snapshot.
--
--   stock_count_create(racks, note)              gudang, supervisor
--   stock_count_scan(count, rack, pcs)           blind: the answer only says how many were scanned
--   stock_count_unlabeled(count, rack, variant, condition, qty)   goods without a Konveko label
--   stock_count_undo / close_location            gudang, supervisor
--   stock_count_reopen_location                  supervisor: recount one rack (its scans are dropped)
--   stock_count_review(count)                    supervisor: per rack lines (see app.stock_count_lines)
--   stock_count_approve(count)                   supervisor: all corrections in one transaction
--   stock_count_cancel(count, note)              supervisor: unlock, no changes
--
-- On approval:
--   hilang       -> one 'penyesuaian' outbound document, shipped (Fase 2b path)
--   pindah       -> pindah_rak to the counted rack
--   belum_di_rak -> masuk_rak to the counted rack
--   jenis_salah  -> keluar_rak (back to "belum di rak" for a correct putaway)
--   keluar / tidak_berlaku -> findings only
--   unlabeled    -> new 'stok_awal' pieces on the rack, unprinted (label queue)
-- Stok awal pieces have no bundle, batch or finish movement: they are outside production
-- reconciliation and stock_ledger, but are normal stock everywhere else.

-- ---------------------------------------------------------------------------
-- Types, tables, piece origin
-- ---------------------------------------------------------------------------
create type public.stock_count_status as enum ('menghitung', 'review', 'disetujui', 'batal');
create type public.stock_count_location_status as enum ('menghitung', 'ditutup');
create type public.piece_origin as enum ('produksi', 'stok_awal');

create sequence public.stock_count_code_seq;

create table public.stock_count (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique default 'OP-' || lpad(nextval('public.stock_count_code_seq')::text, 6, '0'),
  status        public.stock_count_status not null default 'menghitung',
  note          text check (note is null or length(note) <= 500),
  created_by    uuid not null references public.app_user (id),
  created_at    timestamptz not null default now(),
  approved_by   uuid references public.app_user (id),
  approved_at   timestamptz,
  cancelled_by  uuid references public.app_user (id),
  cancelled_at  timestamptz,
  cancel_note   text,
  outbound_id   uuid references public.outbound (id),
  constraint stock_count_approved check ((status = 'disetujui') = (approved_at is not null)),
  constraint stock_count_cancelled check ((status = 'batal') = (cancelled_at is not null))
);
create index stock_count_created_idx on public.stock_count (created_at desc);

create table public.stock_count_location (
  count_id        uuid not null references public.stock_count (id),
  location_id     uuid not null references public.location (id),
  status          public.stock_count_location_status not null default 'menghitung',
  -- true while the count is open: the rack is locked
  is_open         boolean not null default true,
  closed_by       uuid references public.app_user (id),
  closed_at       timestamptz,
  -- stored on approval
  expected        integer,
  matched         integer,
  missing         integer,
  moved_in        integer,
  wrong_kind      integer,
  findings        integer,
  unlabeled       integer,
  primary key (count_id, location_id)
);
-- one open count per rack
create unique index stock_count_location_open on public.stock_count_location (location_id) where is_open;

create table public.stock_count_scan (
  id           uuid primary key default gen_random_uuid(),
  count_id     uuid not null references public.stock_count (id),
  location_id  uuid not null references public.location (id),
  -- a labeled piece ...
  piece_id     uuid references public.piece (id),
  -- ... or a line of goods without a label
  variant_id   uuid references public.product_variant (id),
  condition    public.piece_condition,
  qty          integer check (qty is null or qty between 1 and 10000),
  scanned_by   uuid not null references public.app_user (id),
  scanned_at   timestamptz not null default now(),
  constraint stock_count_scan_shape check (
    (piece_id is not null and variant_id is null and condition is null and qty is null)
    or (piece_id is null and variant_id is not null and condition is not null and qty is not null)
  ),
  foreign key (count_id, location_id) references public.stock_count_location (count_id, location_id)
);
create unique index stock_count_scan_piece on public.stock_count_scan (count_id, location_id, piece_id) where piece_id is not null;
create unique index stock_count_scan_unlabeled on public.stock_count_scan (count_id, location_id, variant_id, condition) where piece_id is null;
create index stock_count_scan_piece_idx on public.stock_count_scan (piece_id) where piece_id is not null;

-- What the review showed, kept at approval (live lines change once pieces move).
create table public.stock_count_line (
  count_id     uuid not null references public.stock_count (id),
  location_id  uuid not null references public.location (id),
  piece_id     uuid not null references public.piece (id),
  kind         text not null check (kind in ('cocok', 'hilang', 'pindah', 'belum_di_rak', 'jenis_salah', 'keluar', 'tidak_berlaku')),
  from_location_id uuid references public.location (id),
  primary key (count_id, location_id, piece_id)
);

alter table public.piece
  add column origin public.piece_origin not null default 'produksi',
  add column stock_count_id uuid references public.stock_count (id),
  alter column bundle_id drop not null,
  alter column batch_id drop not null,
  alter column finish_movement_id drop not null,
  add constraint piece_origin_shape check (
    case origin
      when 'produksi' then bundle_id is not null and batch_id is not null and finish_movement_id is not null
                           and stock_count_id is null
      else bundle_id is null and batch_id is null and finish_movement_id is null and stock_count_id is not null
    end
  );
create index piece_stock_count_idx on public.piece (stock_count_id) where stock_count_id is not null;

-- ---------------------------------------------------------------------------
-- Rack lock
-- ---------------------------------------------------------------------------
-- Any event that moves a piece onto or off a rack of an open count is refused. Approval
-- closes the count (is_open = false) before it moves pieces itself.
create function app.stock_count_lock()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_rack text;
  v_count text;
begin
  if new.type::text in ('masuk_rak', 'pindah_rak', 'keluar_rak', 'keluar', 'rework') then
    select l.code, c.code into v_rack, v_count
    from public.stock_count_location cl
    join public.location l on l.id = cl.location_id
    join public.stock_count c on c.id = cl.count_id
    where cl.is_open and cl.location_id in (new.from_location_id, new.to_location_id)
    limit 1;
    if v_rack is not null then
      raise exception 'Rak % sedang dihitung di stok opname %. Tunggu opname selesai.', v_rack, v_count
        using detail = 'rack_locked';
    end if;
  end if;
  return new;
end $$;

create trigger piece_event_stock_count_lock
before insert on public.piece_event
for each row execute function app.stock_count_lock();

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create function app.lock_stock_count(p_count_id uuid, p_statuses public.stock_count_status[])
returns public.stock_count
language plpgsql security definer set search_path = ''
as $$
declare
  c public.stock_count;
begin
  select * into c from public.stock_count where id = p_count_id for update;
  if not found then
    raise exception 'Stok opname tidak ditemukan.' using detail = 'not_found';
  end if;
  if not (c.status = any (p_statuses)) then
    raise exception 'Stok opname % sudah %.', c.code,
      case c.status when 'menghitung' then 'masih dihitung' when 'review' then 'menunggu review'
                    when 'disetujui' then 'disetujui' else 'dibatalkan' end
      using detail = 'wrong_status';
  end if;
  return c;
end $$;

-- The rack of a count, by code or QR token.
create function app.stock_count_rack(p_count public.stock_count, p_location text)
returns public.stock_count_location
language plpgsql security definer set search_path = ''
as $$
declare
  l public.location;
  cl public.stock_count_location;
begin
  l := app.find_location(p_location);
  select * into cl from public.stock_count_location
  where count_id = p_count.id and location_id = l.id for update;
  if not found then
    raise exception 'Rak % tidak termasuk stok opname %.', l.code, p_count.code using detail = 'rack_not_in_count';
  end if;
  return cl;
end $$;

create function app.stock_count_scanned(p_count_id uuid, p_location_id uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'pieces', (select count(*) from public.stock_count_scan
               where count_id = p_count_id and location_id = p_location_id and piece_id is not null),
    'unlabeled', (select coalesce(sum(qty), 0) from public.stock_count_scan
                  where count_id = p_count_id and location_id = p_location_id and piece_id is null),
    'last', coalesce((select jsonb_agg(x.code order by x.scanned_at desc) from (
               select p.code, s.scanned_at from public.stock_count_scan s join public.piece p on p.id = s.piece_id
               where s.count_id = p_count_id and s.location_id = p_location_id
               order by s.scanned_at desc limit 5) x), '[]'::jsonb)
  )
$$;

-- Review lines of a count, computed live (see header for the kinds).
create function app.stock_count_lines(p_count_id uuid)
returns table (location_id uuid, piece_id uuid, kind text, from_location_id uuid)
language sql stable security definer set search_path = ''
as $$
  with locs as (
    select cl.location_id, l.kind
    from public.stock_count_location cl join public.location l on l.id = cl.location_id
    where cl.count_id = p_count_id
  ),
  sc as (
    select s.location_id, s.piece_id from public.stock_count_scan s
    where s.count_id = p_count_id and s.piece_id is not null
  ),
  multi as (select sc.piece_id from sc group by sc.piece_id having count(*) > 1)
  select sc.location_id, sc.piece_id,
    case
      when p.status = 'keluar' then 'keluar'
      when p.status <> 'aktif' then 'tidak_berlaku'
      when sc.piece_id in (select m.piece_id from multi m) then 'ganda'
      when app.piece_sellable(p) <> (locs.kind = 'stok') then 'jenis_salah'
      when p.location_id = sc.location_id then 'cocok'
      when p.location_id is null then 'belum_di_rak'
      else 'pindah'
    end,
    case when p.location_id is distinct from sc.location_id then p.location_id end
  from sc
  join public.piece p on p.id = sc.piece_id
  join locs on locs.location_id = sc.location_id
  union all
  select p.location_id, p.id, 'hilang', null::uuid
  from public.piece p
  join locs on locs.location_id = p.location_id
  where p.status = 'aktif' and not exists (select 1 from sc where sc.piece_id = p.id)
$$;

-- ---------------------------------------------------------------------------
-- Counting
-- ---------------------------------------------------------------------------
create function app.stock_count_create(p_location_codes text[], p_note text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  u public.app_user := app.current_app_user();
  c public.stock_count;
  v_code text;
  l public.location;
  v_busy text;
  v_n integer := 0;
begin
  perform app.require_any_role(u, array['gudang', 'supervisor']::public.app_role[], 'membuat stok opname');
  if p_location_codes is null or coalesce(array_length(p_location_codes, 1), 0) = 0 then
    raise exception 'Pilih minimal satu rak.' using detail = 'racks_required';
  end if;

  insert into public.stock_count (note, created_by)
  values (nullif(trim(coalesce(p_note, '')), ''), u.id)
  returning * into c;

  foreach v_code in array p_location_codes loop
    l := app.find_location(v_code);
    select oc.code into v_busy
    from public.stock_count_location cl join public.stock_count oc on oc.id = cl.count_id
    where cl.location_id = l.id and cl.is_open;
    if v_busy is not null then
      raise exception 'Rak % sedang dihitung di stok opname %.', l.code, v_busy using detail = 'rack_busy';
    end if;
    insert into public.stock_count_location (count_id, location_id) values (c.id, l.id)
    on conflict do nothing;
    v_n := v_n + 1;
  end loop;

  return jsonb_build_object('id', c.id, 'code', c.code,
    'message', format('Stok opname %s dibuat untuk %s rak. Rak tersebut terkunci sampai opname selesai.', c.code, v_n));
end $$;

-- Blind count: the answer never says what the rack should hold.
create function app.stock_count_scan(p_count_id uuid, p_location text, p_code text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  u public.app_user := app.current_app_user();
  c public.stock_count;
  cl public.stock_count_location;
  p public.piece;
  v_code text := trim(p_code);
  v_rack text;
  v_note text;
begin
  perform app.require_any_role(u, array['gudang', 'supervisor']::public.app_role[], 'menghitung stok opname');
  c := app.lock_stock_count(p_count_id, array['menghitung']::public.stock_count_status[]);
  cl := app.stock_count_rack(c, p_location);
  v_rack := (select code from public.location where id = cl.location_id);
  if cl.status <> 'menghitung' then
    raise exception 'Rak % sudah ditutup. Minta supervisor membuka ulang untuk hitung ulang.', v_rack
      using detail = 'rack_closed';
  end if;

  select * into p from public.piece where qr_token = v_code or code = upper(v_code);
  if not found then
    if exists (select 1 from public.bundle where qr_token = v_code or code = upper(v_code)) then
      raise exception 'Ini label bundle. Saat opname, scan label pcs satu per satu.' using detail = 'bundle_label';
    end if;
    if exists (select 1 from public.location where qr_token = v_code or code = upper(v_code)) then
      raise exception 'Ini label rak. Tutup rak % dulu sebelum pindah rak.', v_rack using detail = 'rack_label';
    end if;
    raise exception 'Kode tidak dikenali. Barang tanpa label dicatat lewat "Barang tanpa label".' using detail = 'not_found';
  end if;

  insert into public.stock_count_scan (count_id, location_id, piece_id, scanned_by)
  values (c.id, cl.location_id, p.id, u.id)
  on conflict (count_id, location_id, piece_id) where piece_id is not null do nothing;
  if not found then
    return jsonb_build_object('code', p.code, 'duplicate', true,
      'message', format('Pcs %s sudah discan di rak ini.', p.code))
      || app.stock_count_scanned(c.id, cl.location_id);
  end if;

  v_note := case
    when p.status = 'keluar' then 'Pcs ini tercatat sudah keluar gudang. Pisahkan, supervisor akan mengecek.'
    when p.status <> 'aktif' then 'Label pcs ini tidak berlaku lagi. Pisahkan, supervisor akan mengecek.'
  end;
  return jsonb_build_object('code', p.code, 'duplicate', false, 'warning', v_note,
    'message', format('Pcs %s tercatat di rak %s.', p.code, v_rack))
    || app.stock_count_scanned(c.id, cl.location_id);
end $$;

create function app.stock_count_undo(p_count_id uuid, p_location text, p_code text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  u public.app_user := app.current_app_user();
  c public.stock_count;
  cl public.stock_count_location;
  p public.piece;
begin
  perform app.require_any_role(u, array['gudang', 'supervisor']::public.app_role[], 'menghitung stok opname');
  c := app.lock_stock_count(p_count_id, array['menghitung', 'review']::public.stock_count_status[]);
  cl := app.stock_count_rack(c, p_location);
  -- a closed rack (e.g. resolving a double scan in review) is the supervisor's call
  if cl.status <> 'menghitung' and not ('supervisor' = any (u.roles)) then
    raise exception 'Rak ini sudah ditutup. Minta supervisor membuka ulang.' using detail = 'rack_closed';
  end if;
  select * into p from public.piece where qr_token = trim(p_code) or code = upper(trim(p_code));
  delete from public.stock_count_scan
  where count_id = c.id and location_id = cl.location_id and piece_id = p.id;
  if not found then
    raise exception 'Pcs ini belum discan di rak ini.' using detail = 'not_scanned';
  end if;
  return jsonb_build_object('code', p.code, 'message', format('Scan pcs %s dihapus.', p.code))
    || app.stock_count_scanned(c.id, cl.location_id);
end $$;

-- Goods without a label: one line per variant and condition; qty 0 removes the line.
create function app.stock_count_unlabeled(
  p_count_id uuid, p_location text, p_variant_id uuid, p_condition public.piece_condition, p_qty integer
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  u public.app_user := app.current_app_user();
  c public.stock_count;
  cl public.stock_count_location;
  l public.location;
begin
  perform app.require_any_role(u, array['gudang', 'supervisor']::public.app_role[], 'menghitung stok opname');
  c := app.lock_stock_count(p_count_id, array['menghitung']::public.stock_count_status[]);
  cl := app.stock_count_rack(c, p_location);
  select * into l from public.location where id = cl.location_id;
  if cl.status <> 'menghitung' then
    raise exception 'Rak % sudah ditutup.', l.code using detail = 'rack_closed';
  end if;
  if p_variant_id is null or not exists (select 1 from public.product_variant where id = p_variant_id) then
    raise exception 'Pilih variant.' using detail = 'variant_required';
  end if;
  if p_condition is null then
    raise exception 'Pilih kondisi barang.' using detail = 'condition_required';
  end if;
  if (p_condition = 'baik') <> (l.kind = 'stok') then
    raise exception 'Barang % hanya dicatat di rak %. Rak % adalah rak %.',
      p_condition, case p_condition when 'baik' then 'stok' else 'reject' end, l.code, l.kind
      using detail = 'wrong_rack_kind';
  end if;
  if p_qty is null or p_qty < 0 or p_qty > 10000 then
    raise exception 'Jumlah harus antara 0 dan 10000.' using detail = 'qty_invalid';
  end if;

  if p_qty = 0 then
    delete from public.stock_count_scan
    where count_id = c.id and location_id = l.id and piece_id is null
      and variant_id = p_variant_id and condition = p_condition;
  else
    insert into public.stock_count_scan (count_id, location_id, variant_id, condition, qty, scanned_by)
    values (c.id, l.id, p_variant_id, p_condition, p_qty, u.id)
    on conflict (count_id, location_id, variant_id, condition) where piece_id is null
    do update set qty = excluded.qty, scanned_by = excluded.scanned_by, scanned_at = now();
  end if;

  return jsonb_build_object('message', case when p_qty = 0
      then 'Baris barang tanpa label dihapus.'
      else format('%s pcs barang tanpa label dicatat di rak %s.', p_qty, l.code) end)
    || app.stock_count_scanned(c.id, l.id);
end $$;

create function app.stock_count_close_location(p_count_id uuid, p_location text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  u public.app_user := app.current_app_user();
  c public.stock_count;
  cl public.stock_count_location;
  v_rack text;
  v_left integer;
begin
  perform app.require_any_role(u, array['gudang', 'supervisor']::public.app_role[], 'menghitung stok opname');
  c := app.lock_stock_count(p_count_id, array['menghitung']::public.stock_count_status[]);
  cl := app.stock_count_rack(c, p_location);
  v_rack := (select code from public.location where id = cl.location_id);
  if cl.status <> 'menghitung' then
    raise exception 'Rak % sudah ditutup.', v_rack using detail = 'rack_closed';
  end if;
  update public.stock_count_location set status = 'ditutup', closed_by = u.id, closed_at = now()
  where count_id = c.id and location_id = cl.location_id;

  select count(*) into v_left from public.stock_count_location where count_id = c.id and status = 'menghitung';
  if v_left = 0 then
    update public.stock_count set status = 'review' where id = c.id;
  end if;
  return jsonb_build_object('rack', v_rack, 'racks_left', v_left,
    'message', case when v_left = 0
      then format('Rak %s ditutup. Semua rak %s selesai dihitung, menunggu review supervisor.', v_rack, c.code)
      else format('Rak %s ditutup. %s rak lagi.', v_rack, v_left) end);
end $$;

create function app.stock_count_reopen_location(p_count_id uuid, p_location text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  u public.app_user := app.current_app_user();
  c public.stock_count;
  cl public.stock_count_location;
  v_rack text;
begin
  perform app.require_any_role(u, array['supervisor']::public.app_role[], 'membuka ulang rak opname');
  c := app.lock_stock_count(p_count_id, array['menghitung', 'review']::public.stock_count_status[]);
  cl := app.stock_count_rack(c, p_location);
  v_rack := (select code from public.location where id = cl.location_id);
  delete from public.stock_count_scan where count_id = c.id and location_id = cl.location_id;
  update public.stock_count_location set status = 'menghitung', closed_by = null, closed_at = null
  where count_id = c.id and location_id = cl.location_id;
  update public.stock_count set status = 'menghitung' where id = c.id;
  return jsonb_build_object('rack', v_rack,
    'message', format('Rak %s dibuka ulang. Scan sebelumnya dihapus, silakan hitung ulang.', v_rack));
end $$;

-- ---------------------------------------------------------------------------
-- Review, approve, cancel
-- ---------------------------------------------------------------------------
create function app.stock_count_review(p_count_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  u public.app_user := app.current_app_user();
  c public.stock_count;
begin
  perform app.require_any_role(u, array['supervisor', 'admin']::public.app_role[], 'melihat hasil stok opname');
  select * into c from public.stock_count where id = p_count_id;
  if not found then
    raise exception 'Stok opname tidak ditemukan.' using detail = 'not_found';
  end if;

  return jsonb_build_object(
    'id', c.id, 'code', c.code, 'status', c.status,
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'location_id', x.location_id, 'kind', x.kind,
        'piece_id', p.id, 'code', p.code, 'grade', p.grade, 'condition', p.condition, 'status', p.status,
        'variant_id', p.variant_id,
        'from_code', (select code from public.location where id = x.from_location_id),
        'outbound_code', (select code from public.outbound where id = p.outbound_id))
        order by x.kind, p.code)
      from (
        select l.location_id, l.piece_id, l.kind, l.from_location_id from app.stock_count_lines(c.id) l
        where c.status in ('menghitung', 'review')
        union all
        select s.location_id, s.piece_id, s.kind, s.from_location_id from public.stock_count_line s
        where s.count_id = c.id and c.status = 'disetujui'
      ) x
      join public.piece p on p.id = x.piece_id
    ), '[]'::jsonb),
    'unlabeled', coalesce((
      select jsonb_agg(jsonb_build_object('location_id', s.location_id, 'variant_id', s.variant_id,
        'condition', s.condition, 'qty', s.qty) order by s.location_id)
      from public.stock_count_scan s where s.count_id = c.id and s.piece_id is null
    ), '[]'::jsonb)
  );
end $$;

create function app.stock_count_approve(p_count_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  u public.app_user := app.current_app_user();
  c public.stock_count;
  v_ganda integer;
  v_missing uuid[];
  o public.outbound;
  r record;
  v_note text;
  v_new integer := 0;
begin
  perform app.require_any_role(u, array['supervisor']::public.app_role[], 'menyetujui stok opname');
  c := app.lock_stock_count(p_count_id, array['review']::public.stock_count_status[]);
  v_note := format('Stok opname %s', c.code);

  -- freeze the lines, pieces locked
  perform 1 from public.piece p
  where p.id in (select l.piece_id from app.stock_count_lines(c.id) l) for update;
  select count(distinct l.piece_id) into v_ganda from app.stock_count_lines(c.id) l where l.kind = 'ganda';
  if v_ganda > 0 then
    raise exception '% pcs discan di lebih dari satu rak. Hapus scan yang salah atau hitung ulang raknya dulu.', v_ganda
      using detail = 'duplicates';
  end if;

  insert into public.stock_count_line (count_id, location_id, piece_id, kind, from_location_id)
  select c.id, l.location_id, l.piece_id, l.kind, l.from_location_id from app.stock_count_lines(c.id) l;

  update public.stock_count_location cl set
    expected   = (select count(*) from public.piece p where p.location_id = cl.location_id and p.status = 'aktif'),
    matched    = (select count(*) from public.stock_count_line s where s.count_id = c.id and s.location_id = cl.location_id and s.kind = 'cocok'),
    missing    = (select count(*) from public.stock_count_line s where s.count_id = c.id and s.location_id = cl.location_id and s.kind = 'hilang'),
    moved_in   = (select count(*) from public.stock_count_line s where s.count_id = c.id and s.location_id = cl.location_id and s.kind in ('pindah', 'belum_di_rak')),
    wrong_kind = (select count(*) from public.stock_count_line s where s.count_id = c.id and s.location_id = cl.location_id and s.kind = 'jenis_salah'),
    findings   = (select count(*) from public.stock_count_line s where s.count_id = c.id and s.location_id = cl.location_id and s.kind in ('keluar', 'tidak_berlaku')),
    unlabeled  = (select coalesce(sum(qty), 0) from public.stock_count_scan s where s.count_id = c.id and s.location_id = cl.location_id and s.piece_id is null),
    is_open    = false
  where cl.count_id = c.id;

  -- the racks are unlocked from here on; the moves below are the count's own
  update public.stock_count set status = 'disetujui', approved_by = u.id, approved_at = now() where id = c.id;

  -- hilang: released from any draft document, then out on one adjustment document
  select array_agg(piece_id) into v_missing from public.stock_count_line where count_id = c.id and kind = 'hilang';
  if v_missing is not null then
    insert into public.piece_event (piece_id, type, outbound_id, note, created_by)
    select p.id, 'lepas_pesan', p.outbound_id, v_note || ': pcs hilang', u.id
    from public.piece p where p.id = any (v_missing) and p.outbound_id is not null;
    delete from public.outbound_item i
    using public.piece p
    where p.id = i.piece_id and p.id = any (v_missing) and i.returned_at is null and i.outbound_id = p.outbound_id;
    update public.piece set outbound_id = null where id = any (v_missing);

    insert into public.outbound (type, destination, note, created_by)
    values ('penyesuaian', v_note, format('Hilang saat %s', v_note), u.id)
    returning * into o;
    insert into public.outbound_item (outbound_id, piece_id, added_by)
    select o.id, unnest(v_missing), u.id;
    insert into public.piece_event (piece_id, type, from_location_id, outbound_id, note, created_by)
    select p.id, 'keluar', p.location_id, o.id, v_note || ': hilang', u.id
    from public.piece p where p.id = any (v_missing);
    update public.piece set status = 'keluar', location_id = null, outbound_id = o.id where id = any (v_missing);
    update public.outbound set status = 'dikirim', shipped_by = u.id, shipped_at = now() where id = o.id;
    update public.stock_count set outbound_id = o.id where id = c.id;
  end if;

  -- pindah / belum di rak: onto the counted rack
  for r in
    select s.location_id, s.piece_id, s.kind, p.location_id as current_location
    from public.stock_count_line s join public.piece p on p.id = s.piece_id
    where s.count_id = c.id and s.kind in ('pindah', 'belum_di_rak')
  loop
    insert into public.piece_event (piece_id, type, from_location_id, to_location_id, note, created_by)
    values (r.piece_id, case when r.current_location is null then 'masuk_rak'::public.piece_event_type
                             else 'pindah_rak'::public.piece_event_type end,
            r.current_location, r.location_id, v_note, u.id);
    update public.piece set location_id = r.location_id where id = r.piece_id;
  end loop;

  -- jenis rak salah: off the rack, to be put away on the right kind
  insert into public.piece_event (piece_id, type, from_location_id, note, created_by)
  select p.id, 'keluar_rak', p.location_id, v_note || ': jenis rak salah', u.id
  from public.stock_count_line s join public.piece p on p.id = s.piece_id
  where s.count_id = c.id and s.kind = 'jenis_salah' and p.location_id is not null;
  update public.piece p set location_id = null
  from public.stock_count_line s
  where s.piece_id = p.id and s.count_id = c.id and s.kind = 'jenis_salah';

  -- barang tanpa label: new stok awal pieces on the rack, labels to print
  for r in
    select s.location_id, s.variant_id, s.condition, s.qty
    from public.stock_count_scan s where s.count_id = c.id and s.piece_id is null
  loop
    with ins as (
      insert into public.piece (origin, stock_count_id, grade, condition, variant_id, location_id)
      select 'stok_awal', c.id, 'baik', r.condition, r.variant_id, r.location_id
      from generate_series(1, r.qty)
      returning id
    )
    insert into public.piece_event (piece_id, type, to_location_id, note, created_by)
    select id, 'stok_awal', r.location_id, v_note, u.id from ins;
    v_new := v_new + r.qty;
  end loop;

  return jsonb_build_object(
    'code', c.code,
    'missing', coalesce(array_length(v_missing, 1), 0),
    'outbound_code', o.code,
    'created', v_new,
    'message', format('Stok opname %s disetujui.%s%s', c.code,
      case when v_missing is not null then format(' %s pcs hilang dikeluarkan lewat %s.', array_length(v_missing, 1), o.code) else '' end,
      case when v_new > 0 then format(' %s pcs stok awal dibuat, cetak labelnya di Antrian label.', v_new) else '' end)
  );
end $$;

create function app.stock_count_cancel(p_count_id uuid, p_note text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  u public.app_user := app.current_app_user();
  c public.stock_count;
begin
  perform app.require_any_role(u, array['supervisor']::public.app_role[], 'membatalkan stok opname');
  if p_note is null or length(trim(p_note)) = 0 then
    raise exception 'Alasan pembatalan wajib diisi.' using detail = 'note_required';
  end if;
  c := app.lock_stock_count(p_count_id, array['menghitung', 'review']::public.stock_count_status[]);
  update public.stock_count_location set is_open = false where count_id = c.id;
  update public.stock_count set status = 'batal', cancelled_by = u.id, cancelled_at = now(), cancel_note = trim(p_note)
  where id = c.id;
  return jsonb_build_object('code', c.code, 'message', format('Stok opname %s dibatalkan. Raknya tidak terkunci lagi.', c.code));
end $$;

-- ---------------------------------------------------------------------------
-- Public wrappers and access
-- ---------------------------------------------------------------------------
create function public.stock_count_create(p_location_codes text[], p_note text)
returns jsonb language sql security invoker set search_path = ''
as $$ select app.stock_count_create(p_location_codes, p_note) $$;

create function public.stock_count_scan(p_count_id uuid, p_location text, p_code text)
returns jsonb language sql security invoker set search_path = ''
as $$ select app.stock_count_scan(p_count_id, p_location, p_code) $$;

create function public.stock_count_undo(p_count_id uuid, p_location text, p_code text)
returns jsonb language sql security invoker set search_path = ''
as $$ select app.stock_count_undo(p_count_id, p_location, p_code) $$;

create function public.stock_count_unlabeled(
  p_count_id uuid, p_location text, p_variant_id uuid, p_condition public.piece_condition, p_qty integer
)
returns jsonb language sql security invoker set search_path = ''
as $$ select app.stock_count_unlabeled(p_count_id, p_location, p_variant_id, p_condition, p_qty) $$;

create function public.stock_count_close_location(p_count_id uuid, p_location text)
returns jsonb language sql security invoker set search_path = ''
as $$ select app.stock_count_close_location(p_count_id, p_location) $$;

create function public.stock_count_reopen_location(p_count_id uuid, p_location text)
returns jsonb language sql security invoker set search_path = ''
as $$ select app.stock_count_reopen_location(p_count_id, p_location) $$;

create function public.stock_count_review(p_count_id uuid)
returns jsonb language sql stable security invoker set search_path = ''
as $$ select app.stock_count_review(p_count_id) $$;

create function public.stock_count_approve(p_count_id uuid)
returns jsonb language sql security invoker set search_path = ''
as $$ select app.stock_count_approve(p_count_id) $$;

create function public.stock_count_cancel(p_count_id uuid, p_note text)
returns jsonb language sql security invoker set search_path = ''
as $$ select app.stock_count_cancel(p_count_id, p_note) $$;

alter table public.stock_count          enable row level security;
alter table public.stock_count_location enable row level security;
alter table public.stock_count_scan     enable row level security;
alter table public.stock_count_line     enable row level security;
create policy "staff read" on public.stock_count          for select to authenticated using ((select app.is_active_user()));
create policy "staff read" on public.stock_count_location for select to authenticated using ((select app.is_active_user()));
create policy "staff read" on public.stock_count_scan     for select to authenticated using ((select app.is_active_user()));
create policy "staff read" on public.stock_count_line     for select to authenticated using ((select app.is_active_user()));
revoke all on public.stock_count, public.stock_count_location, public.stock_count_scan, public.stock_count_line from anon, authenticated;
revoke all on sequence public.stock_count_code_seq from anon, authenticated;
grant select on public.stock_count, public.stock_count_location, public.stock_count_scan, public.stock_count_line to authenticated;

revoke all on function
  app.stock_count_lock(), app.lock_stock_count(uuid, public.stock_count_status[]),
  app.stock_count_rack(public.stock_count, text), app.stock_count_scanned(uuid, uuid), app.stock_count_lines(uuid),
  app.stock_count_create(text[], text), app.stock_count_scan(uuid, text, text), app.stock_count_undo(uuid, text, text),
  app.stock_count_unlabeled(uuid, text, uuid, public.piece_condition, integer),
  app.stock_count_close_location(uuid, text), app.stock_count_reopen_location(uuid, text),
  app.stock_count_review(uuid), app.stock_count_approve(uuid), app.stock_count_cancel(uuid, text),
  public.stock_count_create(text[], text), public.stock_count_scan(uuid, text, text), public.stock_count_undo(uuid, text, text),
  public.stock_count_unlabeled(uuid, text, uuid, public.piece_condition, integer),
  public.stock_count_close_location(uuid, text), public.stock_count_reopen_location(uuid, text),
  public.stock_count_review(uuid), public.stock_count_approve(uuid), public.stock_count_cancel(uuid, text)
from public, anon;
grant execute on function
  app.stock_count_create(text[], text), app.stock_count_scan(uuid, text, text), app.stock_count_undo(uuid, text, text),
  app.stock_count_unlabeled(uuid, text, uuid, public.piece_condition, integer),
  app.stock_count_close_location(uuid, text), app.stock_count_reopen_location(uuid, text),
  app.stock_count_review(uuid), app.stock_count_approve(uuid), app.stock_count_cancel(uuid, text),
  public.stock_count_create(text[], text), public.stock_count_scan(uuid, text, text), public.stock_count_undo(uuid, text, text),
  public.stock_count_unlabeled(uuid, text, uuid, public.piece_condition, integer),
  public.stock_count_close_location(uuid, text), public.stock_count_reopen_location(uuid, text),
  public.stock_count_review(uuid), public.stock_count_approve(uuid), public.stock_count_cancel(uuid, text)
to authenticated;

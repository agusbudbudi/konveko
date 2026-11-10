-- Fase 2b: outbound documents (surat jalan), returns, stock adjustments, business profile.
--
-- A piece leaves the warehouse only through an outbound document:
--   draft    pieces are reserved (piece.outbound_id); still in stock and on their rack
--   dikirim  pieces become status 'keluar' and leave their rack (event 'keluar')
--   batal    a dropped draft; its pieces are released
-- A shipped piece comes back with piece_return: status 'aktif' again, not on a rack,
-- condition 'baik' (sellable) or 'rusak' (reject rack, sold as BS or written off).
--
-- Production reconciliation does not change: a shipped piece still counts as produced.
-- Invariants (tested):
--   per bundle: sum(stock_ledger.qty) = 'baik' pieces with status aktif or keluar
--   per bundle: reject                = 'reject' pieces with status aktif or keluar
--   warehouse stock = status 'aktif' pieces only (stock_location)
--   a piece is on at most one live outbound item (returned_at is null)
--   piece.outbound_id = the document of its live item, if any

-- ---------------------------------------------------------------------------
-- Types and tables
-- ---------------------------------------------------------------------------
create type public.piece_condition as enum ('baik', 'rusak');
create type public.outbound_type as enum ('jual', 'jual_bs', 'kirim_toko', 'sampel', 'penyesuaian');
create type public.outbound_status as enum ('draft', 'dikirim', 'batal');

create sequence public.outbound_code_seq;

create table public.outbound (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique default 'SJ-' || lpad(nextval('public.outbound_code_seq')::text, 6, '0'),
  type          public.outbound_type not null,
  destination   text not null check (length(trim(destination)) between 1 and 120),
  ref_no        text check (ref_no is null or length(ref_no) <= 60),
  note          text check (note is null or length(note) <= 500),
  status        public.outbound_status not null default 'draft',
  created_by    uuid not null references public.app_user (id),
  created_at    timestamptz not null default now(),
  shipped_by    uuid references public.app_user (id),
  shipped_at    timestamptz,
  cancelled_by  uuid references public.app_user (id),
  cancelled_at  timestamptz,
  constraint outbound_shipped check ((status = 'dikirim') = (shipped_at is not null)),
  constraint outbound_cancelled check ((status = 'batal') = (cancelled_at is not null)),
  constraint outbound_adjustment_note check (type <> 'penyesuaian' or length(trim(coalesce(note, ''))) > 0)
);
create index outbound_status_idx on public.outbound (status, created_at desc);

-- Optional target per variant (an order): progress shows while scanning, overshoot only warns.
create table public.outbound_plan (
  outbound_id  uuid not null references public.outbound (id) on delete cascade,
  variant_id   uuid not null references public.product_variant (id),
  qty          integer not null check (qty > 0 and qty <= 100000),
  primary key (outbound_id, variant_id)
);

create table public.outbound_item (
  id           uuid primary key default gen_random_uuid(),
  outbound_id  uuid not null references public.outbound (id),
  piece_id     uuid not null references public.piece (id),
  added_by     uuid not null references public.app_user (id),
  added_at     timestamptz not null default now(),
  returned_at  timestamptz,
  returned_by  uuid references public.app_user (id)
);
-- one live document per piece: a draft, or shipped and not returned
create unique index outbound_item_live_piece on public.outbound_item (piece_id) where returned_at is null;
create index outbound_item_outbound_idx on public.outbound_item (outbound_id);

alter table public.piece
  add column condition public.piece_condition not null default 'baik',
  add column outbound_id uuid references public.outbound (id);
create index piece_outbound_idx on public.piece (outbound_id) where outbound_id is not null;

alter table public.piece_event add column outbound_id uuid references public.outbound (id);

-- One row: the business identity printed on documents (logo, name, address).
create table public.business_profile (
  id          smallint primary key default 1 check (id = 1),
  name        text check (name is null or length(name) <= 120),
  address     text check (address is null or length(address) <= 300),
  phone       text check (phone is null or length(phone) <= 40),
  email       text check (email is null or length(email) <= 120),
  logo_path   text check (logo_path is null or length(logo_path) <= 300),
  updated_by  uuid references public.app_user (id),
  updated_at  timestamptz not null default now()
);
insert into public.business_profile (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
-- Sellable = good grade in good condition. Anything else is BS: reject rack,
-- and it can only leave on a jual_bs or penyesuaian document.
create function app.piece_sellable(p public.piece)
returns boolean
language sql immutable set search_path = ''
as $$ select p.grade = 'baik' and p.condition = 'baik' $$;

create function app.piece_class_label(p public.piece)
returns text
language sql immutable set search_path = ''
as $$ select case when p.grade = 'reject' then 'reject' when p.condition = 'rusak' then 'rusak' else 'baik' end $$;

-- Why a piece cannot be added to a document of this type (null = it can).
create function app.outbound_block(p_type public.outbound_type, p public.piece)
returns text
language sql immutable set search_path = ''
as $$
  select case
    when p.status = 'batal' then 'batal'
    when p.status = 'keluar' then 'sudah_keluar'
    when p.outbound_id is not null then 'dipesan'
    when p.printed_at is null then 'belum_cetak'
    when app.piece_sellable(p) and p_type = 'jual_bs' then 'bukan_bs'
    when not app.piece_sellable(p) and p_type not in ('jual_bs', 'penyesuaian') then 'bs'
  end
$$;

create function app.outbound_block_message(p_block text, p public.piece, p_outbound_id uuid)
returns text
language sql stable security definer set search_path = ''
as $$
  select case p_block
    when 'batal' then format('Pcs %s sudah dibatalkan. Buang labelnya.', p.code)
    when 'sudah_keluar' then format('Pcs %s sudah keluar di %s.', p.code,
      (select code from public.outbound where id = p.outbound_id))
    when 'dipesan' then case when p.outbound_id = p_outbound_id
      then format('Pcs %s sudah ada di dokumen ini.', p.code)
      else format('Pcs %s sudah ada di dokumen %s.', p.code, (select code from public.outbound where id = p.outbound_id)) end
    when 'belum_cetak' then format('Label pcs %s belum dicetak.', p.code)
    when 'bukan_bs' then format('Pcs %s barang baik. Dokumen jual BS hanya untuk barang reject atau rusak.', p.code)
    when 'bs' then format('Pcs %s barang %s. Barang BS hanya bisa keluar lewat dokumen jual BS atau penyesuaian.',
      p.code, app.piece_class_label(p))
  end
$$;

-- Planned vs scanned per variant for one document (live items only).
create function app.outbound_progress(p_outbound_id uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'variant_id', v.id, 'sku', v.sku,
           'label', v.product_name || ' ' || v.size || ' · ' || v.color,
           'planned', coalesce(pl.qty, 0), 'scanned', coalesce(sc.n, 0))
         order by v.product_name, v.sku), '[]'::jsonb)
  from public.product_variant v
  left join public.outbound_plan pl on pl.outbound_id = p_outbound_id and pl.variant_id = v.id
  left join (
    select p.variant_id, count(*)::int as n
    from public.outbound_item i join public.piece p on p.id = i.piece_id
    where i.outbound_id = p_outbound_id and i.returned_at is null
    group by p.variant_id
  ) sc on sc.variant_id = v.id
  where pl.qty is not null or sc.n is not null
$$;

create function app.lock_draft(p_outbound_id uuid, p_user public.app_user)
returns public.outbound
language plpgsql security definer set search_path = ''
as $$
declare
  o public.outbound;
begin
  select * into o from public.outbound where id = p_outbound_id for update;
  if not found then
    raise exception 'Dokumen tidak ditemukan.' using detail = 'not_found';
  end if;
  if o.status <> 'draft' then
    raise exception 'Dokumen % sudah %.', o.code, case o.status when 'dikirim' then 'dikirim' else 'dibatalkan' end
      using detail = 'not_draft';
  end if;
  if o.type = 'penyesuaian' then
    perform app.require_any_role(p_user, array['supervisor']::public.app_role[], 'mengubah penyesuaian stok');
  end if;
  return o;
end $$;

-- ---------------------------------------------------------------------------
-- Outbound documents
-- ---------------------------------------------------------------------------
create function app.outbound_create(p_type public.outbound_type, p_destination text, p_ref_no text, p_note text, p_plan jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  u public.app_user := app.current_app_user();
  o public.outbound;
  it jsonb;
begin
  if p_type = 'penyesuaian' then
    perform app.require_any_role(u, array['supervisor']::public.app_role[], 'membuat penyesuaian stok');
    if length(trim(coalesce(p_note, ''))) = 0 then
      raise exception 'Alasan penyesuaian wajib diisi.' using detail = 'note_required';
    end if;
  else
    perform app.require_any_role(u, array['gudang', 'supervisor']::public.app_role[], 'membuat dokumen barang keluar');
  end if;
  if length(trim(coalesce(p_destination, ''))) = 0 then
    raise exception 'Tujuan wajib diisi.' using detail = 'destination_required';
  end if;

  insert into public.outbound (type, destination, ref_no, note, created_by)
  values (p_type, trim(p_destination), nullif(trim(coalesce(p_ref_no, '')), ''), nullif(trim(coalesce(p_note, '')), ''), u.id)
  returning * into o;

  if p_plan is not null and jsonb_typeof(p_plan) = 'array' then
    for it in select * from jsonb_array_elements(p_plan) loop
      if coalesce((it->>'qty')::int, 0) > 0 then
        insert into public.outbound_plan (outbound_id, variant_id, qty)
        values (o.id, (it->>'variant_id')::uuid, (it->>'qty')::int)
        on conflict (outbound_id, variant_id) do update set qty = public.outbound_plan.qty + excluded.qty;
      end if;
    end loop;
  end if;
  return jsonb_build_object('id', o.id, 'code', o.code);
end $$;

-- Add a piece, or every eligible piece of a bundle, to a draft.
create function app.outbound_add(p_outbound_id uuid, p_code text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  u public.app_user := app.current_app_user();
  v_code text := trim(p_code);
  o public.outbound;
  p public.piece;
  b public.bundle;
  v_block text;
  v_ids uuid[];
  v_skipped jsonb := '{}'::jsonb;
  v_skipped_n integer := 0;
  v_label text;
  v_over text;
begin
  perform app.require_any_role(u, array['gudang', 'supervisor']::public.app_role[], 'mengisi dokumen barang keluar');
  o := app.lock_draft(p_outbound_id, u);

  select * into p from public.piece where qr_token = v_code or code = upper(v_code) for update;
  if found then
    v_block := app.outbound_block(o.type, p);
    if v_block is not null then
      raise exception '%', app.outbound_block_message(v_block, p, o.id) using detail = v_block;
    end if;
    v_ids := array[p.id];
    v_label := format('Pcs %s', p.code);
  else
    select * into b from public.bundle where qr_token = v_code or code = upper(v_code);
    if not found then
      raise exception 'Kode tidak dikenali. Scan label pcs atau bundle.' using detail = 'not_found';
    end if;
    select array_agg(id order by code) into v_ids from (
      select pp.id, pp.code from public.piece pp
      where pp.bundle_id = b.id and pp.status = 'aktif' and app.outbound_block(o.type, pp) is null
      for update
    ) s;
    select coalesce(jsonb_object_agg(k, n), '{}'::jsonb), coalesce(sum(n), 0)::int
    into v_skipped, v_skipped_n
    from (
      select app.outbound_block(o.type, pp) as k, count(*)::int as n
      from public.piece pp
      where pp.bundle_id = b.id and pp.status <> 'batal' and app.outbound_block(o.type, pp) is not null
      group by 1
    ) s;
    if v_ids is null then
      raise exception 'Tidak ada pcs bundle % yang bisa masuk dokumen ini (% pcs dilewati).', b.code, v_skipped_n
        using detail = 'nothing_to_add';
    end if;
    v_label := format('Bundle %s', b.code);
  end if;

  insert into public.outbound_item (outbound_id, piece_id, added_by)
  select o.id, unnest(v_ids), u.id;
  insert into public.piece_event (piece_id, type, from_location_id, outbound_id, created_by)
  select pc.id, 'dipesan', pc.location_id, o.id, u.id from public.piece pc where pc.id = any (v_ids);
  update public.piece set outbound_id = o.id where id = any (v_ids);

  -- overshoot of the plan only warns
  select string_agg(format('%s %s/%s', x->>'label', x->>'scanned', x->>'planned'), ', ')
  into v_over
  from jsonb_array_elements(app.outbound_progress(o.id)) x
  where (x->>'planned')::int > 0 and (x->>'scanned')::int > (x->>'planned')::int;

  return jsonb_build_object(
    'added', array_length(v_ids, 1),
    'skipped', v_skipped,
    'skipped_count', v_skipped_n,
    'message', format('%s: %s pcs masuk %s.%s', v_label, array_length(v_ids, 1), o.code,
      case when v_skipped_n > 0 then format(' %s pcs dilewati.', v_skipped_n) else '' end),
    'warning', case when v_over is not null then 'Melebihi rencana: ' || v_over end,
    'progress', app.outbound_progress(o.id),
    'total', (select count(*) from public.outbound_item where outbound_id = o.id and returned_at is null)
  );
end $$;

create function app.outbound_remove(p_outbound_id uuid, p_code text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  u public.app_user := app.current_app_user();
  o public.outbound;
  p public.piece;
begin
  perform app.require_any_role(u, array['gudang', 'supervisor']::public.app_role[], 'mengisi dokumen barang keluar');
  o := app.lock_draft(p_outbound_id, u);
  select * into p from public.piece where qr_token = trim(p_code) or code = upper(trim(p_code)) for update;
  if not found or p.outbound_id is distinct from o.id then
    raise exception 'Pcs ini tidak ada di dokumen %.', o.code using detail = 'not_in_document';
  end if;
  delete from public.outbound_item where outbound_id = o.id and piece_id = p.id and returned_at is null;
  insert into public.piece_event (piece_id, type, outbound_id, created_by) values (p.id, 'lepas_pesan', o.id, u.id);
  update public.piece set outbound_id = null where id = p.id;
  return jsonb_build_object(
    'code', p.code, 'message', format('Pcs %s dihapus dari %s.', p.code, o.code),
    'progress', app.outbound_progress(o.id),
    'total', (select count(*) from public.outbound_item where outbound_id = o.id and returned_at is null)
  );
end $$;

-- Ship a draft: every reserved piece leaves the warehouse. All or nothing.
create function app.outbound_ship(p_outbound_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  u public.app_user := app.current_app_user();
  o public.outbound;
  v_n integer;
begin
  perform app.require_any_role(u, array['gudang', 'supervisor']::public.app_role[], 'mengirim barang keluar');
  o := app.lock_draft(p_outbound_id, u);
  perform 1 from public.piece where outbound_id = o.id for update;
  select count(*) into v_n from public.outbound_item where outbound_id = o.id and returned_at is null;
  if v_n = 0 then
    raise exception 'Dokumen % masih kosong. Scan barangnya dulu.' , o.code using detail = 'empty';
  end if;

  insert into public.piece_event (piece_id, type, from_location_id, outbound_id, created_by)
  select p.id, 'keluar', p.location_id, o.id, u.id
  from public.piece p join public.outbound_item i on i.piece_id = p.id
  where i.outbound_id = o.id and i.returned_at is null;

  update public.piece p set status = 'keluar', location_id = null
  from public.outbound_item i
  where i.piece_id = p.id and i.outbound_id = o.id and i.returned_at is null;

  update public.outbound set status = 'dikirim', shipped_by = u.id, shipped_at = now() where id = o.id;

  return jsonb_build_object(
    'code', o.code, 'shipped', v_n,
    'message', case when o.type = 'penyesuaian'
      then format('%s: %s pcs dikeluarkan dari stok.', o.code, v_n)
      else format('%s: %s pcs dikirim ke %s.', o.code, v_n, o.destination) end
  );
end $$;

create function app.outbound_cancel(p_outbound_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  u public.app_user := app.current_app_user();
  o public.outbound;
  v_ids uuid[];
begin
  perform app.require_any_role(u, array['gudang', 'supervisor']::public.app_role[], 'membatalkan dokumen barang keluar');
  o := app.lock_draft(p_outbound_id, u);
  select array_agg(piece_id) into v_ids from public.outbound_item where outbound_id = o.id and returned_at is null;
  if v_ids is not null then
    insert into public.piece_event (piece_id, type, outbound_id, note, created_by)
    select unnest(v_ids), 'lepas_pesan', o.id, 'Dokumen dibatalkan', u.id;
    update public.piece set outbound_id = null where id = any (v_ids);
    delete from public.outbound_item where outbound_id = o.id and returned_at is null;
  end if;
  update public.outbound set status = 'batal', cancelled_by = u.id, cancelled_at = now() where id = o.id;
  return jsonb_build_object('code', o.code, 'released', coalesce(array_length(v_ids, 1), 0),
    'message', format('%s dibatalkan.', o.code));
end $$;

-- A shipped piece comes back: in stock again, not on a rack yet.
create function app.piece_return(p_code text, p_condition public.piece_condition, p_note text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  u public.app_user := app.current_app_user();
  p public.piece;
  v_doc text;
begin
  perform app.require_any_role(u, array['gudang', 'supervisor']::public.app_role[], 'menerima retur');
  if length(trim(coalesce(p_note, ''))) = 0 then
    raise exception 'Alasan retur wajib diisi.' using detail = 'note_required';
  end if;
  select * into p from public.piece where qr_token = trim(p_code) or code = upper(trim(p_code)) for update;
  if not found then
    raise exception 'Pcs tidak ditemukan.' using detail = 'not_found';
  end if;
  if p.status <> 'keluar' then
    raise exception 'Pcs % tidak sedang di luar gudang.', p.code using detail = 'not_shipped';
  end if;
  v_doc := (select code from public.outbound where id = p.outbound_id);

  update public.outbound_item set returned_at = now(), returned_by = u.id
  where piece_id = p.id and returned_at is null;
  insert into public.piece_event (piece_id, type, outbound_id, note, created_by)
  values (p.id, 'retur', p.outbound_id, format('Kondisi %s. %s', p_condition, trim(p_note)), u.id);
  update public.piece set status = 'aktif', location_id = null, condition = p_condition, outbound_id = null
  where id = p.id;

  return jsonb_build_object(
    'code', p.code, 'from', v_doc, 'condition', p_condition,
    'message', format('Pcs %s kembali dari %s (%s). Masukkan ke rak %s.', p.code, v_doc, p_condition,
      case when p.grade = 'baik' and p_condition = 'baik' then 'stok' else 'reject' end)
  );
end $$;

-- ---------------------------------------------------------------------------
-- Existing functions that must respect reservations, shipments and condition
-- ---------------------------------------------------------------------------
-- Corrections never void a reserved or shipped piece.
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
begin
  p_target := coalesce(p_target, 0);
  -- shipped pieces were produced too: they count toward the movement's result
  select count(*) into v_have from public.piece
  where finish_movement_id = p_movement.id and grade = p_grade and status in ('aktif', 'keluar');

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

-- Rack kind follows sellable (good grade, good condition), not grade alone.
create or replace function app.putaway(p_location text, p_code text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  u public.app_user := app.current_app_user();
  v_code text := trim(p_code);
  l public.location;
  p public.piece;
  b public.bundle;
  v_sellable boolean;
  v_ids uuid[];
  v_unprinted integer;
  v_other integer;
begin
  perform app.require_any_role(u, array['gudang', 'supervisor']::public.app_role[], 'memasukkan barang ke rak');
  l := app.find_location(p_location);
  v_sellable := l.kind = 'stok';

  select * into p from public.piece where qr_token = v_code or code = upper(v_code) for update;
  if found then
    if p.status = 'keluar' then
      raise exception 'Pcs % sudah keluar di %. Terima dulu lewat retur.', p.code,
        (select code from public.outbound where id = p.outbound_id) using detail = 'piece_shipped';
    end if;
    if p.status <> 'aktif' then
      raise exception 'Pcs % sudah dibatalkan. Buang labelnya.', p.code using detail = 'piece_void';
    end if;
    if app.piece_sellable(p) <> v_sellable then
      raise exception 'Pcs % adalah barang %, tidak bisa masuk rak % (%).',
        p.code, app.piece_class_label(p), l.code, l.kind using detail = 'wrong_rack_kind';
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
    select pp.id, pp.printed_at from public.piece pp
    where pp.bundle_id = b.id and pp.status = 'aktif' and pp.location_id is null
      and app.piece_sellable(pp) = v_sellable
    for update
  ) s;

  if v_ids is null then
    select count(*) into v_other from public.piece
    where bundle_id = b.id and status = 'aktif' and location_id is null;
    if v_other > 0 then
      raise exception 'Bundle % masih punya % pcs %, bukan barang untuk rak % (%).',
        b.code, v_other, case when v_sellable then 'reject atau rusak' else 'baik' end, l.code, l.kind
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
    'message', format('%s pcs %s bundle %s masuk rak %s.', array_length(v_ids, 1),
      case when v_sellable then 'baik' else 'reject/rusak' end, b.code, l.code)
  );
end $$;

-- A reserved piece stays on its rack until it ships.
create or replace function app.unshelve(p_code text, p_note text)
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
  if p.outbound_id is not null then
    raise exception 'Pcs % sedang dipesan di dokumen %. Hapus dulu dari dokumen.', p.code,
      (select code from public.outbound where id = p.outbound_id) using detail = 'reserved';
  end if;
  v_from := (select code from public.location where id = p.location_id);
  insert into public.piece_event (piece_id, type, from_location_id, note, created_by)
  values (p.id, 'keluar_rak', p.location_id, trim(p_note), u.id);
  update public.piece set location_id = null where id = p.id;
  return jsonb_build_object('code', p.code, 'message', format('Pcs %s dikeluarkan dari rak %s.', p.code, v_from));
end $$;

-- Warehouse lookup: also condition, reservation and shipment; bundle counts by sellable.
create or replace function app.warehouse_lookup(p_code text)
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
      'condition', p.condition, 'sellable', app.piece_sellable(p),
      'printed', p.printed_at is not null,
      'location_code', (select code from public.location where id = p.location_id),
      'outbound_code', (select code from public.outbound where id = p.outbound_id),
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
      'unshelved_baik', (select count(*) from public.piece pp
                         where pp.bundle_id = b.id and pp.status = 'aktif' and pp.location_id is null and app.piece_sellable(pp)),
      'unshelved_reject', (select count(*) from public.piece pp
                           where pp.bundle_id = b.id and pp.status = 'aktif' and pp.location_id is null and not app.piece_sellable(pp)),
      'unprinted', (select count(*) from public.piece
                    where bundle_id = b.id and status = 'aktif' and location_id is null and printed_at is null),
      'shelved', (select count(*) from public.piece
                  where bundle_id = b.id and status = 'aktif' and location_id is not null)
    );
  end if;

  raise exception 'Kode tidak dikenali. Scan QR rak, bundle, atau pcs.' using detail = 'not_found';
end $$;

-- ---------------------------------------------------------------------------
-- Views: stock counts damaged returns as reject (not sellable); same columns as before
-- ---------------------------------------------------------------------------
create or replace view public.stock_location
with (security_invoker = true) as
select
  p.variant_id,
  pv.sku,
  pv.product_name,
  pv.size,
  pv.color,
  (case when p.condition = 'rusak' then 'reject' else p.grade end)::public.piece_grade as grade,
  p.location_id,
  l.code as location_code,
  count(*)::int as qty
from public.piece p
join public.product_variant pv on pv.id = p.variant_id
left join public.location l on l.id = p.location_id
where p.status = 'aktif'
group by p.variant_id, pv.sku, pv.product_name, pv.size, pv.color,
         (case when p.condition = 'rusak' then 'reject' else p.grade end), p.location_id, l.code;

create or replace view public.bundle_unshelved
with (security_invoker = true) as
select
  b.id as bundle_id,
  b.code,
  b.variant_id,
  pb.code as batch_code,
  count(*) filter (where p.grade = 'baik' and p.condition = 'baik')::int as baik,
  count(*) filter (where p.grade = 'reject' or p.condition = 'rusak')::int as reject,
  count(*) filter (where p.printed_at is null)::int as unprinted,
  min(p.created_at) as since,
  ((now() at time zone 'Asia/Jakarta')::date - (min(p.created_at) at time zone 'Asia/Jakarta')::date)::int as days_waiting
from public.piece p
join public.bundle b on b.id = p.bundle_id
join public.production_batch pb on pb.id = b.batch_id
where p.status = 'aktif' and p.location_id is null
group by b.id, b.code, b.variant_id, pb.code;

-- ---------------------------------------------------------------------------
-- Public wrappers
-- ---------------------------------------------------------------------------
create function public.outbound_create(p_type public.outbound_type, p_destination text, p_ref_no text, p_note text, p_plan jsonb)
returns jsonb language sql security invoker set search_path = ''
as $$ select app.outbound_create(p_type, p_destination, p_ref_no, p_note, p_plan) $$;

create function public.outbound_add(p_outbound_id uuid, p_code text)
returns jsonb language sql security invoker set search_path = ''
as $$ select app.outbound_add(p_outbound_id, p_code) $$;

create function public.outbound_remove(p_outbound_id uuid, p_code text)
returns jsonb language sql security invoker set search_path = ''
as $$ select app.outbound_remove(p_outbound_id, p_code) $$;

create function public.outbound_ship(p_outbound_id uuid)
returns jsonb language sql security invoker set search_path = ''
as $$ select app.outbound_ship(p_outbound_id) $$;

create function public.outbound_cancel(p_outbound_id uuid)
returns jsonb language sql security invoker set search_path = ''
as $$ select app.outbound_cancel(p_outbound_id) $$;

create function public.outbound_progress(p_outbound_id uuid)
returns jsonb language sql stable security invoker set search_path = ''
as $$ select app.outbound_progress(p_outbound_id) $$;

create function public.piece_return(p_code text, p_condition public.piece_condition, p_note text)
returns jsonb language sql security invoker set search_path = ''
as $$ select app.piece_return(p_code, p_condition, p_note) $$;

-- ---------------------------------------------------------------------------
-- Access control: read for active staff; writes only through the functions above,
-- except the business profile, which admins edit directly.
-- ---------------------------------------------------------------------------
alter table public.outbound         enable row level security;
alter table public.outbound_plan    enable row level security;
alter table public.outbound_item    enable row level security;
alter table public.business_profile enable row level security;

create policy "staff read" on public.outbound         for select to authenticated using ((select app.is_active_user()));
create policy "staff read" on public.outbound_plan    for select to authenticated using ((select app.is_active_user()));
create policy "staff read" on public.outbound_item    for select to authenticated using ((select app.is_active_user()));
create policy "staff read" on public.business_profile for select to authenticated using ((select app.is_active_user()));
create policy "admin update" on public.business_profile for update to authenticated
  using ((select app.has_role('admin'))) with check ((select app.has_role('admin')));

revoke all on public.outbound, public.outbound_plan, public.outbound_item, public.business_profile from anon, authenticated;
revoke all on sequence public.outbound_code_seq from anon, authenticated;
grant select on public.outbound, public.outbound_plan, public.outbound_item, public.business_profile to authenticated;
grant update (name, address, phone, email, logo_path, updated_by, updated_at) on public.business_profile to authenticated;
-- stock views were replaced: keep their grants
revoke all on public.stock_location, public.bundle_unshelved from anon, authenticated;
grant select on public.stock_location, public.bundle_unshelved to authenticated;

revoke all on function
  app.piece_sellable(public.piece), app.piece_class_label(public.piece),
  app.outbound_block(public.outbound_type, public.piece), app.outbound_block_message(text, public.piece, uuid),
  app.outbound_progress(uuid), app.lock_draft(uuid, public.app_user),
  app.outbound_create(public.outbound_type, text, text, text, jsonb), app.outbound_add(uuid, text),
  app.outbound_remove(uuid, text), app.outbound_ship(uuid), app.outbound_cancel(uuid),
  app.piece_return(text, public.piece_condition, text),
  public.outbound_create(public.outbound_type, text, text, text, jsonb), public.outbound_add(uuid, text),
  public.outbound_remove(uuid, text), public.outbound_ship(uuid), public.outbound_cancel(uuid),
  public.outbound_progress(uuid), public.piece_return(text, public.piece_condition, text)
from public, anon;
grant execute on function
  app.outbound_progress(uuid),
  app.outbound_create(public.outbound_type, text, text, text, jsonb), app.outbound_add(uuid, text),
  app.outbound_remove(uuid, text), app.outbound_ship(uuid), app.outbound_cancel(uuid),
  app.piece_return(text, public.piece_condition, text),
  public.outbound_create(public.outbound_type, text, text, text, jsonb), public.outbound_add(uuid, text),
  public.outbound_remove(uuid, text), public.outbound_ship(uuid), public.outbound_cancel(uuid),
  public.outbound_progress(uuid), public.piece_return(text, public.piece_condition, text)
to authenticated;

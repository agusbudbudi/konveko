-- Konveko MVP: write path
-- Every write goes through a function in the private `app` schema
-- (SECURITY DEFINER, empty search_path, role check on auth.uid()).
-- Thin SECURITY INVOKER wrappers in `public` are what PostgREST exposes.
-- Error messages are user-facing Indonesian sentences; DETAIL carries a
-- machine-readable code for the client.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create function app.current_app_user()
returns public.app_user
language plpgsql stable security definer set search_path = ''
as $$
declare
  u public.app_user;
begin
  select * into u from public.app_user
  where id = (select auth.uid()) and is_active;
  if not found then
    raise exception 'Sesi tidak valid. Silakan login ulang.' using detail = 'unauthenticated';
  end if;
  return u;
end $$;

create function app.has_role(p_role public.app_role)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.app_user
    where id = (select auth.uid()) and is_active and p_role = any (roles)
  );
$$;

create function app.require_role(p_user public.app_user, p_role public.app_role, p_action text)
returns void
language plpgsql immutable set search_path = ''
as $$
begin
  if not (p_role = any (p_user.roles)) then
    raise exception 'Akun Anda tidak punya akses untuk %.', p_action using detail = 'forbidden_role';
  end if;
end $$;

create function app.status_label(p_status public.bundle_status)
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
  end;
$$;

-- Accepts either the QR token or the human-readable code (manual input).
create function app.find_bundle_for_update(p_code text)
returns public.bundle
language plpgsql security definer set search_path = ''
as $$
declare
  b public.bundle;
begin
  select * into b from public.bundle
  where qr_token = trim(p_code) or code = upper(trim(p_code))
  for update;
  if not found then
    raise exception 'Bundle tidak ditemukan. Cek lagi kodenya.' using detail = 'not_found';
  end if;
  return b;
end $$;

create function app.split_children_codes(p_bundle_id uuid)
returns text
language sql stable set search_path = ''
as $$
  select string_agg(code, ', ' order by code) from public.bundle where parent_bundle_id = p_bundle_id;
$$;

-- Sentence shown when a scan is not allowed in the current status (FR-17).
create function app.wrong_status_message(p_bundle public.bundle, p_action text)
returns text
language plpgsql stable set search_path = ''
as $$
begin
  return case
    when p_bundle.current_status = 'dipecah' then
      format('Label ini sudah tidak berlaku. Bundle %s dipecah menjadi %s.',
             p_bundle.code, app.split_children_codes(p_bundle.id))
    when p_bundle.current_status = 'ready_stock' then
      format('Bundle %s sudah masuk stok.', p_bundle.code)
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

create function app.check_version(p_bundle public.bundle, p_expected_version integer)
returns void
language plpgsql immutable set search_path = ''
as $$
begin
  if p_expected_version is not null and p_bundle.version <> p_expected_version then
    raise exception 'Bundle % baru saja diproses di perangkat lain. Scan lagi.', p_bundle.code
      using detail = 'version_conflict';
  end if;
end $$;

create function app.check_reason(p_reason_id uuid, p_type public.reason_type)
returns void
language plpgsql stable security definer set search_path = ''
as $$
begin
  if p_reason_id is null then
    raise exception 'Pilih alasan %.', p_type using detail = 'reason_required';
  end if;
  if not exists (
    select 1 from public.reason where id = p_reason_id and type = p_type and is_active
  ) then
    raise exception 'Alasan % tidak valid.', p_type using detail = 'reason_invalid';
  end if;
end $$;

-- Re-derive the bundle projection from the event log.
create function app.refresh_bundle(p_bundle_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update public.bundle b
  set current_status    = r.status,
      current_qty       = r.ref_qty,
      current_holder_id = r.holder_id,
      last_movement_at  = coalesce(r.last_movement_at, b.created_at),
      version           = b.version + 1
  from public.bundle_reconciliation r
  where r.bundle_id = b.id and b.id = p_bundle_id;
end $$;

-- BR-06. draft: no scan yet. selesai: every active bundle is ready_stock.
create function app.refresh_batch(p_batch_id uuid)
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
    where b.batch_id = p_batch_id and em.type not in ('cut', 'split')
  ) into v_any_scan;

  select bool_and(current_status = 'ready_stock') into v_all_ready
  from public.bundle
  where batch_id = p_batch_id and current_status <> 'dipecah';

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

-- ---------------------------------------------------------------------------
-- FR-05, FR-06: create batch with one bundle per variant
-- p_items: [{"variant_id": "...", "qty": 20}, ...]
-- ---------------------------------------------------------------------------
create function app.create_batch(p_fabric_roll_id uuid, p_items jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  u public.app_user := app.current_app_user();
  v_batch public.production_batch;
  v_item jsonb;
  v_qty integer;
  v_variant uuid;
  v_bundle public.bundle;
  v_bundles jsonb := '[]'::jsonb;
begin
  perform app.require_role(u, 'produksi', 'membuat batch');

  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Isi minimal satu variant hasil potong.' using detail = 'items_required';
  end if;
  if (select count(distinct x->>'variant_id') from jsonb_array_elements(p_items) x)
     <> jsonb_array_length(p_items) then
    raise exception 'Satu variant hanya boleh muncul sekali. Gunakan pecah bundle untuk membagi.'
      using detail = 'duplicate_variant';
  end if;

  insert into public.production_batch (fabric_roll_id, created_by)
  values (p_fabric_roll_id, u.id)
  returning * into v_batch;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_variant := (v_item->>'variant_id')::uuid;
    v_qty := (v_item->>'qty')::integer;
    if v_qty is null or v_qty <= 0 then
      raise exception 'Qty hasil potong harus lebih dari 0.' using detail = 'qty_invalid';
    end if;

    insert into public.bundle (batch_id, variant_id, target_qty, current_qty, current_holder_id)
    values (v_batch.id, v_variant, v_qty, v_qty, u.holder_id)
    returning * into v_bundle;

    insert into public.movement (bundle_id, type, to_holder_id, qty_sent, scanned_by)
    values (v_bundle.id, 'cut', u.holder_id, v_qty, u.id);

    perform app.refresh_bundle(v_bundle.id);
    v_bundles := v_bundles || jsonb_build_object('id', v_bundle.id, 'code', v_bundle.code, 'qty', v_qty);
  end loop;

  return jsonb_build_object('batch_id', v_batch.id, 'code', v_batch.code, 'bundles', v_bundles);
end $$;

-- ---------------------------------------------------------------------------
-- FR-07: split a bundle that has not been received yet
-- ---------------------------------------------------------------------------
create function app.split_bundle(p_code text, p_qtys integer[])
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

-- ---------------------------------------------------------------------------
-- FR-12, FR-18: lookup after a scan, read only
-- ---------------------------------------------------------------------------
create function app.scan_lookup(p_code text)
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
    'children', case when b.current_status = 'dipecah' then app.split_children_codes(b.id) end
  );
end $$;

-- ---------------------------------------------------------------------------
-- FR-13, FR-15: scan terima (jahit or finishing, decided by status)
-- ---------------------------------------------------------------------------
create function app.scan_receive(
  p_code text,
  p_qty_received integer,
  p_reason_id uuid default null,
  p_photo_path text default null,
  p_expected_version integer default null
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  u public.app_user := app.current_app_user();
  b public.bundle;
  v_type public.movement_type;
  v_sent integer;
  v_diff integer;
  v_movement_id uuid;
  v_from_step text;
  v_to_step text;
  v_message text;
begin
  b := app.find_bundle_for_update(p_code);
  perform app.check_version(b, p_expected_version);

  case b.current_status
    when 'siap_jahit' then
      perform app.require_role(u, 'penjahit', 'scan terima jahit');
      v_type := 'receive_sew'; v_from_step := 'produksi'; v_to_step := 'jahit';
    when 'siap_finishing' then
      perform app.require_role(u, 'finishing', 'scan terima finishing');
      v_type := 'receive_finishing'; v_from_step := 'jahit'; v_to_step := 'finishing';
    else
      raise exception '%', app.wrong_status_message(b, 'terima') using detail = 'wrong_status';
  end case;

  if u.holder_id is null then
    raise exception 'Akun Anda belum terhubung ke data penjahit atau tim finishing. Hubungi admin.'
      using detail = 'no_holder';
  end if;

  v_sent := b.current_qty;
  if p_qty_received is null or p_qty_received < 0 then
    raise exception 'Isi qty diterima.' using detail = 'qty_invalid';
  end if;
  if p_qty_received > v_sent then
    raise exception 'Qty diterima tidak boleh lebih dari qty kirim (% pcs). Jika fisik lebih banyak, lapor supervisor.',
      v_sent using detail = 'qty_over';
  end if;

  v_diff := v_sent - p_qty_received;
  if v_diff > 0 then
    perform app.check_reason(p_reason_id, 'selisih');
  end if;

  insert into public.movement (
    bundle_id, type, from_holder_id, to_holder_id, qty_sent, qty_received,
    reason_id, photo_path, scanned_by
  ) values (
    b.id, v_type, b.current_holder_id, u.holder_id, v_sent, p_qty_received,
    case when v_diff > 0 then p_reason_id end, p_photo_path, u.id
  ) returning id into v_movement_id;

  if v_diff > 0 then
    insert into public.discrepancy (bundle_id, movement_id, qty, from_step, to_step)
    values (b.id, v_movement_id, v_diff, v_from_step, v_to_step);
  end if;

  perform app.refresh_bundle(b.id);
  perform app.refresh_batch(b.batch_id);

  v_message := case when v_diff > 0
    then format('Bundle %s diterima. %s dari %s pcs, selisih %s.', b.code, p_qty_received, v_sent, v_diff)
    else format('Bundle %s diterima. %s pcs.', b.code, p_qty_received)
  end;

  return jsonb_build_object(
    'movement_id', v_movement_id,
    'code', b.code,
    'status', (select current_status from public.bundle where id = b.id),
    'qty_sent', v_sent,
    'qty_received', p_qty_received,
    'selisih', v_diff,
    'message', v_message
  );
end $$;

-- ---------------------------------------------------------------------------
-- FR-14, FR-16: scan selesai (jahit or finishing, decided by status)
-- ---------------------------------------------------------------------------
create function app.scan_finish(
  p_code text,
  p_qty_good integer,
  p_qty_reject integer,
  p_reason_id uuid default null,
  p_expected_version integer default null
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  u public.app_user := app.current_app_user();
  b public.bundle;
  v_type public.movement_type;
  v_in integer;
  v_movement_id uuid;
  v_message text;
begin
  b := app.find_bundle_for_update(p_code);
  perform app.check_version(b, p_expected_version);

  case b.current_status
    when 'proses_jahit' then
      perform app.require_role(u, 'penjahit', 'scan selesai jahit');
      v_type := 'finish_sew';
    when 'proses_finishing' then
      perform app.require_role(u, 'finishing', 'scan selesai finishing');
      v_type := 'finish_finishing';
    else
      raise exception '%', app.wrong_status_message(b, 'selesai') using detail = 'wrong_status';
  end case;

  if b.current_holder_id is distinct from u.holder_id then
    raise exception 'Bundle % sedang dipegang %. Hanya pemegang bundle yang bisa scan selesai.',
      b.code, coalesce((select name from public.holder where id = b.current_holder_id), '-')
      using detail = 'wrong_holder';
  end if;

  v_in := b.current_qty;
  if p_qty_good is null or p_qty_reject is null or p_qty_good < 0 or p_qty_reject < 0 then
    raise exception 'Isi qty jadi dan qty reject.' using detail = 'qty_invalid';
  end if;
  if p_qty_good + p_qty_reject <> v_in then
    raise exception 'Jumlah jadi + reject (%) harus sama dengan qty diterima (% pcs).',
      p_qty_good + p_qty_reject, v_in using detail = 'qty_mismatch';
  end if;
  if p_qty_reject > 0 then
    perform app.check_reason(p_reason_id, 'reject');
  end if;

  insert into public.movement (
    bundle_id, type, from_holder_id, to_holder_id, qty_received, qty_good, qty_reject,
    reason_id, scanned_by
  ) values (
    b.id, v_type, u.holder_id, u.holder_id, v_in, p_qty_good, p_qty_reject,
    case when p_qty_reject > 0 then p_reason_id end, u.id
  ) returning id into v_movement_id;

  if v_type = 'finish_finishing' and p_qty_good > 0 then
    insert into public.stock_ledger (variant_id, qty, ref_type, ref_id, bundle_id, batch_id)
    values (b.variant_id, p_qty_good, 'movement', v_movement_id, b.id, b.batch_id);
  end if;

  perform app.refresh_bundle(b.id);
  perform app.refresh_batch(b.batch_id);

  v_message := format('Bundle %s selesai %s. %s %s, %s reject.',
    b.code,
    case v_type when 'finish_sew' then 'jahit' else 'finishing' end,
    p_qty_good,
    case v_type when 'finish_sew' then 'jadi' else 'lolos QC' end,
    p_qty_reject);

  return jsonb_build_object(
    'movement_id', v_movement_id,
    'code', b.code,
    'status', (select current_status from public.bundle where id = b.id),
    'qty_good', p_qty_good,
    'qty_reject', p_qty_reject,
    'message', v_message
  );
end $$;

-- ---------------------------------------------------------------------------
-- FR-24: supervisor correction (latest effective step only)
-- p_void = true undoes the scan (status goes back one step).
-- Otherwise pass the new quantities for that step:
--   receive_*: p_qty_received      finish_*: p_qty_good + p_qty_reject
-- ---------------------------------------------------------------------------
create function app.correct_movement(
  p_movement_id uuid,
  p_note text,
  p_void boolean default false,
  p_qty_received integer default null,
  p_qty_good integer default null,
  p_qty_reject integer default null,
  p_reason_id uuid default null
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  u public.app_user := app.current_app_user();
  o public.movement;
  b public.bundle;
  cur record;
  v_latest uuid;
  v_new_received integer;
  v_new_good integer;
  v_new_reject integer;
  v_new_reason uuid;
  v_correction_id uuid;
  v_old_diff integer;
  v_new_diff integer;
  v_stock_delta integer;
begin
  perform app.require_role(u, 'supervisor', 'koreksi qty');
  if p_note is null or length(trim(p_note)) = 0 then
    raise exception 'Alasan koreksi wajib diisi.' using detail = 'note_required';
  end if;

  select * into o from public.movement where id = p_movement_id;
  if not found or o.type not in ('receive_sew', 'finish_sew', 'receive_finishing', 'finish_finishing') then
    raise exception 'Hanya scan terima atau selesai yang bisa dikoreksi.' using detail = 'not_correctable';
  end if;

  select * into b from public.bundle where id = o.bundle_id for update;

  select * into cur from public.effective_movement where id = o.id;
  if not found then
    raise exception 'Scan ini sudah dibatalkan sebelumnya.' using detail = 'already_void';
  end if;

  select id into v_latest from public.effective_movement
  where bundle_id = b.id order by seq desc limit 1;
  if v_latest <> o.id then
    raise exception 'Hanya scan terakhir bundle % yang bisa dikoreksi. Batalkan scan sesudahnya dulu.', b.code
      using detail = 'not_latest';
  end if;

  if p_void then
    v_new_received := null; v_new_good := null; v_new_reject := null; v_new_reason := null;
  elsif o.type in ('receive_sew', 'receive_finishing') then
    if p_qty_received is null or p_qty_received < 0 or p_qty_received > cur.qty_sent then
      raise exception 'Qty diterima harus antara 0 dan % pcs.', cur.qty_sent using detail = 'qty_invalid';
    end if;
    v_new_received := p_qty_received;
    v_new_reason := case when p_qty_received < cur.qty_sent then coalesce(p_reason_id, cur.reason_id) end;
    if p_qty_received < cur.qty_sent then
      perform app.check_reason(v_new_reason, 'selisih');
    end if;
  else
    if p_qty_good is null or p_qty_reject is null or p_qty_good < 0 or p_qty_reject < 0
       or p_qty_good + p_qty_reject <> cur.qty_received then
      raise exception 'Jumlah jadi + reject harus sama dengan qty diterima (% pcs).', cur.qty_received
        using detail = 'qty_mismatch';
    end if;
    v_new_received := cur.qty_received;
    v_new_good := p_qty_good;
    v_new_reject := p_qty_reject;
    v_new_reason := case when p_qty_reject > 0 then coalesce(p_reason_id, cur.reason_id) end;
    if p_qty_reject > 0 then
      perform app.check_reason(v_new_reason, 'reject');
    end if;
  end if;

  insert into public.movement (
    bundle_id, type, corrects_movement_id, is_void, qty_sent, qty_received, qty_good, qty_reject,
    reason_id, note, scanned_by
  ) values (
    b.id, 'correction', o.id, p_void, cur.qty_sent, v_new_received, v_new_good, v_new_reject,
    v_new_reason, trim(p_note), u.id
  ) returning id into v_correction_id;

  -- Audit log (old vs new, per field)
  insert into public.audit_log (entity, entity_id, field, old_value, new_value, reason, changed_by)
  select 'movement', o.id, f.field, f.old_value, f.new_value, trim(p_note), u.id
  from (values
    ('is_void',      'false',                   p_void::text),
    ('qty_received', cur.qty_received::text,    v_new_received::text),
    ('qty_good',     cur.qty_good::text,        v_new_good::text),
    ('qty_reject',   cur.qty_reject::text,      v_new_reject::text),
    ('reason_id',    cur.reason_id::text,       v_new_reason::text)
  ) as f(field, old_value, new_value)
  where f.old_value is distinct from f.new_value;

  -- Keep the discrepancy flag in line with the corrected receive.
  if o.type in ('receive_sew', 'receive_finishing') then
    v_old_diff := cur.qty_sent - cur.qty_received;
    v_new_diff := case when p_void then 0 else cur.qty_sent - v_new_received end;
    if exists (select 1 from public.discrepancy where movement_id = o.id) then
      update public.discrepancy
      set qty = v_new_diff,
          status = case when v_new_diff = 0 then 'selesai'::public.discrepancy_status else status end,
          resolved_by = case when v_new_diff = 0 then u.id else resolved_by end,
          resolved_at = case when v_new_diff = 0 then coalesce(resolved_at, now()) else resolved_at end,
          note = concat_ws(' | ', note, 'Koreksi: ' || trim(p_note))
      where movement_id = o.id;
    elsif v_new_diff > 0 then
      insert into public.discrepancy (bundle_id, movement_id, qty, from_step, to_step, note)
      values (b.id, o.id, v_new_diff,
              case o.type when 'receive_sew' then 'produksi' else 'jahit' end,
              case o.type when 'receive_sew' then 'jahit' else 'finishing' end,
              'Koreksi: ' || trim(p_note));
    end if;
  end if;

  -- Keep stock in line with the corrected finishing result.
  if o.type = 'finish_finishing' then
    v_stock_delta := coalesce(v_new_good, 0) - coalesce(cur.qty_good, 0);
    if v_stock_delta <> 0 then
      insert into public.stock_ledger (variant_id, qty, ref_type, ref_id, bundle_id, batch_id)
      values (b.variant_id, v_stock_delta, 'correction', v_correction_id, b.id, b.batch_id);
    end if;
  end if;

  perform app.refresh_bundle(b.id);
  perform app.refresh_batch(b.batch_id);

  return jsonb_build_object(
    'correction_id', v_correction_id,
    'code', b.code,
    'status', (select current_status from public.bundle where id = b.id),
    'message', case when p_void
      then format('Scan bundle %s dibatalkan.', b.code)
      else format('Scan bundle %s dikoreksi.', b.code) end
  );
end $$;

-- ---------------------------------------------------------------------------
-- FR-22a: close a discrepancy flag (does not change numbers)
-- ---------------------------------------------------------------------------
create function app.resolve_discrepancy(p_discrepancy_id uuid, p_note text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  u public.app_user := app.current_app_user();
begin
  perform app.require_role(u, 'supervisor', 'menyelesaikan flag selisih');
  if p_note is null or length(trim(p_note)) = 0 then
    raise exception 'Catatan wajib diisi.' using detail = 'note_required';
  end if;
  update public.discrepancy
  set status = 'selesai', resolved_by = u.id, resolved_at = now(),
      note = concat_ws(' | ', note, trim(p_note))
  where id = p_discrepancy_id and status = 'terbuka';
  if not found then
    raise exception 'Flag selisih tidak ditemukan atau sudah selesai.' using detail = 'not_found';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Public wrappers (exposed through PostgREST as /rpc/<name>)
-- ---------------------------------------------------------------------------
create function public.create_batch(p_fabric_roll_id uuid, p_items jsonb)
returns jsonb language sql security invoker set search_path = ''
as $$ select app.create_batch(p_fabric_roll_id, p_items) $$;

create function public.split_bundle(p_code text, p_qtys integer[])
returns jsonb language sql security invoker set search_path = ''
as $$ select app.split_bundle(p_code, p_qtys) $$;

create function public.scan_lookup(p_code text)
returns jsonb language sql stable security invoker set search_path = ''
as $$ select app.scan_lookup(p_code) $$;

create function public.scan_receive(
  p_code text, p_qty_received integer, p_reason_id uuid default null,
  p_photo_path text default null, p_expected_version integer default null
)
returns jsonb language sql security invoker set search_path = ''
as $$ select app.scan_receive(p_code, p_qty_received, p_reason_id, p_photo_path, p_expected_version) $$;

create function public.scan_finish(
  p_code text, p_qty_good integer, p_qty_reject integer,
  p_reason_id uuid default null, p_expected_version integer default null
)
returns jsonb language sql security invoker set search_path = ''
as $$ select app.scan_finish(p_code, p_qty_good, p_qty_reject, p_reason_id, p_expected_version) $$;

create function public.correct_movement(
  p_movement_id uuid, p_note text, p_void boolean default false,
  p_qty_received integer default null, p_qty_good integer default null,
  p_qty_reject integer default null, p_reason_id uuid default null
)
returns jsonb language sql security invoker set search_path = ''
as $$ select app.correct_movement(p_movement_id, p_note, p_void, p_qty_received, p_qty_good, p_qty_reject, p_reason_id) $$;

create function public.resolve_discrepancy(p_discrepancy_id uuid, p_note text)
returns void language sql security invoker set search_path = ''
as $$ select app.resolve_discrepancy(p_discrepancy_id, p_note) $$;

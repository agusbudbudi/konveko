-- FR-10: a batch can be edited while it is still draft (no bundle received yet).
--
--   edit_bundle(code, qty, variant, note)   change the cut qty and/or the variant of one bundle
--   add_bundle_to_batch(batch, variant, qty) a variant that was forgotten at cutting
--
-- Bundles from a split (and split parents) cannot be edited: the batch target must keep
-- equalling what was cut (the root bundles), which the split already fixed.
-- Nothing is deleted. A qty change is a 'correction' row on the bundle's 'cut' movement, so
-- the bundle history shows it, and every field change goes to audit_log. The bundle label
-- shows variant and qty, so the caller is told to reprint it.

create function app.require_draft_batch(p_batch_id uuid)
returns public.production_batch
language plpgsql security definer set search_path = ''
as $$
declare
  pb public.production_batch;
begin
  select * into pb from public.production_batch where id = p_batch_id for update;
  if not found then
    raise exception 'Batch tidak ditemukan.' using detail = 'not_found';
  end if;
  if pb.status <> 'draft' then
    raise exception 'Batch % sudah berjalan. Batch hanya bisa diubah sebelum ada bundle yang diterima.', pb.code
      using detail = 'batch_not_draft';
  end if;
  return pb;
end $$;

-- A variant appears once per batch among the bundles that were cut (split children share it).
create function app.check_variant_free(p_batch_id uuid, p_variant_id uuid, p_except_bundle uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_code text;
begin
  if not exists (select 1 from public.product_variant where id = p_variant_id) then
    raise exception 'Variant tidak ditemukan.' using detail = 'not_found';
  end if;
  select b.code into v_code
  from public.bundle b
  where b.batch_id = p_batch_id and b.variant_id = p_variant_id and b.parent_bundle_id is null
    and b.id is distinct from p_except_bundle
  limit 1;
  if v_code is not null then
    raise exception 'Variant ini sudah ada di batch (bundle %). Ubah qty bundle itu saja.', v_code
      using detail = 'duplicate_variant';
  end if;
end $$;

create function app.variant_label(p_variant_id uuid)
returns text
language sql stable security definer set search_path = ''
as $$
  select product_name || ' ' || size || ' ' || color from public.product_variant where id = p_variant_id
$$;

create function app.edit_bundle(p_code text, p_qty integer, p_variant_id uuid, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  u public.app_user := app.current_app_user();
  b public.bundle;
  pb public.production_batch;
  v_cut public.movement;
  v_qty integer;
  v_variant uuid;
  v_changes text[] := '{}';
  v_note text;
begin
  perform app.require_role(u, 'produksi', 'mengubah batch');
  b := app.find_bundle_for_update(p_code);
  pb := app.require_draft_batch(b.batch_id);

  if b.parent_bundle_id is not null or b.current_status = 'dipecah' then
    raise exception 'Bundle % hasil pecah, jadi qty dan variantnya tidak bisa diubah lagi.', b.code
      using detail = 'bundle_split';
  end if;
  -- draft batch already implies this; kept so a bundle-level rule never depends on batch state alone
  if b.current_status <> 'siap_jahit' then
    raise exception '%', app.wrong_status_message(b, 'diubah') using detail = 'wrong_status';
  end if;

  v_qty := coalesce(p_qty, b.target_qty);
  v_variant := coalesce(p_variant_id, b.variant_id);
  if v_qty <= 0 or v_qty > 100000 then
    raise exception 'Qty hasil potong harus lebih dari 0.' using detail = 'qty_invalid';
  end if;
  if v_qty = b.target_qty and v_variant = b.variant_id then
    raise exception 'Tidak ada yang berubah.' using detail = 'no_change';
  end if;
  if v_variant <> b.variant_id then
    perform app.check_variant_free(b.batch_id, v_variant, b.id);
    v_changes := v_changes || ('variant ' || app.variant_label(b.variant_id) || ' → ' || app.variant_label(v_variant));
  end if;
  if v_qty <> b.target_qty then
    v_changes := v_changes || ('qty ' || b.target_qty || ' → ' || v_qty);
  end if;
  v_note := 'Ubah batch draft: ' || array_to_string(v_changes, ', ')
            || coalesce('. ' || nullif(trim(p_note), ''), '');

  select * into v_cut from public.movement
  where bundle_id = b.id and type = 'cut'
  order by seq limit 1;

  -- correction row on the cut: the history shows the new qty and why
  insert into public.movement (bundle_id, type, corrects_movement_id, qty_sent, scanned_by, note)
  values (b.id, 'correction', v_cut.id, v_qty, u.id, v_note);

  insert into public.audit_log (entity, entity_id, field, old_value, new_value, reason, changed_by)
  select 'bundle', b.id, f.field, f.old_value, f.new_value, v_note, u.id
  from (values
    ('target_qty', b.target_qty::text, v_qty::text),
    ('variant_id', b.variant_id::text, v_variant::text)
  ) as f(field, old_value, new_value)
  where f.old_value is distinct from f.new_value;

  update public.bundle set target_qty = v_qty, variant_id = v_variant where id = b.id;
  perform app.refresh_bundle(b.id);

  return jsonb_build_object(
    'bundle_id', b.id,
    'code', b.code,
    'qty', v_qty,
    'variant', app.variant_label(v_variant),
    'message', 'Bundle ' || b.code || ' diubah. Cetak ulang labelnya.'
  );
end $$;

create function app.add_bundle_to_batch(p_batch_id uuid, p_variant_id uuid, p_qty integer)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  u public.app_user := app.current_app_user();
  pb public.production_batch;
  v_bundle public.bundle;
begin
  perform app.require_role(u, 'produksi', 'mengubah batch');
  pb := app.require_draft_batch(p_batch_id);
  if p_qty is null or p_qty <= 0 or p_qty > 100000 then
    raise exception 'Qty hasil potong harus lebih dari 0.' using detail = 'qty_invalid';
  end if;
  perform app.check_variant_free(pb.id, p_variant_id, null);

  -- same as create_batch
  insert into public.bundle (batch_id, variant_id, target_qty, current_qty, current_holder_id)
  values (pb.id, p_variant_id, p_qty, p_qty, u.holder_id)
  returning * into v_bundle;

  insert into public.movement (bundle_id, type, to_holder_id, qty_sent, scanned_by, note)
  values (v_bundle.id, 'cut', u.holder_id, p_qty, u.id, 'Ditambahkan ke batch draft');

  insert into public.audit_log (entity, entity_id, field, old_value, new_value, reason, changed_by)
  values ('production_batch', pb.id, 'bundle_added', null, v_bundle.code, 'Ubah batch draft: tambah ' || app.variant_label(p_variant_id) || ' ' || p_qty || ' pcs', u.id);

  perform app.refresh_bundle(v_bundle.id);
  return jsonb_build_object(
    'bundle_id', v_bundle.id,
    'code', v_bundle.code,
    'qty', p_qty,
    'message', 'Bundle ' || v_bundle.code || ' ditambahkan. Cetak labelnya.'
  );
end $$;

create function public.edit_bundle(p_code text, p_qty integer, p_variant_id uuid, p_note text default null)
returns jsonb language sql security invoker set search_path = ''
as $$ select app.edit_bundle(p_code, p_qty, p_variant_id, p_note) $$;

create function public.add_bundle_to_batch(p_batch_id uuid, p_variant_id uuid, p_qty integer)
returns jsonb language sql security invoker set search_path = ''
as $$ select app.add_bundle_to_batch(p_batch_id, p_variant_id, p_qty) $$;

revoke all on function
  app.require_draft_batch(uuid),
  app.check_variant_free(uuid, uuid, uuid),
  app.variant_label(uuid),
  app.edit_bundle(text, integer, uuid, text),
  app.add_bundle_to_batch(uuid, uuid, integer),
  public.edit_bundle(text, integer, uuid, text),
  public.add_bundle_to_batch(uuid, uuid, integer)
from public, anon;
grant execute on function
  app.edit_bundle(text, integer, uuid, text),
  app.add_bundle_to_batch(uuid, uuid, integer),
  public.edit_bundle(text, integer, uuid, text),
  public.add_bundle_to_batch(uuid, uuid, integer)
to authenticated;

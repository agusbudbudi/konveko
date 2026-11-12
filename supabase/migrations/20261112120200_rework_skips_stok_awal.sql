-- Rework (20261112110100) meets stok opname (20261112120100): a stok awal piece has no
-- bundle, batch or finish movement, so it cannot become part of a rework bundle (which is a
-- child of a production bundle). create_rework now skips it with a reason instead of
-- dropping it silently. Same function otherwise.

create or replace function app.create_rework(p_codes text[], p_start_step public.rework_step, p_note text)
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
      when p.origin = 'stok_awal' then 'Pcs stok awal tidak punya bundle produksi, jadi tidak bisa dirework. Keluarkan lewat jual BS atau penyesuaian.'
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

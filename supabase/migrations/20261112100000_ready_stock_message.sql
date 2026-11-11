-- "Bundle X sudah masuk stok" dated from the MVP, when Ready stock meant the
-- goods were in stock. Since Fase 2a a Ready stock bundle still needs piece
-- labels and putaway by gudang, so the message now says where it really is.

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

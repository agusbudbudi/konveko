-- Reporting: production activity in a date range (weekly / monthly / custom).
--
-- Everything is computed from effective_movement, so supervisor corrections
-- are applied and voided scans are gone. A scan belongs to the day it was
-- originally made (Asia/Jakarta), even if it was corrected later.
-- Dates are inclusive: p_from 00:00 WIB up to the end of p_to.

create function app.production_report(p_from date, p_to date)
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
    select e.*, b.variant_id, b.batch_id, (e.scanned_at at time zone 'Asia/Jakarta')::date as day
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
      coalesce(sum(qty_good) filter (where type = 'finish_finishing'), 0)::int             as ready,
      coalesce(sum(qty_reject) filter (where type = 'finish_finishing'), 0)::int           as qc_reject,
      coalesce(sum(qty_sent - qty_received) filter (where type in ('receive_sew', 'receive_finishing')), 0)::int as selisih,
      count(*) filter (where type in ('receive_sew', 'receive_finishing') and qty_received < qty_sent)::int as selisih_events
    from em
  ),
  lead as (
    -- batch created -> finishing done, for bundles finished in the range
    select
      count(*)::int as bundles,
      round(percentile_cont(0.5) within group (order by extract(epoch from em.scanned_at - pb.created_at) / 86400)::numeric, 1) as median_days,
      round(percentile_cont(0.9) within group (order by extract(epoch from em.scanned_at - pb.created_at) / 86400)::numeric, 1) as p90_days
    from em join public.production_batch pb on pb.id = em.batch_id
    where em.type = 'finish_finishing'
  ),
  daily as (
    select d::date as day,
      coalesce(sum(em.qty_sent) filter (where em.type = 'cut'), 0)::int as cut,
      coalesce(sum(em.qty_good) filter (where em.type = 'finish_finishing'), 0)::int as ready,
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
      coalesce(sum(em.qty_good) filter (where em.type = 'finish_finishing'), 0)::int as ready,
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
                       where d.created_at >= v_start and d.created_at < v_end and d.status = 'terbuka')
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

create function public.production_report(p_from date, p_to date)
returns jsonb language sql stable security invoker set search_path = ''
as $$ select app.production_report(p_from, p_to) $$;

revoke all on function app.production_report(date, date), public.production_report(date, date) from public, anon;
grant execute on function app.production_report(date, date), public.production_report(date, date) to authenticated;

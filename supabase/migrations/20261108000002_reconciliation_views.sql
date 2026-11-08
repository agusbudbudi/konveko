-- Konveko MVP: derived state
-- Everything here is computed from public.movement. All views use
-- security_invoker so the caller's RLS applies.

-- Effective movement = original movement with its latest correction applied.
-- Voided originals are dropped. Correction rows themselves are not listed.
create view public.effective_movement
with (security_invoker = true) as
select
  o.id,
  o.seq,
  o.bundle_id,
  o.type,
  o.from_holder_id,
  o.to_holder_id,
  case when c.id is null then o.qty_sent     else c.qty_sent     end as qty_sent,
  case when c.id is null then o.qty_received else c.qty_received end as qty_received,
  case when c.id is null then o.qty_good     else c.qty_good     end as qty_good,
  case when c.id is null then o.qty_reject   else c.qty_reject   end as qty_reject,
  case when c.id is null then o.reason_id    else c.reason_id    end as reason_id,
  o.scanned_by,
  o.scanned_at,
  c.id as correction_id
from public.movement o
left join lateral (
  select m.*
  from public.movement m
  where m.corrects_movement_id = o.id
  order by m.seq desc
  limit 1
) c on true
where o.type <> 'correction'
  and coalesce(c.is_void, false) = false;

-- Per-bundle reconciliation (BR-01..BR-04).
-- Invariant for every active bundle:
--   target = ready + reject + wip_menunggu + wip_dikerjakan + selisih
create view public.bundle_reconciliation
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
derived as (
  select
    b.id as bundle_id,
    b.code,
    b.batch_id,
    b.variant_id,
    b.target_qty,
    s.rs_sent, s.rs_received, s.fs_good, s.fs_reject,
    s.rf_sent, s.rf_received, s.ff_good, s.ff_reject,
    s.last_movement_at,
    last.to_holder_id as derived_holder_id,
    case
      when exists (select 1 from public.bundle ch where ch.parent_bundle_id = b.id)
        then 'dipecah'::public.bundle_status
      else case last.type
        when 'receive_sew'       then 'proses_jahit'::public.bundle_status
        when 'finish_sew'        then 'siap_finishing'::public.bundle_status
        when 'receive_finishing' then 'proses_finishing'::public.bundle_status
        when 'finish_finishing'  then 'ready_stock'::public.bundle_status
        else 'siap_jahit'::public.bundle_status
      end
    end as derived_status
  from public.bundle b
  left join steps s on s.bundle_id = b.id
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
  d.derived_status <> 'dipecah'         as is_active,
  d.derived_holder_id                   as holder_id,
  d.target_qty,
  coalesce(d.ff_good, 0)                as ready,
  coalesce(d.fs_reject, 0) + coalesce(d.ff_reject, 0) as reject,
  case d.derived_status
    when 'siap_jahit'     then d.target_qty
    when 'siap_finishing' then d.fs_good
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
    when 'siap_finishing'   then d.fs_good
    when 'proses_finishing' then d.rf_received
    when 'ready_stock'      then d.ff_good
    else 0
  end                                   as ref_qty,
  d.last_movement_at
from derived d;

-- Per batch + variant, active bundles only (split parents excluded).
create view public.batch_variant_reconciliation
with (security_invoker = true) as
select
  r.batch_id,
  r.variant_id,
  count(*)                          as bundle_count,
  sum(r.target_qty)::int            as target,
  sum(r.ready)::int                 as ready,
  sum(r.reject)::int                as reject,
  sum(r.wip_menunggu)::int          as wip_menunggu,
  sum(r.wip_dikerjakan)::int        as wip_dikerjakan,
  sum(r.wip_menunggu + r.wip_dikerjakan)::int as wip,
  sum(r.selisih)::int               as selisih
from public.bundle_reconciliation r
where r.is_active
group by r.batch_id, r.variant_id;

create view public.batch_reconciliation
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
    where b.batch_id = pb.id and d.status = 'terbuka')::int as open_discrepancies
from public.production_batch pb
left join public.batch_variant_reconciliation v on v.batch_id = pb.id
group by pb.id;

-- FR-19: ready stock per variant.
create view public.stock_ready
with (security_invoker = true) as
select
  pv.id as variant_id,
  pv.sku,
  pv.product_name,
  pv.size,
  pv.color,
  coalesce(sum(sl.qty), 0)::int as qty
from public.product_variant pv
left join public.stock_ledger sl on sl.variant_id = pv.id
group by pv.id;

-- FR-25: WIP list with days since last scan.
create view public.wip_list
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
  floor(extract(epoch from (now() - b.last_movement_at)) / 86400)::int as days_since_last_scan
from public.bundle b
join public.production_batch pb on pb.id = b.batch_id
left join public.holder h on h.id = b.current_holder_id
where b.current_status not in ('ready_stock', 'dipecah');

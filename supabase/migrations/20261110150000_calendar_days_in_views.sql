-- Day counts in views follow the Jakarta calendar, not elapsed 24-hour blocks.
-- Before: floor((now() - ts) / 86400) said "0 days" for a scan at 20:00 yesterday seen at
-- 10:00 today. Now: today's date minus that day's date, both in Asia/Jakarta, so it is 1.
-- Same rule as calendarDaysAgo() in lib/date.ts. Column names, types and order are unchanged.

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
  ((now() at time zone 'Asia/Jakarta')::date - (b.last_movement_at at time zone 'Asia/Jakarta')::date)::int as days_since_last_scan
from public.bundle b
join public.production_batch pb on pb.id = b.batch_id
left join public.holder h on h.id = b.current_holder_id
where b.current_status not in ('ready_stock', 'dipecah');

create or replace view public.bundle_unshelved
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
  ((now() at time zone 'Asia/Jakarta')::date - (min(p.created_at) at time zone 'Asia/Jakarta')::date)::int as days_waiting
from public.piece p
join public.bundle b on b.id = p.bundle_id
join public.production_batch pb on pb.id = b.batch_id
where p.status = 'aktif' and p.location_id is null
group by b.id, b.code, b.variant_id, pb.code;

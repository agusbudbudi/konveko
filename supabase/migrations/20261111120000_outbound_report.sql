-- Reporting: goods that left the warehouse in a date range (Fase 2b).
--
-- Shipped = pieces on documents shipped in the range (by shipped_at, Asia/Jakarta),
-- including pieces that came back later: they did leave. Returns are counted by the day
-- of the 'retur' event, separately. Penyesuaian (write-offs) are not sales and are
-- reported on their own. Dates are inclusive, like production_report.

create function app.outbound_report(p_from date, p_to date)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  u public.app_user := app.current_app_user();
  v_start timestamptz;
  v_end timestamptz;
  v_result jsonb;
begin
  perform app.require_any_role(u, array['admin', 'supervisor', 'produksi', 'gudang']::public.app_role[], 'melihat laporan');
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'Pilih tanggal awal dan akhir yang benar.' using detail = 'range_invalid';
  end if;
  if p_to - p_from > 366 then
    raise exception 'Rentang laporan maksimal satu tahun.' using detail = 'range_too_long';
  end if;

  v_start := p_from::timestamp at time zone 'Asia/Jakarta';
  v_end := (p_to + 1)::timestamp at time zone 'Asia/Jakarta';

  with shipped as (
    select o.id as outbound_id, o.type, o.destination, p.variant_id
    from public.outbound o
    join public.outbound_item i on i.outbound_id = o.id
    join public.piece p on p.id = i.piece_id
    where o.status = 'dikirim' and o.shipped_at >= v_start and o.shipped_at < v_end
  ),
  sold as (
    select * from shipped where type <> 'penyesuaian'
  ),
  returned as (
    -- the retur note always starts with 'Kondisi baik.' or 'Kondisi rusak.' (app.piece_return)
    select p.variant_id, o.destination, e.note like 'Kondisi rusak%' as rusak
    from public.piece_event e
    join public.piece p on p.id = e.piece_id
    left join public.outbound o on o.id = e.outbound_id
    where e.type = 'retur' and e.created_at >= v_start and e.created_at < v_end
  )
  select jsonb_build_object(
    'from', p_from,
    'to', p_to,
    'totals', jsonb_build_object(
      'docs', (select count(distinct outbound_id) from sold)::int,
      'pcs', (select count(*) from sold)::int,
      'bs', (select count(*) from sold where type = 'jual_bs')::int,
      'returned', (select count(*) from returned)::int,
      'returned_rusak', (select count(*) from returned where rusak)::int,
      'adjusted', (select count(*) from shipped where type = 'penyesuaian')::int,
      'adjust_docs', (select count(distinct outbound_id) from shipped where type = 'penyesuaian')::int
    ),
    'by_type', (
      select coalesce(jsonb_agg(jsonb_build_object('type', type, 'docs', docs, 'pcs', pcs) order by pcs desc), '[]'::jsonb)
      from (select type, count(distinct outbound_id)::int as docs, count(*)::int as pcs from shipped group by type) x
    ),
    'destinations', (
      select coalesce(jsonb_agg(jsonb_build_object('destination', d.destination, 'docs', d.docs, 'pcs', d.pcs,
                                                   'returned', coalesce(r.n, 0)) order by d.pcs desc, d.destination), '[]'::jsonb)
      from (select destination, count(distinct outbound_id)::int as docs, count(*)::int as pcs
            from sold group by destination order by count(*) desc limit 50) d
      left join (select destination, count(*)::int as n from returned group by destination) r on r.destination = d.destination
    ),
    'variants', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'variant_id', v.id, 'sku', v.sku, 'product_name', v.product_name, 'size', v.size, 'color', v.color,
               'pcs', coalesce(s.pcs, 0), 'bs', coalesce(s.bs, 0), 'returned', coalesce(r.n, 0), 'adjusted', coalesce(a.n, 0))
             order by coalesce(s.pcs, 0) desc, v.product_name, v.sku), '[]'::jsonb)
      from public.product_variant v
      left join (select variant_id, count(*)::int as pcs, count(*) filter (where type = 'jual_bs')::int as bs
                 from sold group by variant_id) s on s.variant_id = v.id
      left join (select variant_id, count(*)::int as n from returned group by variant_id) r on r.variant_id = v.id
      left join (select variant_id, count(*)::int as n from shipped where type = 'penyesuaian' group by variant_id) a on a.variant_id = v.id
      where s.pcs is not null or r.n is not null or a.n is not null
    )
  ) into v_result;
  return v_result;
end $$;

create function public.outbound_report(p_from date, p_to date)
returns jsonb language sql stable security invoker set search_path = ''
as $$ select app.outbound_report(p_from, p_to) $$;

revoke all on function app.outbound_report(date, date), public.outbound_report(date, date) from public, anon;
grant execute on function app.outbound_report(date, date), public.outbound_report(date, date) to authenticated;

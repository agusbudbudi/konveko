import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Pagination } from '@/components/ui/pagination';
import { DEFAULT_PAGE_SIZE, PAGE_SIZES } from '@/lib/paging';
import { Badge } from '@/components/ui/status-badge';
import { TabLink, TabList } from '@/components/ui/tab-link';
import { UUID } from '@/lib/master';
import { createClient } from '@/lib/supabase/server';
import { PcsFilters } from './pcs-filters';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadError } from '@/components/ui/load-error';
import { PageHeader } from '@/components/ui/page-header';

export const metadata: Metadata = { title: 'Stok per pcs' };

const DEFAULT_SIZE = DEFAULT_PAGE_SIZE;
/** Matches nothing: a filter value that does not exist (unknown product or rack) must give an empty list. */
const NONE = '00000000-0000-0000-0000-000000000000';

const TABS = [
  { key: 'semua', label: 'Semua' },
  { key: 'rak', label: 'Di rak' },
  { key: 'belum', label: 'Belum di rak' },
  { key: 'reject', label: 'Reject' },
  { key: 'keluar', label: 'Keluar' },
  { key: 'batal', label: 'Dibatalkan' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

type Params = { tab?: string; q?: string; produk?: string; rak?: string; alasan?: string; page?: string; per?: string };

type Row = {
  id: string;
  code: string;
  grade: 'baik' | 'reject';
  status: 'aktif' | 'batal' | 'keluar';
  condition: 'baik' | 'rusak';
  outbound: { id: string; code: string } | null;
  created_at: string;
  bundle_id: string;
  variant: { sku: string; product_name: string; size: string; color: string } | null;
  bundle: { code: string } | null;
  batch: { code: string } | null;
  location: { code: string } | null;
};

const dateFmt = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta' });

/** Every finished piece, one row per label. Filters live in the URL so a view can be shared or bookmarked. */
export default async function StockByPiecePage({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  const tab: TabKey = TABS.some((t) => t.key === sp.tab) ? (sp.tab as TabKey) : 'semua';
  // letters, digits and '-' only: codes look like P-0000123, and % or _ would act as wildcards
  const q = (sp.q ?? '').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 40);
  const produk = (sp.produk ?? '').slice(0, 120);
  const rak = (sp.rak ?? '').slice(0, 40);
  // ?alasan=<reason id>: pieces whose finish scan used that reject reason (linked from Lacak)
  const alasan = UUID.test(sp.alasan ?? '') ? sp.alasan! : '';
  const page = Math.max(1, Math.floor(Number(sp.page) || 1));
  const per = (PAGE_SIZES as readonly number[]).includes(Number(sp.per)) ? Number(sp.per) : DEFAULT_SIZE;

  const supabase = await createClient();
  const [{ data: vData }, { data: lData }, { data: rejectReasons }, { data: reasonMoves }] = await Promise.all([
    supabase.from('product_variant').select('id, product_name'),
    supabase.from('location').select('id, code').order('code'),
    supabase.from('reason').select('id, label').eq('type', 'reject').order('label'),
    // effective_movement: the reason after any supervisor correction (pieces point at the original scan id)
    alasan ? supabase.from('effective_movement').select('id').eq('reason_id', alasan) : Promise.resolve({ data: null }),
  ]);
  const reasonMoveIds = alasan ? ((reasonMoves ?? []) as { id: string }[]).map((m) => m.id) : null;
  const variants = (vData ?? []) as { id: string; product_name: string }[];
  const racks = (lData ?? []) as { id: string; code: string }[];
  const products = [...new Set(variants.map((v) => v.product_name))].sort((a, b) => a.localeCompare(b, 'id'));
  const productVariantIds = produk ? variants.filter((v) => v.product_name === produk).map((v) => v.id) : null;
  const rackId = rak ? racks.find((r) => r.code === rak)?.id ?? null : null;

  // Shared filters (search, product, rack) plus one tab's own condition.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the Supabase client here is untyped
  const scoped = (b: any, t: TabKey) => {
    let x = b;
    if (q) x = x.ilike('code', `%${q}%`);
    if (productVariantIds) x = x.in('variant_id', productVariantIds.length ? productVariantIds : [NONE]);
    if (rak) x = x.eq('location_id', rackId ?? NONE);
    if (reasonMoveIds) x = x.in('finish_movement_id', reasonMoveIds.length ? reasonMoveIds : [NONE]);
    if (t === 'batal') return x.eq('status', 'batal');
    if (t === 'keluar') return x.eq('status', 'keluar');
    x = x.eq('status', 'aktif');
    if (t === 'rak') x = x.not('location_id', 'is', null);
    if (t === 'belum') x = x.is('location_id', null);
    // reject tab: everything that is not sellable (reject grade, or damaged on return)
    if (t === 'reject') x = x.or('grade.eq.reject,condition.eq.rusak');
    return x;
  };

  const from = (page - 1) * per;
  const listQuery = scoped(
    supabase
      .from('piece')
      .select(
        'id, code, grade, status, condition, created_at, bundle_id, variant:product_variant(sku, product_name, size, color), ' +
          'outbound:outbound!piece_outbound_id_fkey(id, code), ' +
          'bundle:bundle(code), batch:production_batch(code), location:location(code)',
        { count: 'exact' },
      ),
    tab,
  )
    .order('created_at', { ascending: false })
    .order('code', { ascending: false })
    .range(from, from + per - 1);
  const countQueries = TABS.map((t) => scoped(supabase.from('piece').select('id', { count: 'exact', head: true }), t.key));
  const [list, ...counts] = await Promise.all([listQuery, ...countQueries]);
  const rows = (list.data ?? []) as unknown as Row[];
  const total = list.count ?? 0; // = countOf[tab]; the list count is fine when the page is in range
  const countOf = Object.fromEntries(TABS.map((t, i) => [t.key, counts[i]?.count ?? 0])) as Record<TabKey, number>;
  const pages = Math.max(1, Math.ceil(countOf[tab] / per));

  const href = (over: Partial<Params>) => {
    const p = new URLSearchParams();
    const m = { tab, q, produk, rak, alasan, page: String(page), per: String(per), ...over };
    if (m.tab && m.tab !== 'semua') p.set('tab', m.tab);
    if (m.q) p.set('q', m.q);
    if (m.produk) p.set('produk', m.produk);
    if (m.rak) p.set('rak', m.rak);
    if (m.alasan) p.set('alasan', m.alasan);
    if (m.page && m.page !== '1') p.set('page', m.page);
    if (m.per && m.per !== String(DEFAULT_SIZE)) p.set('per', m.per);
    const s = p.toString();
    return s ? `/stok/pcs?${s}` : '/stok/pcs';
  };
  // past the last page (bookmark, or the list shrank): go to the last page instead of an error
  if (page > pages) redirect(href({ page: String(pages) }));
  const filtered = Boolean(q || produk || rak || alasan);

  return (
    <>
      <PageHeader title="Per pcs" description="Setiap pcs barang jadi, satu baris per label." />

      <PcsFilters
        products={products}
        racks={racks.map((r) => r.code)}
        reasons={((rejectReasons ?? []) as { id: string; label: string }[]).map((r) => ({ value: r.id, label: r.label }))}
      />

      <TabList label="Status pcs" className="mt-4">
        {TABS.map((t) => (
          <TabLink key={t.key} href={href({ tab: t.key, page: '1' })} active={tab === t.key} label={t.label} count={countOf[t.key]} />
        ))}
      </TabList>

      {list.error && (
        <LoadError className="mt-4" />
      )}

      <section role="tabpanel" className="mt-4 overflow-hidden rounded-lg border border-border bg-surface">
        {rows.length === 0 ? (
          <EmptyState variant={filtered ? 'search' : 'box'}>{filtered ? 'Tidak ada pcs yang cocok dengan filter.' : 'Belum ada pcs di status ini.'}</EmptyState>
        ) : (
          <table className="w-full">
            <thead className="bg-surface-muted text-left text-caption tracking-[0.02em] text-text-muted max-md:hidden">
              <tr className="h-10">
                <th className="px-5 font-medium">Kode pcs</th>
                <th className="px-5 font-medium">Produk</th>
                <th className="px-5 font-medium">Grade</th>
                <th className="px-5 font-medium">Lokasi</th>
                <th className="px-5 font-medium">Bundle</th>
                <th className="px-5 text-right font-medium">Jadi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => {
                const v = r.variant;
                return (
                  <tr
                    key={r.id}
                    className="hover:bg-surface-muted max-md:grid max-md:grid-cols-2 max-md:gap-1 max-md:px-5 max-md:py-3"
                  >
                    <td className="px-5 py-3 max-md:p-0">
                      <Link href={`/pcs/${r.code}`} className="num link-code">
                        {r.code}
                      </Link>
                    </td>
                    <td className="px-5 py-3 max-md:col-span-2 max-md:row-start-2 max-md:p-0">
                      {v ? `${v.product_name} ${v.size} · ${v.color}` : '-'}
                      <p className="num text-small text-text-muted">{v?.sku}</p>
                    </td>
                    <td className="px-5 py-3 max-md:col-start-2 max-md:row-start-1 max-md:justify-self-end max-md:p-0">
                      {r.status === 'batal' ? (
                        <Badge tone="neutral">Dibatalkan</Badge>
                      ) : r.status === 'keluar' ? (
                        <Badge tone="info">Keluar</Badge>
                      ) : r.grade === 'reject' || r.condition === 'rusak' ? (
                        <Badge tone="danger">{r.grade === 'reject' ? 'Reject' : 'Rusak'}</Badge>
                      ) : (
                        <Badge tone="success">Baik</Badge>
                      )}
                    </td>
                    <td className="px-5 py-3 max-md:p-0 max-md:text-small">
                      {r.location ? (
                        <Link href={`/stok/rak/${r.location.code}`} className="num link-code">
                          {r.location.code}
                        </Link>
                      ) : r.status === 'keluar' && r.outbound ? (
                        <Link href={`/barang-keluar/${r.outbound.id}`} className="num link-code">
                          {r.outbound.code}
                        </Link>
                      ) : r.status === 'aktif' ? (
                        <span className="text-warning">Belum di rak</span>
                      ) : (
                        <span className="text-text-subtle">-</span>
                      )}
                    </td>
                    <td className="px-5 py-3 max-md:p-0 max-md:text-right max-md:text-small">
                      <Link href={`/bundle/${r.bundle_id}`} className="num link-code">
                        {r.bundle?.code}
                      </Link>
                      <p className="num text-small text-text-muted">{r.batch?.code}</p>
                    </td>
                    <td className="num px-5 py-3 text-right text-small text-text-muted max-md:col-span-2 max-md:p-0 max-md:text-left">
                      {dateFmt.format(new Date(r.created_at))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {total > 0 && (
        <Pagination
          page={page}
          pages={pages}
          total={total}
          size={per}
          sizes={PAGE_SIZES}
          unit="pcs"
          hrefFor={(n) => href({ page: String(n) })}
          hrefSize={(n) => href({ per: String(n), page: '1' })}
        />
      )}
    </>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { Combobox } from '@/components/ui/combobox';
import { InlineAlert } from '@/components/ui/inline-alert';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/status-badge';
import { TabLink, TabList } from '@/components/ui/tab-link';
import { cn } from '@/lib/cn';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Stok per pcs' };

const PAGE_SIZE = 50;
/** Matches nothing: a filter value that does not exist (unknown product or rack) must give an empty list. */
const NONE = '00000000-0000-0000-0000-000000000000';

const TABS = [
  { key: 'semua', label: 'Semua' },
  { key: 'rak', label: 'Di rak' },
  { key: 'belum', label: 'Belum di rak' },
  { key: 'reject', label: 'Reject' },
  { key: 'batal', label: 'Dibatalkan' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

type Params = { tab?: string; q?: string; produk?: string; rak?: string; page?: string };

type Row = {
  id: string;
  code: string;
  grade: 'baik' | 'reject';
  status: 'aktif' | 'batal';
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
  const page = Math.max(1, Math.floor(Number(sp.page) || 1));

  const supabase = await createClient();
  const [{ data: vData }, { data: lData }] = await Promise.all([
    supabase.from('product_variant').select('id, product_name'),
    supabase.from('location').select('id, code').order('code'),
  ]);
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
    if (t === 'batal') return x.eq('status', 'batal');
    x = x.eq('status', 'aktif');
    if (t === 'rak') x = x.not('location_id', 'is', null);
    if (t === 'belum') x = x.is('location_id', null);
    if (t === 'reject') x = x.eq('grade', 'reject');
    return x;
  };

  const from = (page - 1) * PAGE_SIZE;
  const listQuery = scoped(
    supabase
      .from('piece')
      .select(
        'id, code, grade, status, created_at, bundle_id, variant:product_variant(sku, product_name, size, color), ' +
          'bundle:bundle(code), batch:production_batch(code), location:location(code)',
        { count: 'exact' },
      ),
    tab,
  )
    .order('created_at', { ascending: false })
    .order('code', { ascending: false })
    .range(from, from + PAGE_SIZE - 1);
  const countQueries = TABS.map((t) => scoped(supabase.from('piece').select('id', { count: 'exact', head: true }), t.key));
  const [list, ...counts] = await Promise.all([listQuery, ...countQueries]);
  const rows = (list.data ?? []) as unknown as Row[];
  const total = list.count ?? 0;
  const countOf = Object.fromEntries(TABS.map((t, i) => [t.key, counts[i]?.count ?? 0])) as Record<TabKey, number>;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const href = (over: Partial<Params>) => {
    const p = new URLSearchParams();
    const m = { tab, q, produk, rak, page: String(page), ...over };
    if (m.tab && m.tab !== 'semua') p.set('tab', m.tab);
    if (m.q) p.set('q', m.q);
    if (m.produk) p.set('produk', m.produk);
    if (m.rak) p.set('rak', m.rak);
    if (m.page && m.page !== '1') p.set('page', m.page);
    const s = p.toString();
    return s ? `/stok/pcs?${s}` : '/stok/pcs';
  };
  const filtered = Boolean(q || produk || rak);

  return (
    <>
      <h1 className="text-h1">Per pcs</h1>
      <p className="mt-1 text-text-muted">Setiap pcs barang jadi, satu baris per label.</p>

      {/* GET form: filters end up in the URL; changing a filter starts again at page 1 */}
      <form action="/stok/pcs" className="mt-6 flex flex-wrap items-end gap-2">
        {tab !== 'semua' && <input type="hidden" name="tab" value={tab} />}
        <div className="relative w-full sm:w-52">
          <label htmlFor="pcs-q" className="sr-only">
            Cari kode pcs
          </label>
          <Search size={16} strokeWidth={1.5} aria-hidden className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-muted" />
          <Input id="pcs-q" name="q" defaultValue={q} placeholder="Cari kode pcs" autoComplete="off" className="num h-10 pl-9" />
        </div>
        <div className="w-full sm:w-48">
          <Combobox
            name="produk"
            aria-label="Produk"
            defaultValue={produk}
            options={[{ value: '', label: 'Semua produk' }, ...products.map((p) => ({ value: p, label: p }))]}
          />
        </div>
        <div className="w-full sm:w-40">
          <Combobox
            name="rak"
            aria-label="Rak"
            defaultValue={rak}
            options={[{ value: '', label: 'Semua rak' }, ...racks.map((r) => ({ value: r.code, label: `Rak ${r.code}` }))]}
          />
        </div>
        <button
          type="submit"
          className="inline-flex h-10 items-center rounded-md border border-border bg-surface px-4 font-medium hover:border-border-strong"
        >
          Terapkan
        </button>
        {filtered && (
          <Link href={href({ q: '', produk: '', rak: '', page: '1' })} className="inline-flex h-10 items-center px-2 text-small text-text-muted hover:text-text">
            Hapus filter
          </Link>
        )}
      </form>

      <TabList label="Status pcs" className="mt-4">
        {TABS.map((t) => (
          <TabLink key={t.key} href={href({ tab: t.key, page: '1' })} active={tab === t.key} label={t.label} count={countOf[t.key]} />
        ))}
      </TabList>

      {list.error && (
        <InlineAlert tone="danger" className="mt-4">
          Data gagal dimuat. Muat ulang halaman.
        </InlineAlert>
      )}

      <section role="tabpanel" className="mt-4 overflow-hidden rounded-lg border border-border bg-surface">
        {rows.length === 0 ? (
          <p className="p-5 text-text-muted">{filtered ? 'Tidak ada pcs yang cocok dengan filter.' : 'Belum ada pcs di status ini.'}</p>
        ) : (
          <table className="w-full">
            <thead className="bg-surface-muted text-left text-caption tracking-[0.02em] text-text-muted max-md:hidden">
              <tr className="h-10">
                <th className="px-5 font-medium">Kode pcs</th>
                <th className="px-5 font-medium">Produk</th>
                <th className="px-5 font-medium">Grade</th>
                <th className="px-5 font-medium">Rak</th>
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
                      ) : (
                        <Badge tone={r.grade === 'reject' ? 'danger' : 'success'}>{r.grade === 'reject' ? 'Reject' : 'Baik'}</Badge>
                      )}
                    </td>
                    <td className="px-5 py-3 max-md:p-0 max-md:text-small">
                      {r.location ? (
                        <Link href={`/stok/rak/${r.location.code}`} className="num link-code">
                          {r.location.code}
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
        <nav aria-label="Halaman" className="mt-4 flex items-center justify-between gap-3 text-small text-text-muted">
          <p className="num">
            {from + 1}–{Math.min(from + PAGE_SIZE, total)} dari {total} pcs
          </p>
          {pages > 1 && (
            <div className="flex items-center gap-1">
              <PageLink href={href({ page: String(page - 1) })} disabled={page <= 1} label="Sebelumnya">
                <ChevronLeft size={16} strokeWidth={1.5} aria-hidden />
              </PageLink>
              <span className="num px-2">
                {page} / {pages}
              </span>
              <PageLink href={href({ page: String(page + 1) })} disabled={page >= pages} label="Berikutnya">
                <ChevronRight size={16} strokeWidth={1.5} aria-hidden />
              </PageLink>
            </div>
          )}
        </nav>
      )}
    </>
  );
}

function PageLink({ href, disabled, label, children }: { href: string; disabled: boolean; label: string; children: React.ReactNode }) {
  const cls = 'inline-flex size-10 items-center justify-center rounded-md border border-border bg-surface';
  if (disabled) {
    return (
      <span aria-disabled className={cn(cls, 'text-text-subtle')} aria-label={label}>
        {children}
      </span>
    );
  }
  return (
    <Link href={href} aria-label={label} className={cn(cls, 'text-text hover:border-border-strong')}>
      {children}
    </Link>
  );
}

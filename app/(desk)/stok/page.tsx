import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { UrlPagination } from '@/components/ui/pagination';
import { slicePage, withQuery, type PageQuery } from '@/lib/paging';
import { createClient } from '@/lib/supabase/server';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';

export const metadata: Metadata = { title: 'Stok' };

type Loc = {
  variant_id: string;
  sku: string;
  product_name: string;
  size: string;
  color: string;
  grade: 'baik' | 'reject';
  location_code: string | null;
  qty: number;
};

type VariantStock = {
  id: string;
  sku: string;
  name: string;
  baik: number;
  belumRak: number;
  reject: number;
  racks: Map<string, number>;
};

export default async function StockPage({ searchParams }: { searchParams: Promise<PageQuery> }) {
  const query = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.from('stock_location').select('*');
  const rows = (data ?? []) as Loc[];

  const byVariant = new Map<string, VariantStock>();
  for (const r of rows) {
    let v = byVariant.get(r.variant_id);
    if (!v) {
      v = { id: r.variant_id, sku: r.sku, name: `${r.product_name} ${r.size} · ${r.color}`, baik: 0, belumRak: 0, reject: 0, racks: new Map() };
      byVariant.set(r.variant_id, v);
    }
    if (r.grade === 'reject') v.reject += r.qty;
    else {
      v.baik += r.qty;
      if (!r.location_code) v.belumRak += r.qty;
    }
    if (r.location_code) v.racks.set(r.location_code, (v.racks.get(r.location_code) ?? 0) + r.qty);
  }
  const variants = [...byVariant.values()].sort((a, b) => a.sku.localeCompare(b.sku));
  // totals use every variant; the table shows one page
  const paged = slicePage(variants, query);
  if (paged.outOfRange) redirect(withQuery('/stok', query, { page: String(paged.pages) }));
  const total = variants.reduce((t, v) => ({ baik: t.baik + v.baik, belum: t.belum + v.belumRak, reject: t.reject + v.reject }), {
    baik: 0,
    belum: 0,
    reject: 0,
  });

  return (
    <>
      <PageHeader
        title="Per variant"
        description="Barang jadi per variant dan per rak. Reject dihitung terpisah."
        actions={
        <form action="/pcs" className="flex gap-2">
          <label htmlFor="pcs-code" className="sr-only">
            Lacak pcs
          </label>
          <Input id="pcs-code" name="code" placeholder="P-0000123" autoComplete="off" className="num h-10 !w-44" />
          <button
            type="submit"
            className="inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-md border border-border bg-surface px-4 font-medium hover:border-border-strong"
          >
            <Search size={16} strokeWidth={1.5} aria-hidden /> Lacak pcs
          </button>
        </form>
        }
      />

      <section className="mt-6 grid grid-cols-3 gap-4">
        <Kpi label="Stok baik" value={total.baik} context={`${total.baik - total.belum} di rak`} />
        <Kpi label="Belum di rak" value={total.belum} warn={total.belum > 0} context="sudah jadi, menunggu gudang" href="/label" />
        <Kpi label="Reject" value={total.reject} />
      </section>

      <section className="mt-6 overflow-hidden rounded-lg border border-border bg-surface">
        <div className="hidden grid-cols-[minmax(0,2fr)_repeat(3,90px)_minmax(0,2fr)] gap-4 bg-surface-muted px-5 py-2 text-caption tracking-[0.02em] text-text-muted md:grid">
          <span>Variant</span>
          <span className="text-right">Baik</span>
          <span className="text-right">Belum di rak</span>
          <span className="text-right">Reject</span>
          <span>Rak</span>
        </div>
        {variants.length === 0 ? (
          <EmptyState variant="box">Belum ada barang jadi.</EmptyState>
        ) : (
          <ul className="divide-y divide-border border-t border-border md:border-t-0">
            {paged.rows.map((v) => (
              <li
                key={v.id}
                className="grid gap-x-4 gap-y-1 px-5 py-3 md:grid-cols-[minmax(0,2fr)_repeat(3,90px)_minmax(0,2fr)] md:items-center"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{v.name}</p>
                  <p className="num text-small text-text-muted">{v.sku}</p>
                </div>
                <p className="num md:text-right">
                  <span className="text-small text-text-muted md:hidden">Baik </span>
                  {v.baik}
                </p>
                <p className={`num md:text-right ${v.belumRak > 0 ? 'text-warning' : 'text-text-muted'}`}>
                  <span className="text-small text-text-muted md:hidden">Belum di rak </span>
                  {v.belumRak}
                </p>
                <p className="num text-text-muted md:text-right">
                  <span className="text-small md:hidden">Reject </span>
                  {v.reject}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {[...v.racks.entries()]
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([code, qty]) => (
                      <Link
                        key={code}
                        href={`/stok/rak/${code}`}
                        className="num inline-flex h-7 items-center gap-1.5 rounded-sm border border-border px-2 text-small hover:border-border-strong"
                      >
                        <span className="font-medium text-primary">{code}</span>
                        <span className="text-text-muted">{qty}</span>
                      </Link>
                    ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      <UrlPagination path="/stok" query={query} total={variants.length} unit="variant" />
    </>
  );
}

function Kpi({ label, value, context, warn, href }: { label: string; value: number; context?: string; warn?: boolean; href?: string }) {
  const body = (
    <>
      <p className="text-caption tracking-[0.02em] text-text-muted">{label}</p>
      <p className={`num mt-1 text-display ${warn ? 'text-warning' : ''}`}>{value}</p>
      {context && <p className="text-small text-text-muted">{context}</p>}
    </>
  );
  const cls = 'block rounded-lg border border-border bg-surface p-4 lg:p-5';
  return href ? (
    <Link href={href} className={`${cls} hover:border-border-strong`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

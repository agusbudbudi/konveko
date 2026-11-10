import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { compareSize, loadStock, totals } from '@/lib/stock';
import { createClient } from '@/lib/supabase/server';
import { SetCrumb } from '@/components/nav/sidebar-nav';

export async function generateMetadata({ params }: { params: Promise<{ name: string }> }): Promise<Metadata> {
  return { title: decodeURIComponent((await params).name).slice(0, 80) };
}

type Variant = { id: string; sku: string; size: string; color: string; is_active: boolean };

export default async function ProductStockPage({ params }: { params: Promise<{ name: string }> }) {
  const name = decodeURIComponent((await params).name).slice(0, 200);
  const supabase = await createClient();
  const [{ data }, all] = await Promise.all([
    supabase.from('product_variant').select('id, sku, size, color, is_active').eq('product_name', name),
    loadStock(),
  ]);
  const variants = ((data ?? []) as Variant[]).filter((v) => v.is_active || all.some((r) => r.variant_id === v.id));
  if (variants.length === 0) notFound();
  const stock = all.filter((r) => r.product_name === name);
  const t = totals(stock);

  const sizes = [...new Set(variants.map((v) => v.size))].sort(compareSize);
  const colors = [...new Set(variants.map((v) => v.color))].sort((a, b) => a.localeCompare(b, 'id'));
  const good = (size: string | null, color: string | null) =>
    stock
      .filter((r) => r.grade === 'baik' && (size === null || r.size === size) && (color === null || r.color === color))
      .reduce((n, r) => n + r.qty, 0);
  const exists = (size: string, color: string) => variants.some((v) => v.size === size && v.color === color);

  const rows = variants
    .map((v) => {
      const own = stock.filter((r) => r.variant_id === v.id);
      const racks = new Map<string, number>();
      for (const r of own) if (r.location_code && r.grade === 'baik') racks.set(r.location_code, (racks.get(r.location_code) ?? 0) + r.qty);
      return { ...v, ...totals(own), racks: [...racks.entries()].sort(([a], [b]) => a.localeCompare(b)) };
    })
    .sort((a, b) => a.color.localeCompare(b.color, 'id') || compareSize(a.size, b.size));

  return (
    <>
      <SetCrumb items={[{ label: name }]} />
      <Link href="/stok/produk" className="inline-flex h-10 items-center gap-2 text-small text-text-muted hover:text-text lg:hidden">
        <ArrowLeft size={16} strokeWidth={1.5} aria-hidden /> Per produk
      </Link>
      <h1 className="mt-1 text-h1">{name}</h1>
      <p className="mt-1 text-text-muted">
        {variants.length} variant · {colors.length} warna · {sizes.length} ukuran
      </p>

      <section className="mt-6 grid grid-cols-3 gap-4">
        <Kpi label="Stok baik" value={t.baik} context={`${t.baik - t.belumRak} di rak`} />
        <Kpi label="Belum di rak" value={t.belumRak} warn={t.belumRak > 0} context="sudah jadi" />
        <Kpi label="Reject" value={t.reject} />
      </section>

      <section className="mt-4 overflow-hidden rounded-lg border border-border bg-surface">
        <h2 className="px-5 pt-4 pb-3 text-h3">Stok baik per warna dan ukuran</h2>
        <div className="overflow-x-auto border-t border-border">
          <table className="w-full text-left">
            <thead className="bg-surface-muted text-caption tracking-[0.02em] text-text-muted">
              <tr>
                <th className="px-5 py-2 font-medium">Warna</th>
                {sizes.map((s) => (
                  <th key={s} className="px-3 py-2 text-right font-medium">
                    {s}
                  </th>
                ))}
                <th className="px-5 py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {colors.map((c) => (
                <tr key={c}>
                  <td className="px-5 py-2.5 font-medium">{c}</td>
                  {sizes.map((s) => {
                    const q = good(s, c);
                    return (
                      <td key={s} className={`num px-3 py-2.5 text-right ${q === 0 ? 'text-text-subtle' : ''}`}>
                        {exists(s, c) ? q : '–'}
                      </td>
                    );
                  })}
                  <td className="num px-5 py-2.5 text-right font-medium">{good(null, c)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-border-strong">
              <tr>
                <td className="px-5 py-2.5 text-small text-text-muted">Total</td>
                {sizes.map((s) => (
                  <td key={s} className="num px-3 py-2.5 text-right font-medium">
                    {good(s, null)}
                  </td>
                ))}
                <td className="num px-5 py-2.5 text-right font-semibold">{t.baik}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section className="mt-4 overflow-hidden rounded-lg border border-border bg-surface">
        <h2 className="px-5 pt-4 pb-3 text-h3">Lokasi per variant</h2>
        <ul className="divide-y divide-border border-t border-border">
          {rows.map((v) => (
            <li key={v.id} className="grid gap-x-4 gap-y-1.5 px-5 py-3 md:grid-cols-[minmax(0,1.2fr)_repeat(3,80px)_minmax(0,2fr)] md:items-center">
              <div className="min-w-0">
                <p className="font-medium">
                  {v.size} · {v.color}
                </p>
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
                {v.racks.length === 0 ? (
                  <span className="text-small text-text-subtle">Belum ada di rak</span>
                ) : (
                  v.racks.map(([code, qty]) => (
                    <Link
                      key={code}
                      href={`/stok/rak/${code}`}
                      className="num inline-flex h-7 items-center gap-1.5 rounded-sm border border-border px-2 text-small hover:border-border-strong"
                    >
                      <span className="font-medium text-primary">{code}</span>
                      <span className="text-text-muted">{qty}</span>
                    </Link>
                  ))
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function Kpi({ label, value, context, warn }: { label: string; value: number; context?: string; warn?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4 lg:p-5">
      <p className="text-caption tracking-[0.02em] text-text-muted">{label}</p>
      <p className={`num mt-1 text-display ${warn ? 'text-warning' : ''}`}>{value}</p>
      {context && <p className="text-small text-text-muted">{context}</p>}
    </div>
  );
}

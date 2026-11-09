import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { compareSize, loadStock, productHref, totals } from '@/lib/stock';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Stok per produk' };

type Variant = { id: string; product_name: string; size: string; color: string };

export default async function StockByProductPage() {
  const supabase = await createClient();
  const [{ data }, stock] = await Promise.all([
    supabase.from('product_variant').select('id, product_name, size, color').eq('is_active', true),
    loadStock(),
  ]);
  const variants = (data ?? []) as Variant[];

  // every active product shows up, also with zero stock
  const names = new Set([...variants.map((v) => v.product_name), ...stock.map((r) => r.product_name)]);
  const products = [...names]
    .map((name) => {
      const rows = stock.filter((r) => r.product_name === name);
      const vs = variants.filter((v) => v.product_name === name);
      const sizeQty = new Map<string, number>();
      for (const v of vs) sizeQty.set(v.size, 0);
      for (const r of rows) if (r.grade === 'baik') sizeQty.set(r.size, (sizeQty.get(r.size) ?? 0) + r.qty);
      return {
        name,
        ...totals(rows),
        variantCount: new Set([...vs.map((v) => v.id), ...rows.map((r) => r.variant_id)]).size,
        colors: [...new Set([...vs.map((v) => v.color), ...rows.map((r) => r.color)])],
        sizes: [...sizeQty.entries()].sort(([a], [b]) => compareSize(a, b)),
      };
    })
    .sort((a, b) => b.baik - a.baik || a.name.localeCompare(b.name, 'id'));

  return (
    <>
      <p className="text-small text-text-muted">Stok</p>
      <h1 className="text-h1">Per produk</h1>
      <p className="mt-1 text-text-muted">Stok baik per produk dan ukuran. Klik produk untuk melihat warna dan raknya.</p>

      {products.length === 0 ? (
        <p className="mt-6 rounded-lg border border-border bg-surface px-5 py-4 text-text-muted">Belum ada produk.</p>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {products.map((p) => (
            <li key={p.name}>
              <Link
                href={productHref(p.name)}
                className="grid gap-x-6 gap-y-3 rounded-lg border border-border bg-surface p-4 transition-colors hover:border-border-strong md:grid-cols-[minmax(0,1.2fr)_repeat(3,90px)_minmax(0,2fr)_16px] md:items-center lg:px-5"
              >
                <div className="min-w-0">
                  <p className="truncate text-h3">{p.name}</p>
                  <p className="truncate text-small text-text-muted">
                    {p.variantCount} variant · {p.colors.join(', ')}
                  </p>
                </div>
                <Stat label="Baik" value={p.baik} />
                <Stat label="Belum di rak" value={p.belumRak} warn={p.belumRak > 0} />
                <Stat label="Reject" value={p.reject} muted />
                <div className="flex flex-wrap gap-1.5" aria-label="Stok baik per ukuran">
                  {p.sizes.map(([size, qty]) => (
                    <span
                      key={size}
                      className={`num inline-flex h-7 items-center gap-1.5 rounded-sm border border-border px-2 text-small ${qty === 0 ? 'text-text-subtle' : ''}`}
                    >
                      <span className="font-medium">{size}</span>
                      <span className={qty === 0 ? '' : 'text-text-muted'}>{qty}</span>
                    </span>
                  ))}
                </div>
                <ChevronRight size={16} strokeWidth={1.5} aria-hidden className="hidden text-text-subtle md:block" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Stat({ label, value, warn, muted }: { label: string; value: number; warn?: boolean; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2 md:block md:text-right">
      <p className="text-caption tracking-[0.02em] text-text-muted md:hidden">{label}</p>
      <p className={`num text-h3 ${warn ? 'text-warning' : muted ? 'text-text-muted' : ''}`}>{value}</p>
      <p className="hidden text-caption font-normal text-text-subtle md:block">{label}</p>
    </div>
  );
}

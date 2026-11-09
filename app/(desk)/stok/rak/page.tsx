import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronRight, Printer } from 'lucide-react';
import { Badge } from '@/components/ui/status-badge';
import { loadStock } from '@/lib/stock';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Stok per rak' };

type Rack = { id: string; code: string; kind: 'stok' | 'reject'; note: string | null; is_active: boolean };

export default async function StockByRackPage() {
  const supabase = await createClient();
  const [{ data }, stock] = await Promise.all([supabase.from('location').select('id, code, kind, note, is_active').order('code'), loadStock()]);
  const racks = (data ?? []) as Rack[];

  // per rack: total and its variants, largest first
  const byRack = new Map<string, { total: number; variants: Map<string, { label: string; qty: number }> }>();
  for (const r of stock) {
    if (!r.location_id) continue;
    const e = byRack.get(r.location_id) ?? { total: 0, variants: new Map() };
    e.total += r.qty;
    const v = e.variants.get(r.variant_id) ?? { label: `${r.product_name} ${r.size} · ${r.color}`, qty: 0 };
    v.qty += r.qty;
    e.variants.set(r.variant_id, v);
    byRack.set(r.location_id, e);
  }
  const notShelved = stock.filter((r) => !r.location_id).reduce((n, r) => n + r.qty, 0);
  // inactive racks only matter while they still hold pieces
  const shown = racks.filter((r) => r.is_active || byRack.has(r.id));
  const total = [...byRack.values()].reduce((n, e) => n + e.total, 0);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-small text-text-muted">Stok</p>
          <h1 className="text-h1">Per rak</h1>
          <p className="mt-1 text-text-muted">
            <span className="num">{total}</span> pcs di <span className="num">{byRack.size}</span> rak
          </p>
        </div>
        {shown.length > 0 && (
          <Link
            href="/print/racks"
            className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-surface px-4 font-medium hover:border-border-strong"
          >
            <Printer size={16} strokeWidth={1.5} aria-hidden /> Cetak label rak
          </Link>
        )}
      </div>

      {shown.length === 0 ? (
        <p className="mt-6 rounded-lg border border-border bg-surface px-5 py-4 text-text-muted">
          Belum ada rak.{' '}
          <Link href="/master/rak" className="font-medium text-primary underline">
            Tambah rak di master data
          </Link>
        </p>
      ) : (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((rack) => {
            const e = byRack.get(rack.id);
            const top = e ? [...e.variants.values()].sort((a, b) => b.qty - a.qty) : [];
            return (
              <li key={rack.id}>
                <Link
                  href={`/stok/rak/${rack.code}`}
                  className="flex h-full flex-col rounded-lg border border-border bg-surface p-4 transition-colors hover:border-border-strong lg:p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="flex items-center gap-2">
                        <span className="num text-h2 text-primary">{rack.code}</span>
                        <Badge tone={rack.kind === 'reject' ? 'danger' : 'neutral'}>{rack.kind === 'reject' ? 'Reject' : 'Stok'}</Badge>
                        {!rack.is_active && <Badge tone="neutral">Nonaktif</Badge>}
                      </p>
                      {rack.note && <p className="text-small text-text-muted">{rack.note}</p>}
                    </div>
                    <p className="text-right">
                      <span className="num text-display leading-none">{e?.total ?? 0}</span>
                      <span className="block text-small text-text-muted">pcs</span>
                    </p>
                  </div>
                  <div className="mt-4 border-t border-border pt-3">
                    {top.length === 0 ? (
                      <p className="text-small text-text-subtle">Kosong</p>
                    ) : (
                      <ul className="flex flex-col gap-1 text-small">
                        {top.slice(0, 3).map((v) => (
                          <li key={v.label} className="flex justify-between gap-3">
                            <span className="min-w-0 truncate">{v.label}</span>
                            <span className="num text-text-muted">{v.qty}</span>
                          </li>
                        ))}
                        {top.length > 3 && <li className="text-text-subtle">+{top.length - 3} variant lain</li>}
                      </ul>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {notShelved > 0 && (
        <Link
          href="/label?tab=dicetak"
          className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-dashed border-border-strong bg-surface px-5 py-4 hover:border-text-subtle"
        >
          <span>
            <span className="num font-medium text-warning">{notShelved} pcs</span> sudah jadi tapi belum masuk rak
          </span>
          <ChevronRight size={16} strokeWidth={1.5} aria-hidden className="text-text-subtle" />
        </Link>
      )}
    </>
  );
}

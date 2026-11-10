import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Printer } from 'lucide-react';
import { Badge } from '@/components/ui/status-badge';
import { createClient } from '@/lib/supabase/server';
import { SetCrumb } from '@/components/nav/sidebar-nav';

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  return { title: `Rak ${decodeURIComponent((await params).code).toUpperCase()}` };
}

export default async function RackDetailPage({ params }: { params: Promise<{ code: string }> }) {
  const code = decodeURIComponent((await params).code).toUpperCase().slice(0, 8);
  const supabase = await createClient();
  const { data: rack } = await supabase.from('location').select('*').eq('code', code).maybeSingle();
  if (!rack) notFound();

  const [{ data: stock }, { data: pieces }] = await Promise.all([
    supabase.from('stock_location').select('variant_id, sku, product_name, size, color, grade, qty').eq('location_id', rack.id).order('sku'),
    supabase
      .from('piece')
      .select('id, code, grade, bundle:bundle(code), variant:product_variant(sku)')
      .eq('location_id', rack.id)
      .eq('status', 'aktif')
      .order('code', { ascending: false })
      .limit(200),
  ]);
  const total = (stock ?? []).reduce((s, r) => s + r.qty, 0);
  const list = (pieces ?? []) as unknown as { id: string; code: string; grade: string; bundle: { code: string } | null; variant: { sku: string } | null }[];

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <SetCrumb items={[{ label: `Rak ${rack.code}` }]} />
          <Link href="/stok/rak" className="text-small text-text-muted hover:text-text lg:hidden">
            Stok · Per rak
          </Link>
          <h1 className="flex items-center gap-3 text-h1">
            Rak <span className="num">{rack.code}</span>
            <Badge tone={rack.kind === 'reject' ? 'danger' : 'neutral'}>{rack.kind === 'reject' ? 'Reject' : 'Stok'}</Badge>
            {!rack.is_active && <Badge tone="neutral">Nonaktif</Badge>}
          </h1>
          <p className="mt-1 text-text-muted">
            <span className="num">{total}</span> pcs{rack.note ? ` · ${rack.note}` : ''}
          </p>
        </div>
        <Link
          href={`/print/racks?code=${rack.code}`}
          className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-surface px-4 font-medium hover:border-border-strong"
        >
          <Printer size={16} strokeWidth={1.5} aria-hidden /> Cetak label rak
        </Link>
      </div>

      <section className="mt-6 overflow-hidden rounded-lg border border-border bg-surface">
        <h2 className="px-5 py-3 text-h3">Isi per variant</h2>
        {(stock ?? []).length === 0 ? (
          <p className="border-t border-border px-5 py-4 text-text-muted">Rak kosong.</p>
        ) : (
          <ul className="divide-y divide-border border-t border-border">
            {(stock ?? []).map((r) => (
              <li key={`${r.variant_id}-${r.grade}`} className="flex items-center justify-between gap-4 px-5 py-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {r.product_name} {r.size} · {r.color}
                  </p>
                  <p className="num text-small text-text-muted">{r.sku}</p>
                </div>
                <p className="num text-h3">{r.qty}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {list.length > 0 && (
        <section className="mt-6 overflow-hidden rounded-lg border border-border bg-surface">
          <h2 className="px-5 py-3 text-h3">
            Pcs <span className="text-small font-normal text-text-muted">{list.length === 200 ? '200 terbaru' : ''}</span>
          </h2>
          <ul className="grid gap-x-6 border-t border-border px-5 py-3 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-1.5 text-small">
                <Link href={`/pcs/${p.code}`} className="num link-code">
                  {p.code}
                </Link>
                <span className="num text-text-muted">{p.variant?.sku}</span>
                <span className="num text-text-subtle">{p.bundle?.code}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

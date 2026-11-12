import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Printer, RotateCcw } from 'lucide-react';
import { Badge } from '@/components/ui/status-badge';
import { createClient } from '@/lib/supabase/server';
import { TabLink, TabList } from '@/components/ui/tab-link';
import { UrlPagination } from '@/components/ui/pagination';
import { slicePage, withQuery, type PageQuery } from '@/lib/paging';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';

export const metadata: Metadata = { title: 'Antrian label' };

type Row = {
  bundle_id: string;
  code: string;
  variant_id: string;
  batch_code: string;
  baik: number;
  reject: number;
  unprinted: number;
  since: string;
  days_waiting: number;
};

const linkPrimary =
  'inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 font-medium text-primary-foreground hover:bg-primary-hover';
const linkGhost = 'inline-flex h-10 items-center gap-2 rounded-md px-3 text-text-muted hover:bg-surface-muted hover:text-text';

type Tab = 'belum' | 'dicetak';

export default async function LabelQueuePage({ searchParams }: { searchParams: Promise<PageQuery> }) {
  const query = await searchParams;
  const tab: Tab = query.tab === 'dicetak' ? 'dicetak' : 'belum';
  const supabase = await createClient();
  const [{ data }, { data: awalData }] = await Promise.all([
    supabase.from('bundle_unshelved').select('*').order('since'),
    // Fase 2c: stok awal pieces from a stock count are already on their rack, only the label is missing
    supabase
      .from('piece')
      .select('stock_count:stock_count!piece_stock_count_id_fkey(id, code)')
      .eq('origin', 'stok_awal')
      .eq('status', 'aktif')
      .is('printed_at', null),
  ]);
  const rows = (data ?? []) as Row[];
  const awal = new Map<string, { id: string; code: string; n: number }>();
  for (const a of (awalData ?? []) as unknown as { stock_count: { id: string; code: string } | null }[]) {
    if (!a.stock_count) continue;
    const e = awal.get(a.stock_count.id) ?? { ...a.stock_count, n: 0 };
    e.n++;
    awal.set(e.id, e);
  }
  const awalTotal = [...awal.values()].reduce((n, x) => n + x.n, 0);
  const variantIds = [...new Set(rows.map((r) => r.variant_id))];
  const { data: variants } = variantIds.length
    ? await supabase.from('product_variant').select('id, sku, product_name, size, color').in('id', variantIds)
    : { data: [] };
  const v = new Map((variants ?? []).map((x) => [x.id, x]));

  const toPrint = rows.filter((r) => r.unprinted > 0);
  const waiting = rows.filter((r) => r.unprinted === 0);
  const total = toPrint.reduce((s, r) => s + r.unprinted, 0) + awalTotal;
  const paged = slicePage(tab === 'belum' ? toPrint : waiting, query);
  if (paged.outOfRange) redirect(withQuery('/label', query, { page: String(paged.pages) }));

  const variantCell = (r: Row) => {
    const x = v.get(r.variant_id);
    return x ? `${x.product_name} ${x.size} · ${x.color}` : '-';
  };

  return (
    <>
      <PageHeader
        title="Antrian label"
        description="Label pcs dibuat otomatis saat finishing scan selesai. Cetak, tempel di plastik, lalu gudang scan masuk rak."
        actions={
          total > 0 &&
          tab === 'belum' && (
            <Link href="/print/pieces?pending=1" className={linkPrimary}>
              <Printer size={16} strokeWidth={1.5} aria-hidden /> Cetak semua ({total})
            </Link>
          )
        }
      />

      <TabList label="Status label" className="mt-6">
        <TabLink href={withQuery('/label', query, { tab: '', page: '' })} active={tab === 'belum'} label="Belum dicetak" count={total} />
        <TabLink
          href={withQuery('/label', query, { tab: 'dicetak', page: '' })}
          active={tab === 'dicetak'}
          label="Sudah dicetak, belum masuk rak"
          count={waiting.reduce((s, r) => s + r.baik + r.reject, 0)}
        />
      </TabList>

      <section role="tabpanel" className="mt-4 overflow-hidden rounded-lg border border-border bg-surface">
        {tab === 'belum' && awal.size > 0 && (
          <ul className="divide-y divide-border border-b border-border">
            {[...awal.values()].map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3">
                <Link href={`/opname/${a.id}`} className="num w-24 link-code">
                  {a.code}
                </Link>
                <span className="min-w-0 flex-1">Stok awal dari opname, sudah di rak</span>
                <Link href={`/print/pieces?count=${a.id}`} className={linkGhost}>
                  <Printer size={16} strokeWidth={1.5} aria-hidden /> Cetak {a.n}
                </Link>
              </li>
            ))}
          </ul>
        )}
        {tab === 'belum' ? (
          toPrint.length === 0 && awal.size === 0 ? (
            <EmptyState variant="check">Semua label sudah dicetak.</EmptyState>
          ) : (
            <ul className="divide-y divide-border">
              {paged.rows.map((r) => (
                <li key={r.bundle_id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3">
                  <Link href={`/bundle/${r.bundle_id}`} className="num w-24 link-code">
                    {r.code}
                  </Link>
                  <span className="min-w-0 flex-1 truncate">{variantCell(r)}</span>
                  <span className="num text-small text-text-muted">{r.batch_code}</span>
                  <span className="flex gap-1.5">
                    {r.baik > 0 && <Badge tone="success">{r.baik} baik</Badge>}
                    {r.reject > 0 && <Badge tone="danger">{r.reject} reject</Badge>}
                  </span>
                  <Link href={`/print/pieces?bundle=${r.bundle_id}`} className={linkGhost}>
                    <Printer size={16} strokeWidth={1.5} aria-hidden /> Cetak {r.unprinted}
                  </Link>
                </li>
              ))}
            </ul>
          )
        ) : waiting.length === 0 ? (
          <EmptyState variant="check">Tidak ada yang menunggu.</EmptyState>
        ) : (
          <ul className="divide-y divide-border">
            {paged.rows.map((r) => (
              <li key={r.bundle_id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3">
                <Link href={`/bundle/${r.bundle_id}`} className="num w-24 link-code">
                  {r.code}
                </Link>
                <span className="min-w-0 flex-1 truncate">{variantCell(r)}</span>
                <span className={r.days_waiting >= 1 ? 'text-small text-warning' : 'text-small text-text-muted'}>
                  {r.days_waiting >= 1 ? `menunggu ${r.days_waiting} hari` : 'hari ini'}
                </span>
                <span className="num text-small">{r.baik + r.reject} pcs</span>
                <Link href={`/print/pieces?bundle=${r.bundle_id}&all=1`} className={linkGhost}>
                  <RotateCcw size={16} strokeWidth={1.5} aria-hidden /> Cetak ulang
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <UrlPagination path="/label" query={query} total={paged.total} unit="bundle" />
    </>
  );
}

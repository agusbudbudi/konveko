import type { Metadata } from 'next';
import Link from 'next/link';
import { InlineAlert } from '@/components/ui/inline-alert';
import { StatusBadge } from '@/components/ui/status-badge';
import { cn } from '@/lib/cn';
import { calendarDaysAgo, daysAgoLabel } from '@/lib/date';
import { createClient } from '@/lib/supabase/server';
import { STATUS_LABEL, type BundleStatus } from '@/lib/types';

export const metadata: Metadata = { title: 'WIP' };

const FILTERS: (BundleStatus | 'semua')[] = ['semua', 'siap_jahit', 'proses_jahit', 'siap_finishing', 'proses_finishing'];
const STALE_DAYS = 3;

type Row = {
  bundle_id: string;
  code: string;
  batch_code: string;
  variant_id: string;
  current_status: BundleStatus;
  current_qty: number;
  holder_name: string | null;
  last_movement_at: string;
};

export default async function WipPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status: raw } = await searchParams;
  const status = FILTERS.includes(raw as BundleStatus) ? (raw as BundleStatus) : 'semua';

  const supabase = await createClient();
  let q = supabase.from('wip_list').select('*').order('last_movement_at', { ascending: true }).limit(500);
  if (status !== 'semua') q = q.eq('current_status', status);
  const { data, error } = await q;
  // Calendar days in Jakarta, not the view's elapsed/24h (which shows yesterday evening as "hari ini").
  const now = new Date();
  const rows = ((data ?? []) as Row[]).map((r) => ({ ...r, days: calendarDaysAgo(r.last_movement_at, now) }));

  const variantIds = [...new Set(rows.map((r) => r.variant_id))];
  const { data: vData } = variantIds.length
    ? await supabase.from('product_variant').select('id, product_name, size, color').in('id', variantIds)
    : { data: [] };
  const variants = new Map((vData ?? []).map((v) => [v.id, v]));
  const totalQty = rows.reduce((n, r) => n + r.current_qty, 0);
  const stale = rows.filter((r) => r.days >= STALE_DAYS).length;

  return (
    <>
      <h1 className="text-h1">WIP</h1>
      <p className="mt-1 text-text-muted">
        <span className="num text-text">{rows.length}</span> bundle, <span className="num text-text">{totalQty}</span> pcs belum jadi stok
        {stale > 0 && (
          <>
            {' '}· <span className="text-warning">{stale} tidak di-scan ≥ {STALE_DAYS} hari</span>
          </>
        )}
      </p>

      <nav className="mt-6 flex flex-wrap gap-1 rounded-md bg-surface-muted p-1" aria-label="Filter status">
        {FILTERS.map((f) => (
          <Link
            key={f}
            href={f === 'semua' ? '/wip' : `/wip?status=${f}`}
            aria-current={status === f ? 'page' : undefined}
            className={cn(
              'inline-flex h-10 items-center rounded-md px-3 text-small font-medium',
              status === f ? 'border border-border bg-surface text-text' : 'text-text-muted hover:text-text',
            )}
          >
            {f === 'semua' ? 'Semua' : STATUS_LABEL[f]}
          </Link>
        ))}
      </nav>

      {error && <InlineAlert tone="danger" className="mt-6">Data gagal dimuat. Muat ulang halaman.</InlineAlert>}

      <div className="mt-4 overflow-hidden rounded-lg border border-border bg-surface">
        {rows.length === 0 ? (
          <p className="p-5 text-text-muted">Tidak ada bundle di status ini.</p>
        ) : (
          <table className="w-full">
            <thead className="bg-surface-muted text-left text-caption tracking-[0.02em] text-text-muted max-md:hidden">
              <tr className="h-10">
                <th className="px-5 font-medium">Bundle</th>
                <th className="px-5 font-medium">Variant</th>
                <th className="px-5 font-medium">Status</th>
                <th className="px-5 font-medium">Pemegang</th>
                <th className="px-5 text-right font-medium">Qty</th>
                <th className="px-5 text-right font-medium">Scan terakhir</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => {
                const v = variants.get(r.variant_id);
                const isStale = r.days >= STALE_DAYS;
                return (
                  <tr key={r.bundle_id} className={cn('hover:bg-surface-muted max-md:grid max-md:grid-cols-2 max-md:gap-1 max-md:px-5 max-md:py-3', isStale && 'border-l-[3px] border-l-warning')}>
                    <td className="px-5 py-3 max-md:p-0">
                      <Link href={`/bundle/${r.bundle_id}`} className="num font-medium text-primary hover:underline">
                        {r.code}
                      </Link>
                      <p className="num text-small text-text-muted">{r.batch_code}</p>
                    </td>
                    <td className="px-5 py-3 max-md:col-span-2 max-md:row-start-2 max-md:p-0">{v ? `${v.product_name} ${v.size} · ${v.color}` : '-'}</td>
                    <td className="px-5 py-3 max-md:justify-self-end max-md:p-0">
                      <StatusBadge status={r.current_status} />
                    </td>
                    <td className="px-5 py-3 max-md:p-0 max-md:text-small max-md:text-text-muted">{r.holder_name ?? '-'}</td>
                    <td className="num px-5 py-3 text-right max-md:p-0">{r.current_qty} pcs</td>
                    <td className={cn('num px-5 py-3 text-right max-md:col-span-2 max-md:p-0 max-md:text-left max-md:text-small', isStale ? 'text-warning' : 'text-text-muted')}>
                      {daysAgoLabel(r.days)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

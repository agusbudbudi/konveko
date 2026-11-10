import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { UrlSelect } from '@/components/ui/url-select';
import { InlineAlert } from '@/components/ui/inline-alert';
import { UrlPagination } from '@/components/ui/pagination';
import { StatusBadge } from '@/components/ui/status-badge';
import { TabLink, TabList } from '@/components/ui/tab-link';
import { cn } from '@/lib/cn';
import { UUID } from '@/lib/master';
import { slicePage, withQuery, type PageQuery } from '@/lib/paging';
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

export default async function WipPage({ searchParams }: { searchParams: Promise<PageQuery> }) {
  const query = await searchParams;
  const raw = query.status;
  const status = FILTERS.includes(raw as BundleStatus) ? (raw as BundleStatus) : 'semua';

  const supabase = await createClient();
  // All open bundles are loaded (active WIP is bounded) so the summary line counts every row, not one page.
  let q = supabase.from('wip_list').select('*').order('last_movement_at', { ascending: true }).limit(1000);
  if (status !== 'semua') q = q.eq('current_status', status);
  // ?pemegang=<holder id>: bundles one tailor or team holds right now (linked from Lacak)
  const holderId = UUID.test(query.pemegang ?? '') ? query.pemegang! : null;
  let countQ = supabase.from('wip_list').select('current_status');
  if (holderId) {
    q = q.eq('current_holder_id', holderId);
    countQ = countQ.eq('current_holder_id', holderId);
  }
  // counts per status for the tabs (status column only, cheap)
  const [{ data, error }, { data: all }, { data: holders }] = await Promise.all([
    q,
    countQ,
    supabase.from('holder').select('id, name, type').eq('is_active', true).order('name'),
  ]);
  const countOf = (f: BundleStatus | 'semua') =>
    f === 'semua' ? (all ?? []).length : (all ?? []).filter((r) => r.current_status === f).length;
  // Calendar days in Jakarta, not the view's elapsed/24h (which shows yesterday evening as "hari ini").
  const now = new Date();
  const allRows = ((data ?? []) as Row[]).map((r) => ({ ...r, days: calendarDaysAgo(r.last_movement_at, now) }));
  const paged = slicePage(allRows, query);
  if (paged.outOfRange) redirect(withQuery('/wip', query, { page: String(paged.pages) }));
  const rows = paged.rows;

  const variantIds = [...new Set(rows.map((r) => r.variant_id))];
  const { data: vData } = variantIds.length
    ? await supabase.from('product_variant').select('id, product_name, size, color').in('id', variantIds)
    : { data: [] };
  const variants = new Map((vData ?? []).map((v) => [v.id, v]));
  const totalQty = allRows.reduce((n, r) => n + r.current_qty, 0);
  const stale = allRows.filter((r) => r.days >= STALE_DAYS).length;

  return (
    <>
      <h1 className="text-h1">WIP</h1>
      <p className="mt-1 text-text-muted">
        <span className="num text-text">{allRows.length}</span> bundle, <span className="num text-text">{totalQty}</span> pcs belum jadi stok
        {stale > 0 && (
          <>
            {' '}· <span className="text-warning">{stale} tidak di-scan ≥ {STALE_DAYS} hari</span>
          </>
        )}
      </p>

      <div className="mt-6">
        <UrlSelect
          param="pemegang"
          label="Pemegang"
          allLabel="Semua pemegang"
          options={((holders ?? []) as { id: string; name: string; type: string }[]).map((h) => ({ value: h.id, label: h.name, hint: h.type }))}
        />
      </div>

      <TabList label="Filter status" className="mt-6">
        {FILTERS.map((f) => (
          <TabLink
            key={f}
            href={withQuery('/wip', query, { status: f === 'semua' ? '' : f, page: '' })}
            active={status === f}
            label={f === 'semua' ? 'Semua' : STATUS_LABEL[f]}
            count={countOf(f)}
          />
        ))}
      </TabList>

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
                      <Link href={`/bundle/${r.bundle_id}`} className="num link-code">
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
      <UrlPagination path="/wip" query={query} total={allRows.length} unit="bundle" />
    </>
  );
}

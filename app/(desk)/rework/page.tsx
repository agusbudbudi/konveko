import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ReworkButton } from '@/components/rework/rework-button';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadError } from '@/components/ui/load-error';
import { PageHeader } from '@/components/ui/page-header';
import { UrlPagination } from '@/components/ui/pagination';
import { StatusBadge } from '@/components/ui/status-badge';
import { TabLink, TabList } from '@/components/ui/tab-link';
import { calendarDaysAgo, daysAgoLabel } from '@/lib/date';
import { slicePage, withQuery, type PageQuery } from '@/lib/paging';
import { createClient, getCurrentAppUser } from '@/lib/supabase/server';
import {
  REWORK_SOURCE_LABEL,
  REWORK_STEP_LABEL,
  type BundleStatus,
  type ReworkSource,
  type ReworkStep,
} from '@/lib/types';

export const metadata: Metadata = { title: 'Rework' };

const TABS = [
  { key: 'berjalan', label: 'Berjalan' },
  { key: 'selesai', label: 'Selesai' },
  { key: 'batal', label: 'Batal' },
  { key: 'semua', label: 'Semua' },
] as const;
type Tab = (typeof TABS)[number]['key'];

type Row = {
  id: string;
  code: string;
  target_qty: number;
  current_status: BundleStatus;
  rework_source: ReworkSource;
  start_step: ReworkStep;
  rework_note: string | null;
  created_at: string;
  last_movement_at: string;
  origin: { id: string; code: string } | null;
  batch: { code: string } | null;
  variant: { product_name: string; size: string; color: string } | null;
  holder: { name: string } | null;
};

const tabOf = (s: BundleStatus): Exclude<Tab, 'semua'> =>
  s === 'ready_stock' ? 'selesai' : s === 'batal' ? 'batal' : 'berjalan';

const dateFmt = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', timeZone: 'Asia/Jakarta' });

/** Fase 2 rework: every rework bundle, and the entry point for sending scanned pcs to rework. */
export default async function ReworkPage({ searchParams }: { searchParams: Promise<PageQuery> }) {
  const query = await searchParams;
  const tab: Tab = TABS.some((t) => t.key === query.tab) ? (query.tab as Tab) : 'berjalan';

  const supabase = await createClient();
  const user = await getCurrentAppUser();
  const canRework = user?.roles.some((r) => r === 'supervisor' || r === 'admin') ?? false;

  const [{ data, error }, { count: waiting }] = await Promise.all([
    supabase
      .from('bundle')
      .select(
        'id, code, target_qty, current_status, rework_source, start_step, rework_note, created_at, last_movement_at, origin:bundle!rework_of_bundle_id(id, code), batch:production_batch(code), variant:product_variant(product_name, size, color), holder:holder!bundle_current_holder_id_fkey(name)',
      )
      .not('rework_of_bundle_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1000),
    // reject or damaged pcs still in the warehouse with no decision yet (not reworked, not on a document)
    supabase
      .from('piece')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'aktif')
      .is('outbound_id', null)
      .or('grade.eq.reject,condition.eq.rusak'),
  ]);
  const all = (data ?? []) as unknown as Row[];
  const countOf = (t: Tab) => (t === 'semua' ? all.length : all.filter((r) => tabOf(r.current_status) === t).length);
  const filtered = tab === 'semua' ? all : all.filter((r) => tabOf(r.current_status) === tab);
  const paged = slicePage(filtered, query);
  if (paged.outOfRange) redirect(withQuery('/rework', query, { page: String(paged.pages) }));
  const now = new Date();
  const running = all.filter((r) => tabOf(r.current_status) === 'berjalan');
  const runningQty = running.reduce((n, r) => n + r.target_qty, 0);

  return (
    <>
      <PageHeader
        title="Rework"
        description={
          <>
            <span className="num text-text">{running.length}</span> bundle rework berjalan,{' '}
            <span className="num text-text">{runningQty}</span> pcs sedang diperbaiki
            {(waiting ?? 0) > 0 && (
              <>
                {' '}
                · <span className="num text-danger">{waiting}</span> pcs reject atau rusak belum diputuskan
              </>
            )}
          </>
        }
        actions={canRework && <ReworkButton scan label="Buat rework" variant="primary" />}
      />

      <TabList label="Filter status rework" className="mt-6">
        {TABS.map((t) => (
          <TabLink
            key={t.key}
            href={withQuery('/rework', query, { tab: t.key === 'berjalan' ? '' : t.key, page: '' })}
            active={tab === t.key}
            label={t.label}
            count={countOf(t.key)}
          />
        ))}
      </TabList>

      {error && <LoadError className="mt-6" />}

      <div className="mt-4 overflow-hidden rounded-lg border border-border bg-surface">
        {paged.rows.length === 0 ? (
          <EmptyState
            variant="box"
            hint={canRework && tab === 'berjalan' ? 'Kirim pcs reject dari detail bundle, atau scan pcs lewat Buat rework.' : undefined}
          >
            Belum ada bundle rework di sini.
          </EmptyState>
        ) : (
          <table className="w-full">
            <thead className="bg-surface-muted text-left text-caption tracking-[0.02em] text-text-muted max-md:hidden">
              <tr className="h-10">
                <th className="px-5 font-medium">Bundle rework</th>
                <th className="px-5 font-medium">Asal</th>
                <th className="px-5 font-medium">Perbaikan</th>
                <th className="px-5 font-medium">Status</th>
                <th className="px-5 font-medium">Pemegang</th>
                <th className="px-5 text-right font-medium">Qty</th>
                <th className="px-5 text-right font-medium">Scan terakhir</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {paged.rows.map((r) => {
                const v = r.variant;
                const open = tabOf(r.current_status) === 'berjalan';
                return (
                  <tr
                    key={r.id}
                    className="hover:bg-surface-muted max-md:grid max-md:grid-cols-2 max-md:gap-1 max-md:px-5 max-md:py-3"
                  >
                    <td className="px-5 py-3 max-md:p-0">
                      <Link href={`/bundle/${r.id}`} className="num link-code">
                        {r.code}
                      </Link>
                      <p className="text-small text-text-muted">
                        {v ? `${v.product_name} ${v.size} · ${v.color}` : '-'}
                      </p>
                    </td>
                    <td className="px-5 py-3 max-md:col-start-1 max-md:row-start-2 max-md:p-0 max-md:text-small">
                      {r.origin ? (
                        <Link href={`/bundle/${r.origin.id}`} className="num link-code">
                          {r.origin.code}
                        </Link>
                      ) : (
                        '-'
                      )}
                      <p className="num text-small text-text-muted">
                        {r.batch?.code} · {dateFmt.format(new Date(r.created_at))}
                      </p>
                    </td>
                    <td className="px-5 py-3 max-md:col-span-2 max-md:p-0 max-md:text-small">
                      {REWORK_SOURCE_LABEL[r.rework_source]}, mulai {REWORK_STEP_LABEL[r.start_step].toLowerCase()}
                      {r.rework_note && <p className="max-w-64 truncate text-small text-text-muted">{r.rework_note}</p>}
                    </td>
                    <td className="px-5 py-3 max-md:col-start-2 max-md:row-start-1 max-md:justify-self-end max-md:p-0">
                      <StatusBadge status={r.current_status} />
                    </td>
                    <td className="px-5 py-3 max-md:p-0 max-md:text-small max-md:text-text-muted">{r.holder?.name ?? '-'}</td>
                    <td className="num px-5 py-3 text-right max-md:p-0 max-md:text-left">{r.target_qty} pcs</td>
                    <td className="num px-5 py-3 text-right text-small text-text-muted max-md:p-0">
                      {open ? daysAgoLabel(calendarDaysAgo(r.last_movement_at, now)) : '-'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <UrlPagination path="/rework" query={query} total={filtered.length} unit="bundle" />
    </>
  );
}

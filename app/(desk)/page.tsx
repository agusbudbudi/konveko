import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { InlineAlert } from '@/components/ui/inline-alert';
import { Badge } from '@/components/ui/status-badge';
import { MeterBar } from '@/components/ui/meter-bar';
import { ReconciliationBar, ReconciliationLegend, type Recon } from '@/components/recon/reconciliation-bar';
import { UrlPagination } from '@/components/ui/pagination';
import { slicePage, withQuery, type PageQuery } from '@/lib/paging';
import { createClient } from '@/lib/supabase/server';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadError } from '@/components/ui/load-error';
import { PageHeader } from '@/components/ui/page-header';

export const metadata: Metadata = { title: 'Rekonsiliasi' };

type BatchRow = Recon & {
  batch_id: string;
  code: string;
  status: 'draft' | 'berjalan' | 'selesai';
  created_at: string;
  wip: number;
  open_discrepancies: number;
};

const batchTone = { draft: 'neutral', berjalan: 'info', selesai: 'success' } as const;
const batchLabel = { draft: 'Draft', berjalan: 'Berjalan', selesai: 'Selesai' } as const;

export default async function ReconciliationPage({ searchParams }: { searchParams: Promise<PageQuery> }) {
  const query = await searchParams;
  const supabase = await createClient();
  // every batch feeds the KPI totals; the list below shows one page
  const { data, error } = await supabase
    .from('batch_reconciliation')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1000);
  const batches = (data ?? []) as BatchRow[];
  const paged = slicePage(batches, query);
  if (paged.outOfRange) redirect(withQuery('/', query, { page: String(paged.pages) }));
  const [{ data: unshelved }, { count: shippedCount }] = await Promise.all([
    supabase.from('bundle_unshelved').select('baik, reject, unprinted, days_waiting'),
    // Fase 2b: good pieces that left the warehouse still count in Ready stock (produced)
    supabase.from('piece').select('id', { count: 'exact', head: true }).eq('status', 'keluar').eq('grade', 'baik'),
  ]);
  const shipped = shippedCount ?? 0;
  const waiting = (unshelved ?? []).reduce((n, r) => n + r.baik, 0); // good pieces only, matches "Ready stock"
  const lateRows = (unshelved ?? []).filter((r) => r.days_waiting >= 1);
  const late = lateRows.reduce((n, r) => n + r.baik + r.reject, 0);
  // open the label queue on the tab where these pieces are: still to print first, else printed but not shelved
  const lateHref = lateRows.some((r) => r.unprinted > 0) ? '/label' : '/label?tab=dicetak';

  const totals = batches.reduce(
    (t, b) => ({
      target: t.target + b.target,
      ready: t.ready + b.ready,
      reject: t.reject + b.reject,
      wip_menunggu: t.wip_menunggu + b.wip_menunggu,
      wip_dikerjakan: t.wip_dikerjakan + b.wip_dikerjakan,
      selisih: t.selisih + b.selisih,
    }),
    { target: 0, ready: 0, reject: 0, wip_menunggu: 0, wip_dikerjakan: 0, selisih: 0 },
  );
  const openFlags = batches.reduce((n, b) => n + b.open_discrepancies, 0);

  return (
    <>
      <PageHeader title="Rekonsiliasi" description="Semua batch, terbaru di atas" />

      {error && <LoadError className="mt-6" />}

      {late > 0 && (
        <InlineAlert tone="warning" className="mt-6">
          <span className="num">{late}</span> pcs sudah jadi lebih dari sehari tapi belum masuk rak.{' '}
          <Link href={lateHref} className="font-medium underline">
            Lihat antrian label
          </Link>
        </InlineAlert>
      )}

      <section className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-[minmax(0,1.6fr)_repeat(4,minmax(0,1fr))]">
        <div className="col-span-2 flex flex-col rounded-lg border border-border bg-surface p-4 lg:col-span-1 lg:p-5">
          <p className="text-caption tracking-[0.02em] text-text-muted">Target</p>
          <p className="mt-1 flex items-baseline gap-1.5">
            <span className="num text-display">{totals.target}</span>
            <span className="text-small text-text-muted">pcs dari {batches.length} batch</span>
          </p>
          <div className="mt-auto pt-3">
            <ReconciliationBar r={totals} />
          </div>
        </div>
        <Kpi
          label="Ready stock"
          swatch="bg-primary"
          value={totals.ready}
          target={totals.target}
          context={[
            shipped > 0 && `${shipped} sudah keluar`,
            waiting > 0 ? `${waiting} belum di rak` : shipped > 0 ? 'sisanya di rak' : 'Semua sudah di rak',
          ]
            .filter(Boolean)
            .join(' · ')}
          href="/stok"
        />
        <Kpi label="Reject" swatch="bg-danger" value={totals.reject} target={totals.target} context="Jahit dan QC" />
        <Kpi
          label="WIP"
          swatch="bg-neutral/40"
          value={totals.wip_menunggu + totals.wip_dikerjakan}
          target={totals.target}
          context={`${totals.wip_dikerjakan} dikerjakan · ${totals.wip_menunggu} menunggu`}
          href="/wip"
        />
        <Kpi
          label="Selisih"
          swatch="bg-warning"
          value={totals.selisih}
          target={totals.target}
          warn={totals.selisih > 0}
          context={openFlags > 0 ? `${openFlags} flag terbuka` : 'Tidak ada flag terbuka'}
          href="/selisih"
        />
      </section>

      <section className="mt-6 overflow-hidden rounded-lg border border-border bg-surface">
        <div className="flex items-center justify-between px-5 py-4">
          <h2 className="text-h2">Batch</h2>
        </div>
        {batches.length === 0 ? (
          <EmptyState variant="box" compact>Belum ada batch.</EmptyState>
        ) : (
          <ul className="divide-y divide-border border-t border-border">
            {paged.rows.map((b) => (
              <li key={b.batch_id} className={b.open_discrepancies > 0 ? 'border-l-[3px] border-l-warning' : undefined}>
                <div className="grid gap-3 px-5 py-4 md:grid-cols-[180px_1fr] md:items-center md:gap-6">
                  <div className="flex items-center justify-between gap-3 md:block">
                    <Link href={`/batch/${b.batch_id}`} className="num link-code">{b.code}</Link>
                    <div className="mt-1 flex gap-1.5">
                      <Badge tone={batchTone[b.status]}>{batchLabel[b.status]}</Badge>
                      {b.open_discrepancies > 0 && <Badge tone="warning">Selisih</Badge>}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <ReconciliationBar r={b} />
                    <ReconciliationLegend r={b} />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        <UrlPagination path="/" query={query} total={batches.length} unit="batch" className="border-t border-border px-5 pb-4" />
      </section>
    </>
  );
}

/** DESIGN §5.6 KPI tile. Swatch and meter use the same color as the reconciliation bar segment. */
function Kpi({
  label,
  swatch,
  value,
  target,
  context,
  warn,
  href,
}: {
  label: string;
  swatch: string;
  value: number;
  target: number;
  context?: string;
  warn?: boolean;
  href?: string;
}) {
  const share = target > 0 ? value / target : 0;
  const pct = share > 0 && share < 0.01 ? '<1' : String(Math.round(share * 100));
  const body = (
    <>
      <p className="flex items-center gap-2 text-caption tracking-[0.02em] text-text-muted">
        <span aria-hidden className={`size-2 rounded-sm ${swatch}`} />
        {label}
        {href && <ChevronRight size={14} strokeWidth={1.5} aria-hidden className="ml-auto text-text-subtle" />}
      </p>
      <p className="mt-1 flex items-baseline gap-1.5">
        <span className={`num text-display ${warn ? 'text-warning' : ''}`}>{value}</span>
        <span className="num text-small text-text-muted">{pct}%</span>
      </p>
      <MeterBar
        share={share}
        color={swatch}
        className="mt-2 h-1"
        tip={
          <>
            {label} <span className="num font-medium">{value}</span>
            <span className="num opacity-70"> dari {target} · {pct}%</span>
          </>
        }
      />
      {context && <p className={`mt-2 text-small ${warn ? 'text-warning' : 'text-text-muted'}`}>{context}</p>}
    </>
  );
  const cls = 'block rounded-lg border border-border bg-surface p-4 lg:p-5';
  return href ? (
    <Link href={href} className={`${cls} transition-colors hover:border-border-strong`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

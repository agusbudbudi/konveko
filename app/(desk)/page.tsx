import type { Metadata } from 'next';
import Link from 'next/link';
import { InlineAlert } from '@/components/ui/inline-alert';
import { Badge } from '@/components/ui/status-badge';
import { ReconciliationBar, ReconciliationLegend, type Recon } from '@/components/recon/reconciliation-bar';
import { createClient } from '@/lib/supabase/server';

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

export default async function ReconciliationPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('batch_reconciliation')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);
  const batches = (data ?? []) as BatchRow[];
  const { data: unshelved } = await supabase.from('bundle_unshelved').select('baik, reject, days_waiting');
  const waiting = (unshelved ?? []).reduce((n, r) => n + r.baik, 0); // good pieces only, matches "Ready stock"
  const late = (unshelved ?? []).filter((r) => r.days_waiting >= 1).reduce((n, r) => n + r.baik + r.reject, 0);

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
      <h1 className="text-h1">Rekonsiliasi</h1>
      <p className="mt-1 text-small text-text-muted">50 batch terakhir</p>

      {error && <InlineAlert tone="danger" className="mt-6">Data gagal dimuat. Muat ulang halaman.</InlineAlert>}

      {late > 0 && (
        <InlineAlert tone="warning" className="mt-6">
          <span className="num">{late}</span> pcs sudah jadi lebih dari sehari tapi belum masuk rak.{' '}
          <Link href="/label" className="font-medium underline">
            Lihat antrian label
          </Link>
        </InlineAlert>
      )}

      <section className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Kpi label="Target" value={totals.target} />
        <Kpi label="Ready stock" value={totals.ready} context={waiting > 0 ? `${waiting} pcs belum di rak` : undefined} />
        <Kpi label="Reject" value={totals.reject} />
        <Kpi label="WIP" value={totals.wip_menunggu + totals.wip_dikerjakan}
          context={`${totals.wip_menunggu} menunggu terima`} />
        <Kpi label="Selisih" value={totals.selisih} warn={totals.selisih > 0}
          context={openFlags > 0 ? `${openFlags} flag terbuka` : 'Tidak ada flag terbuka'} />
      </section>

      <section className="mt-6 overflow-hidden rounded-lg border border-border bg-surface">
        <div className="flex items-center justify-between px-5 py-4">
          <h2 className="text-h2">Batch</h2>
        </div>
        {batches.length === 0 ? (
          <p className="px-5 pb-5 text-text-muted">Belum ada batch.</p>
        ) : (
          <ul className="divide-y divide-border border-t border-border">
            {batches.map((b) => (
              <li key={b.batch_id} className={b.open_discrepancies > 0 ? 'border-l-[3px] border-l-warning' : undefined}>
                <div className="grid gap-3 px-5 py-4 md:grid-cols-[180px_1fr] md:items-center md:gap-6">
                  <div className="flex items-center justify-between gap-3 md:block">
                    <Link href={`/batch/${b.batch_id}`} className="num font-medium text-primary hover:underline">{b.code}</Link>
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

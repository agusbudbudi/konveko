import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Badge } from '@/components/ui/status-badge';
import { UrlSelect } from '@/components/ui/url-select';
import { InlineAlert } from '@/components/ui/inline-alert';
import { UrlPagination } from '@/components/ui/pagination';
import { ReconciliationBar, type Recon } from '@/components/recon/reconciliation-bar';
import { UUID } from '@/lib/master';
import { NONE, pageCount, readPaging, withQuery, type PageQuery } from '@/lib/paging';
import { createClient } from '@/lib/supabase/server';
import { BATCH_STATUS } from '@/lib/types';

export const metadata: Metadata = { title: 'Batch' };

type Row = Recon & { batch_id: string; code: string; status: keyof typeof BATCH_STATUS; created_at: string; open_discrepancies: number };

const dateFmt = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });

export default async function BatchListPage({ searchParams }: { searchParams: Promise<PageQuery> }) {
  const query = await searchParams;
  const { from, to, per, page } = readPaging(query);
  const supabase = await createClient();
  // ?rol=<fabric roll id>: batches cut from one roll (linked from Lacak)
  const rollId = UUID.test(query.rol ?? '') ? query.rol! : null;
  const { data: rollData } = await supabase.from('fabric_roll').select('id, code, material, color').order('created_at', { ascending: false });
  const rolls = (rollData ?? []) as { id: string; code: string; material: string; color: string }[];
  const rollBatchIds = rollId
    ? ((await supabase.from('production_batch').select('id').eq('fabric_roll_id', rollId)).data ?? []).map((b) => b.id as string)
    : null;
  let list = supabase.from('batch_reconciliation').select('*').order('created_at', { ascending: false }).range(from, to);
  let counter = supabase.from('production_batch').select('id', { count: 'exact', head: true });
  if (rollId) {
    list = list.in('batch_id', rollBatchIds!.length ? rollBatchIds! : [NONE]);
    counter = counter.eq('fabric_roll_id', rollId);
  }
  const [{ data, error }, { count }] = await Promise.all([list, counter]);
  const total = count ?? 0;
  if (page > pageCount(total, per)) redirect(withQuery('/batch', query, { page: String(pageCount(total, per)) }));
  const rows = (data ?? []) as Row[];

  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-h1">Batch</h1>
        <Link href="/batch/new" className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 font-medium text-primary-foreground hover:bg-primary-hover">
          <Plus size={16} strokeWidth={1.5} aria-hidden /> Batch baru
        </Link>
      </div>

      <div className="mt-6">
        <UrlSelect
          param="rol"
          label="Rol kain"
          allLabel="Semua rol kain"
          options={rolls.map((r) => ({ value: r.id, label: r.code, hint: `${r.material} ${r.color}` }))}
        />
      </div>

      {error && <InlineAlert tone="danger" className="mt-6">Data gagal dimuat. Muat ulang halaman.</InlineAlert>}

      <div className="mt-6 overflow-hidden rounded-lg border border-border bg-surface">
        {rows.length === 0 ? (
          <p className="p-5 text-text-muted">{rollId ? 'Belum ada batch dari rol ini.' : 'Belum ada batch.'}</p>
        ) : (
          <table className="w-full">
            <thead className="bg-surface-muted text-left text-caption tracking-[0.02em] text-text-muted max-md:hidden">
              <tr className="h-10">
                <th className="px-5 font-medium">Batch</th>
                <th className="px-5 font-medium">Status</th>
                <th className="px-5 text-right font-medium">Target</th>
                <th className="w-[40%] px-5 font-medium">Rekonsiliasi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((b) => (
                <tr key={b.batch_id} className="hover:bg-surface-muted max-md:block max-md:px-5 max-md:py-3">
                  <td className="px-5 py-3 max-md:inline-block max-md:p-0">
                    <Link href={`/batch/${b.batch_id}`} className="num link-code">
                      {b.code}
                    </Link>
                    <p className="text-small text-text-muted">{dateFmt.format(new Date(b.created_at))}</p>
                  </td>
                  <td className="px-5 py-3 max-md:float-right max-md:p-0">
                    <div className="flex gap-1.5">
                      <Badge tone={BATCH_STATUS[b.status].tone}>{BATCH_STATUS[b.status].label}</Badge>
                      {b.open_discrepancies > 0 && <Badge tone="warning">Selisih</Badge>}
                    </div>
                  </td>
                  <td className="num px-5 py-3 text-right max-md:hidden">{b.target}</td>
                  <td className="px-5 py-3 max-md:block max-md:px-0 max-md:pb-0">
                    <ReconciliationBar r={b} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <UrlPagination path="/batch" query={query} total={total} unit="batch" />
    </>
  );
}

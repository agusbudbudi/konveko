import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { TriangleAlert } from 'lucide-react';
import { UrlSelect } from '@/components/ui/url-select';
import { UrlPagination } from '@/components/ui/pagination';
import { UUID } from '@/lib/master';
import { slicePage, withQuery, type PageQuery } from '@/lib/paging';
import { createClient } from '@/lib/supabase/server';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadError } from '@/components/ui/load-error';
import { PageHeader } from '@/components/ui/page-header';

export const metadata: Metadata = { title: 'Selisih' };

type Row = {
  id: string;
  qty: number;
  from_step: string;
  to_step: string;
  created_at: string;
  movement_id: string;
  bundle: { id: string; code: string; batch: { code: string } | null } | null;
  movement: { reason_id: string | null; scanned_by: string } | null;
};

const timeFmt = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });

// FR-22: supervisor work list of open selisih flags. Resolving happens on the bundle page.
export default async function SelisihPage({ searchParams }: { searchParams: Promise<PageQuery> }) {
  const query = await searchParams;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('discrepancy')
    .select('id, qty, from_step, to_step, created_at, movement_id, bundle:bundle(id, code, batch:production_batch(code)), movement:movement(reason_id, scanned_by)')
    .eq('status', 'terbuka')
    .order('created_at', { ascending: false })
    .limit(1000); // all open flags, so the summary counts every one; the table shows one page
  // The reason shown and filtered on is the one after any supervisor correction
  // (effective_movement is keyed by the original scan id, which the flag points at).
  const raw = (data ?? []) as unknown as Row[];
  const moveIds = [...new Set(raw.map((r) => r.movement_id))];
  const { data: eff } = moveIds.length
    ? await supabase.from('effective_movement').select('id, reason_id').in('id', moveIds)
    : { data: [] };
  const reasonOf = new Map(((eff ?? []) as { id: string; reason_id: string | null }[]).map((m) => [m.id, m.reason_id]));
  const effReason = (r: Row) => reasonOf.get(r.movement_id) ?? r.movement?.reason_id ?? null;
  // ?alasan=<reason id>: only flags with that reason
  const reasonId = UUID.test(query.alasan ?? '') ? query.alasan! : null;
  const all = raw.filter((r) => !reasonId || effReason(r) === reasonId);
  const paged = slicePage(all, query);
  if (paged.outOfRange) redirect(withQuery('/selisih', query, { page: String(paged.pages) }));
  const rows = paged.rows;

  const { data: reasons } = await supabase.from('reason').select('id, type, label');
  const reasonLabel = new Map((reasons ?? []).map((r) => [r.id, r.label]));
  const scannerIds = [...new Set(rows.map((r) => r.movement?.scanned_by).filter(Boolean))] as string[];
  const { data: names } = scannerIds.length ? await supabase.rpc('staff_names', { p_ids: scannerIds }) : { data: [] };
  const nameOf = new Map(((names ?? []) as { id: string; name: string }[]).map((n) => [n.id, n.name]));
  const total = all.reduce((n, r) => n + r.qty, 0);

  return (
    <>
      <PageHeader
        title="Selisih"
        description={
          <>
            <span className="num text-text">{all.length}</span> flag terbuka, total <span className="num text-warning">{total}</span> pcs
          </>
        }
      />

      {error && <LoadError className="mt-6" />}

      <div className="mt-6">
        <UrlSelect
          param="alasan"
          label="Alasan selisih"
          allLabel="Semua alasan"
          options={(reasons ?? []).filter((r) => r.type === 'selisih').map((r) => ({ value: r.id, label: r.label }))}
        />
      </div>

      <div className="mt-6 overflow-hidden rounded-lg border border-border bg-surface">
        {rows.length === 0 ? (
          <EmptyState variant="check">Tidak ada flag selisih terbuka.</EmptyState>
        ) : (
          <table className="w-full">
            <thead className="bg-surface-muted text-left text-caption tracking-[0.02em] text-text-muted max-md:hidden">
              <tr className="h-10">
                <th className="px-5 font-medium">Bundle</th>
                <th className="px-5 font-medium">Serah-terima</th>
                <th className="px-5 font-medium">Alasan</th>
                <th className="px-5 font-medium">Diterima oleh</th>
                <th className="px-5 font-medium">Waktu</th>
                <th className="px-5 text-right font-medium">Selisih</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className="border-l-[3px] border-l-warning hover:bg-surface-muted max-md:grid max-md:grid-cols-2 max-md:gap-1 max-md:px-5 max-md:py-3"
                >
                  <td className="px-5 py-3 max-md:p-0">
                    {r.bundle ? (
                      <Link href={`/bundle/${r.bundle.id}`} className="num link-code">
                        {r.bundle.code}
                      </Link>
                    ) : (
                      '-'
                    )}
                    <p className="num text-small text-text-muted">{r.bundle?.batch?.code}</p>
                  </td>
                  <td className="px-5 py-3 max-md:col-span-2 max-md:row-start-2 max-md:p-0">
                    {r.from_step} → {r.to_step}
                  </td>
                  <td className="px-5 py-3 text-text-muted max-md:p-0 max-md:text-small">
                    {(effReason(r) && reasonLabel.get(effReason(r)!)) ?? '-'}
                  </td>
                  <td className="px-5 py-3 max-md:p-0 max-md:text-right max-md:text-small max-md:text-text-muted">
                    {(r.movement?.scanned_by && nameOf.get(r.movement.scanned_by)) ?? '-'}
                  </td>
                  <td className="num px-5 py-3 text-small text-text-muted max-md:p-0">{timeFmt.format(new Date(r.created_at))}</td>
                  <td className="px-5 py-3 text-right max-md:col-start-2 max-md:row-start-1 max-md:p-0">
                    <span className="num inline-flex h-7 items-center gap-1.5 rounded-sm bg-warning-soft px-2 font-medium text-warning">
                      <TriangleAlert size={16} strokeWidth={1.5} aria-hidden />−{r.qty} pcs
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <UrlPagination path="/selisih" query={query} total={all.length} unit="flag" />
    </>
  );
}

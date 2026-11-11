import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus } from 'lucide-react';
import { UrlPagination } from '@/components/ui/pagination';
import { Badge } from '@/components/ui/status-badge';
import { TabLink, TabList } from '@/components/ui/tab-link';
import { UrlSelect } from '@/components/ui/url-select';
import { OUTBOUND_STATUS, OUTBOUND_TYPE, isOutboundType, type OutboundStatus, type OutboundType } from '@/lib/outbound';
import { NONE, pageCount, readPaging, withQuery, type PageQuery } from '@/lib/paging';
import { createClient, getCurrentAppUser } from '@/lib/supabase/server';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadError } from '@/components/ui/load-error';
import { PageHeader } from '@/components/ui/page-header';

export const metadata: Metadata = { title: 'Barang keluar' };

const TABS: OutboundStatus[] = ['draft', 'dikirim', 'batal'];

type Row = {
  id: string;
  code: string;
  type: OutboundType;
  destination: string;
  ref_no: string | null;
  status: OutboundStatus;
  created_at: string;
  shipped_at: string | null;
};

const dateFmt = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta' });

/** Outbound documents (surat jalan): drafts being picked, shipped, cancelled. */
export default async function OutboundListPage({ searchParams }: { searchParams: Promise<PageQuery> }) {
  const query = await searchParams;
  const status: OutboundStatus = TABS.includes(query.status as OutboundStatus) ? (query.status as OutboundStatus) : 'draft';
  const type = isOutboundType(query.jenis) ? query.jenis : null;
  const { from, to, page, per } = readPaging(query);

  const supabase = await createClient();
  const me = await getCurrentAppUser();
  const canCreate = me?.roles.some((r) => r === 'gudang' || r === 'supervisor') ?? false;

  const scoped = (s: OutboundStatus) => {
    let q = supabase.from('outbound').select('id', { count: 'exact', head: true }).eq('status', s);
    if (type) q = q.eq('type', type);
    return q;
  };
  let list = supabase
    .from('outbound')
    .select('id, code, type, destination, ref_no, status, created_at, shipped_at')
    .eq('status', status)
    .order(status === 'dikirim' ? 'shipped_at' : 'created_at', { ascending: false })
    .range(from, to);
  if (type) list = list.eq('type', type);

  const [{ data, error }, ...counts] = await Promise.all([list, ...TABS.map(scoped)]);
  const countOf = Object.fromEntries(TABS.map((t, i) => [t, counts[i]?.count ?? 0])) as Record<OutboundStatus, number>;
  const total = countOf[status];
  if (page > pageCount(total, per)) redirect(withQuery('/barang-keluar', query, { page: String(pageCount(total, per)) }));
  const rows = (data ?? []) as Row[];

  // pcs per document: live items, plus returned ones for shipped documents
  const ids = rows.map((r) => r.id);
  const { data: items } = await supabase
    .from('outbound_item')
    .select('outbound_id, returned_at')
    .in('outbound_id', ids.length ? ids : [NONE]);
  const pcs = new Map<string, { live: number; returned: number }>();
  for (const i of (items ?? []) as { outbound_id: string; returned_at: string | null }[]) {
    const e = pcs.get(i.outbound_id) ?? { live: 0, returned: 0 };
    if (i.returned_at) e.returned += 1;
    else e.live += 1;
    pcs.set(i.outbound_id, e);
  }

  return (
    <>
      <PageHeader
        title="Barang keluar"
        description="Surat jalan untuk setiap barang yang meninggalkan gudang."
        actions={
          canCreate && (
            <Link
              href="/barang-keluar/baru"
              className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 font-medium text-primary-foreground hover:bg-primary-hover"
            >
              <Plus size={16} strokeWidth={1.5} aria-hidden /> Dokumen baru
            </Link>
          )
        }
      />

      <div className="mt-6">
        <UrlSelect
          param="jenis"
          label="Jenis dokumen"
          allLabel="Semua jenis"
          options={(Object.keys(OUTBOUND_TYPE) as OutboundType[]).map((t) => ({ value: t, label: OUTBOUND_TYPE[t].label }))}
        />
      </div>

      <TabList label="Status dokumen" className="mt-4">
        {TABS.map((t) => (
          <TabLink
            key={t}
            href={withQuery('/barang-keluar', query, { status: t === 'draft' ? '' : t, page: '' })}
            active={status === t}
            label={OUTBOUND_STATUS[t].label}
            count={countOf[t]}
          />
        ))}
      </TabList>

      {error && (
        <LoadError className="mt-4" />
      )}

      <section role="tabpanel" className="mt-4 overflow-hidden rounded-lg border border-border bg-surface">
        {rows.length === 0 ? (
          <EmptyState variant="document">
            {status === 'draft' ? 'Tidak ada dokumen yang sedang disiapkan.' : `Belum ada dokumen ${OUTBOUND_STATUS[status].label.toLowerCase()}.`}
          </EmptyState>
        ) : (
          <table className="w-full">
            <thead className="bg-surface-muted text-left text-caption tracking-[0.02em] text-text-muted max-md:hidden">
              <tr className="h-10">
                <th className="px-5 font-medium">Dokumen</th>
                <th className="px-5 font-medium">Jenis</th>
                <th className="px-5 font-medium">Tujuan</th>
                <th className="px-5 text-right font-medium">Pcs</th>
                <th className="px-5 text-right font-medium">{status === 'dikirim' ? 'Dikirim' : 'Dibuat'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => {
                const n = pcs.get(r.id) ?? { live: 0, returned: 0 };
                return (
                  <tr key={r.id} className="hover:bg-surface-muted max-md:grid max-md:grid-cols-2 max-md:gap-1 max-md:px-5 max-md:py-3">
                    <td className="px-5 py-3 max-md:p-0">
                      <Link href={`/barang-keluar/${r.id}`} className="num link-code">
                        {r.code}
                      </Link>
                    </td>
                    <td className="px-5 py-3 max-md:justify-self-end max-md:p-0">
                      <Badge tone={r.type === 'penyesuaian' ? 'warning' : r.type === 'jual_bs' ? 'danger' : 'neutral'}>{OUTBOUND_TYPE[r.type].label}</Badge>
                    </td>
                    <td className="px-5 py-3 max-md:col-span-2 max-md:p-0">
                      {r.destination}
                      {r.ref_no && <p className="num text-small text-text-muted">{r.ref_no}</p>}
                    </td>
                    <td className="num px-5 py-3 text-right max-md:p-0 max-md:text-left">
                      {n.live} pcs
                      {n.returned > 0 && <p className="text-small text-text-muted">{n.returned} retur</p>}
                    </td>
                    <td className="num px-5 py-3 text-right text-small text-text-muted max-md:p-0">
                      {dateFmt.format(new Date(r.shipped_at ?? r.created_at))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
      <UrlPagination path="/barang-keluar" query={query} total={total} unit="dokumen" />
    </>
  );
}

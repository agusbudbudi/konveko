import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadError } from '@/components/ui/load-error';
import { PageHeader } from '@/components/ui/page-header';
import { UrlPagination } from '@/components/ui/pagination';
import { Badge } from '@/components/ui/status-badge';
import { calendarDaysAgo } from '@/lib/date';
import { slicePage, withQuery, type PageQuery } from '@/lib/paging';
import { COUNT_STATUS, accuracy, type CountStatus } from '@/lib/stock-count';
import { createClient, getCurrentAppUser } from '@/lib/supabase/server';
import { NewCountButton, type RackOption } from './new-count';

export const metadata: Metadata = { title: 'Stok opname' };

type Row = {
  id: string;
  code: string;
  status: CountStatus;
  note: string | null;
  created_at: string;
  approved_at: string | null;
  racks: {
    status: 'menghitung' | 'ditutup';
    expected: number | null;
    matched: number | null;
    missing: number | null;
    unlabeled: number | null;
    location: { code: string } | null;
  }[];
};

const dateFmt = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta' });

/** Fase 2c: every stock count, newest first, and the entry point for a new one. */
export default async function StockCountListPage({ searchParams }: { searchParams: Promise<PageQuery> }) {
  const query = await searchParams;
  const supabase = await createClient();
  const user = await getCurrentAppUser();
  const canCreate = user?.roles.some((r) => r === 'gudang' || r === 'supervisor') ?? false;

  const [{ data, error }, { data: locs }, { data: stock }] = await Promise.all([
    supabase
      .from('stock_count')
      .select('id, code, status, note, created_at, approved_at, racks:stock_count_location(status, expected, matched, missing, unlabeled, location:location(code))')
      .order('created_at', { ascending: false })
      .limit(500),
    supabase.from('location').select('id, code, kind').eq('is_active', true).order('code'),
    supabase.from('stock_location').select('location_id, qty').not('location_id', 'is', null),
  ]);
  const rows = (data ?? []) as unknown as Row[];
  const paged = slicePage(rows, query);
  if (paged.outOfRange) redirect(withQuery('/opname', query, { page: String(paged.pages) }));

  const qtyOf = new Map<string, number>();
  for (const s of (stock ?? []) as { location_id: string; qty: number }[]) qtyOf.set(s.location_id, (qtyOf.get(s.location_id) ?? 0) + s.qty);
  const busyOf = new Map<string, string>();
  for (const r of rows.filter((x) => x.status === 'menghitung' || x.status === 'review')) {
    for (const k of r.racks) if (k.location) busyOf.set(k.location.code, r.code);
  }
  const rackOptions: RackOption[] = ((locs ?? []) as { id: string; code: string; kind: 'stok' | 'reject' }[]).map((l) => ({
    code: l.code,
    kind: l.kind,
    qty: qtyOf.get(l.id) ?? 0,
    busy: busyOf.get(l.code) ?? null,
  }));
  const openCount = rows.filter((r) => r.status === 'menghitung' || r.status === 'review').length;
  const now = new Date();

  return (
    <>
      <PageHeader
        title="Stok opname"
        description={
          <>
            Hitung isi rak, bandingkan dengan sistem, lalu setujui koreksinya.
            {openCount > 0 && (
              <>
                {' '}
                <span className="num text-text">{openCount}</span> opname sedang berjalan.
              </>
            )}
          </>
        }
        actions={canCreate && <NewCountButton racks={rackOptions} />}
      />

      {error && <LoadError className="mt-6" />}

      <div className="mt-6 overflow-hidden rounded-lg border border-border bg-surface">
        {paged.rows.length === 0 ? (
          <EmptyState variant="box" hint={canCreate ? 'Mulai dengan Opname baru, lalu hitung raknya di HP lewat Scan gudang → Opname.' : undefined}>
            Belum ada stok opname.
          </EmptyState>
        ) : (
          <table className="w-full">
            <thead className="bg-surface-muted text-left text-caption tracking-[0.02em] text-text-muted max-md:hidden">
              <tr className="h-10">
                <th className="px-5 font-medium">Opname</th>
                <th className="px-5 font-medium">Rak</th>
                <th className="px-5 font-medium">Status</th>
                <th className="px-5 text-right font-medium">Hilang</th>
                <th className="px-5 text-right font-medium">Stok awal</th>
                <th className="px-5 text-right font-medium">Akurasi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {paged.rows.map((r) => {
                const done = r.status === 'disetujui';
                const sum = (k: 'expected' | 'matched' | 'missing' | 'unlabeled') => r.racks.reduce((n, x) => n + (x[k] ?? 0), 0);
                const st = COUNT_STATUS[r.status];
                const open = r.status === 'menghitung' || r.status === 'review';
                const age = calendarDaysAgo(r.created_at, now);
                const closed = r.racks.filter((x) => x.status === 'ditutup').length;
                return (
                  <tr key={r.id} className="hover:bg-surface-muted max-md:grid max-md:grid-cols-2 max-md:gap-1 max-md:px-5 max-md:py-3">
                    <td className="px-5 py-3 max-md:p-0">
                      <Link href={`/opname/${r.id}`} className="num link-code">
                        {r.code}
                      </Link>
                      <p className="text-small text-text-muted">
                        {dateFmt.format(new Date(r.created_at))}
                        {r.note && <> · {r.note}</>}
                      </p>
                    </td>
                    <td className="num px-5 py-3 max-md:col-span-2 max-md:row-start-2 max-md:p-0 max-md:text-small">
                      {r.racks.map((x) => x.location?.code).filter(Boolean).sort().join(', ')}
                      {r.status === 'menghitung' && (
                        <p className="text-small text-text-muted">
                          {closed} dari {r.racks.length} rak selesai
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-3 max-md:col-start-2 max-md:row-start-1 max-md:justify-self-end max-md:p-0">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <Badge tone={st.tone}>{st.label}</Badge>
                        {open && age >= 1 && <Badge tone="warning">Rak terkunci {age} hari</Badge>}
                      </span>
                    </td>
                    <td className={`num px-5 py-3 text-right max-md:p-0 max-md:text-left max-md:text-small ${done && sum('missing') > 0 ? 'text-danger' : ''}`}>
                      {done ? sum('missing') : '-'}
                    </td>
                    <td className="num px-5 py-3 text-right max-md:p-0 max-md:text-small">{done ? sum('unlabeled') : '-'}</td>
                    <td className="num px-5 py-3 text-right max-md:p-0 max-md:text-small">
                      {done ? accuracy(sum('matched'), sum('expected')) : '-'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <UrlPagination path="/opname" query={query} total={rows.length} unit="opname" />
    </>
  );
}

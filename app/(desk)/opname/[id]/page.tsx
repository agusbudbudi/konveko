import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Printer } from 'lucide-react';
import { SetCrumb } from '@/components/nav/sidebar-nav';
import { EmptyState } from '@/components/ui/empty-state';
import { InlineAlert } from '@/components/ui/inline-alert';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/status-badge';
import { TabLink, TabList } from '@/components/ui/tab-link';
import { withQuery, type PageQuery } from '@/lib/paging';
import { COUNT_STATUS, LINE_KIND, LINE_ORDER, accuracy, type CountStatus, type LineKind } from '@/lib/stock-count';
import { createClient, getCurrentAppUser } from '@/lib/supabase/server';
import { ApproveButton, CancelCountButton, DropScanButton, ReopenRackButton } from './controls';

export const metadata: Metadata = { title: 'Detail stok opname' };

type Count = {
  id: string;
  code: string;
  status: CountStatus;
  note: string | null;
  created_at: string;
  approved_at: string | null;
  cancel_note: string | null;
  outbound: { id: string; code: string } | null;
  racks: {
    location_id: string;
    status: 'menghitung' | 'ditutup';
    closed_at: string | null;
    expected: number | null;
    matched: number | null;
    missing: number | null;
    moved_in: number | null;
    wrong_kind: number | null;
    findings: number | null;
    unlabeled: number | null;
    location: { code: string; kind: 'stok' | 'reject' } | null;
  }[];
};

type Line = {
  location_id: string;
  kind: LineKind;
  piece_id: string;
  code: string;
  variant_id: string;
  from_code: string | null;
  outbound_code: string | null;
};
type Review = { lines: Line[]; unlabeled: { location_id: string; variant_id: string; condition: 'baik' | 'rusak'; qty: number }[] };

const when = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' });

export default async function StockCountPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<PageQuery> }) {
  const { id } = await params;
  const query = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const user = await getCurrentAppUser();
  const isSupervisor = user?.roles.includes('supervisor') ?? false;
  const canReview = isSupervisor || (user?.roles.includes('admin') ?? false);

  const { data } = await supabase
    .from('stock_count')
    .select(
      'id, code, status, note, created_at, approved_at, cancel_note, outbound:outbound(id, code), racks:stock_count_location(location_id, status, closed_at, expected, matched, missing, moved_in, wrong_kind, findings, unlabeled, location:location(code, kind))',
    )
    .eq('id', id)
    .maybeSingle();
  const c = data as unknown as Count | null;
  if (!c) notFound();
  const racks = [...c.racks].sort((a, b) => (a.location?.code ?? '').localeCompare(b.location?.code ?? ''));
  const rackCode = new Map(racks.map((r) => [r.location_id, r.location?.code ?? '-']));

  // scanned per rack (counts only), visible to everyone
  const { data: scans } = await supabase.from('stock_count_scan').select('location_id, piece_id, qty').eq('count_id', c.id);
  const scanned = new Map<string, { pieces: number; unlabeled: number }>();
  for (const s of (scans ?? []) as { location_id: string; piece_id: string | null; qty: number | null }[]) {
    const e = scanned.get(s.location_id) ?? { pieces: 0, unlabeled: 0 };
    if (s.piece_id) e.pieces++;
    else e.unlabeled += s.qty ?? 0;
    scanned.set(s.location_id, e);
  }

  // the review itself is for supervisors and admins only (counting is blind)
  const review = canReview && c.status !== 'batal' ? ((await supabase.rpc('stock_count_review', { p_count_id: c.id })).data as Review | null) : null;
  const lines = review?.lines ?? [];
  const variantIds = [...new Set([...lines.map((l) => l.variant_id), ...(review?.unlabeled ?? []).map((u) => u.variant_id)])];
  const { data: vs } = variantIds.length
    ? await supabase.from('product_variant').select('id, sku, product_name, size, color').in('id', variantIds)
    : { data: [] };
  const variant = new Map((vs ?? []).map((v) => [v.id, `${v.product_name} ${v.size} · ${v.color}`]));
  const countOf = (k: LineKind) => lines.filter((l) => l.kind === k).length;
  const kinds = LINE_ORDER.filter((k) => countOf(k) > 0);
  const tab: LineKind | 'tanpa_label' =
    (query.tab === 'tanpa_label' && review?.unlabeled.length) ? 'tanpa_label'
    : kinds.includes(query.tab as LineKind) ? (query.tab as LineKind)
    : kinds[0] ?? 'cocok';
  const shown = lines.filter((l) => l.kind === tab);
  const ganda = lines.filter((l) => l.kind === 'ganda');
  const unlabeledTotal = (review?.unlabeled ?? []).reduce((n, u) => n + u.qty, 0);
  const st = COUNT_STATUS[c.status];
  const open = c.status === 'menghitung' || c.status === 'review';
  const path = `/opname/${c.id}`;

  return (
    <>
      <SetCrumb root items={[{ label: 'Gudang' }, { label: 'Stok opname', href: '/opname' }, { label: c.code }]} />
      <PageHeader
        title={<span className="num">{c.code}</span>}
        badges={<Badge tone={st.tone}>{st.label}</Badge>}
        description={
          <>
            Dibuat {when.format(new Date(c.created_at))}
            {c.note && <> · {c.note}</>}
          </>
        }
        meta={
          c.status === 'disetujui' && c.approved_at ? (
            <>
              Disetujui {when.format(new Date(c.approved_at))}
              {c.outbound && (
                <>
                  {' '}
                  · pcs hilang keluar di{' '}
                  <Link href={`/barang-keluar/${c.outbound.id}`} className="num link-code">
                    {c.outbound.code}
                  </Link>
                </>
              )}
            </>
          ) : c.status === 'batal' ? (
            <>Dibatalkan{c.cancel_note && <>: {c.cancel_note}</>}</>
          ) : null
        }
        actions={
          isSupervisor &&
          open && (
            <div className="flex flex-wrap gap-2">
              <CancelCountButton countId={c.id} code={c.code} />
              {c.status === 'review' && (
                <ApproveButton
                  countId={c.id}
                  code={c.code}
                  blocked={ganda.length > 0}
                  summary={{
                    hilang: countOf('hilang'),
                    pindah: countOf('pindah') + countOf('belum_di_rak'),
                    jenisSalah: countOf('jenis_salah'),
                    unlabeled: unlabeledTotal,
                    findings: countOf('keluar') + countOf('tidak_berlaku'),
                  }}
                />
              )}
            </div>
          )
        }
      />

      {c.status === 'menghitung' && (
        <InlineAlert tone="info" className="mt-6">
          Hitung di HP: Scan gudang → Opname → {c.code}. Rak terkunci sampai opname disetujui atau dibatalkan.
        </InlineAlert>
      )}
      {ganda.length > 0 && (
        <InlineAlert tone="danger" className="mt-6">
          {new Set(ganda.map((g) => g.piece_id)).size} pcs discan di lebih dari satu rak. Hapus scan yang salah
          di tab Ganda, atau hitung ulang raknya, sebelum menyetujui.
        </InlineAlert>
      )}
      {c.status === 'disetujui' && unlabeledTotal > 0 && (
        <InlineAlert tone="info" className="mt-6">
          {unlabeledTotal} pcs stok awal dibuat dari opname ini.{' '}
          <Link href={`/print/pieces?count=${c.id}`} className="inline-flex items-center gap-1 font-medium underline">
            <Printer size={14} strokeWidth={1.5} aria-hidden /> Cetak labelnya
          </Link>
        </InlineAlert>
      )}

      <section className="mt-6 overflow-hidden rounded-lg border border-border bg-surface">
        <h2 className="px-5 py-4 text-h2">Rak</h2>
        <table className="w-full border-t border-border">
          <thead className="bg-surface-muted text-left text-caption tracking-[0.02em] text-text-muted max-md:hidden">
            <tr className="h-10">
              <th className="px-5 font-medium">Rak</th>
              <th className="px-5 font-medium">Status</th>
              <th className="px-5 text-right font-medium">Discan</th>
              <th className="px-5 text-right font-medium">Tanpa label</th>
              {c.status === 'disetujui' && (
                <>
                  <th className="px-5 text-right font-medium">Seharusnya</th>
                  <th className="px-5 text-right font-medium">Hilang</th>
                  <th className="px-5 text-right font-medium">Akurasi</th>
                </>
              )}
              <th className="px-5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {racks.map((r) => {
              const s = scanned.get(r.location_id) ?? { pieces: 0, unlabeled: 0 };
              return (
                <tr key={r.location_id} className="max-md:grid max-md:grid-cols-2 max-md:gap-1 max-md:px-5 max-md:py-3">
                  <td className="px-5 py-3 max-md:p-0">
                    <Link href={`/stok/rak/${r.location?.code}`} className="num link-code">
                      {r.location?.code}
                    </Link>
                    <span className="ml-2 text-small text-text-muted">{r.location?.kind === 'reject' ? 'reject' : 'stok'}</span>
                  </td>
                  <td className="px-5 py-3 max-md:justify-self-end max-md:p-0">
                    <Badge tone={r.status === 'ditutup' ? 'success' : 'info'}>{r.status === 'ditutup' ? 'Ditutup' : 'Menghitung'}</Badge>
                  </td>
                  <td className="num px-5 py-3 text-right max-md:p-0 max-md:text-left max-md:text-small">{s.pieces} pcs</td>
                  <td className="num px-5 py-3 text-right max-md:p-0 max-md:text-small">{s.unlabeled || '-'}</td>
                  {c.status === 'disetujui' && (
                    <>
                      <td className="num px-5 py-3 text-right max-md:p-0 max-md:text-small">{r.expected}</td>
                      <td className={`num px-5 py-3 text-right max-md:p-0 max-md:text-small ${(r.missing ?? 0) > 0 ? 'text-danger' : ''}`}>{r.missing}</td>
                      <td className="num px-5 py-3 text-right max-md:p-0 max-md:text-small">{accuracy(r.matched ?? 0, r.expected ?? 0)}</td>
                    </>
                  )}
                  <td className="px-5 py-3 text-right max-md:col-span-2 max-md:p-0">
                    {isSupervisor && open && (r.status === 'ditutup' || s.pieces + s.unlabeled > 0) && (
                      <ReopenRackButton countId={c.id} rack={r.location?.code ?? ''} />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {canReview && review && (lines.length > 0 || review.unlabeled.length > 0) && (
        <section className="mt-6 rounded-lg border border-border bg-surface">
          <div className="px-5 pt-5">
            <h2 className="text-h2">{c.status === 'disetujui' ? 'Hasil' : 'Selisih'}</h2>
            {c.status === 'menghitung' && <p className="text-small text-text-muted">Sementara: rak yang belum selesai dihitung bisa tampil sebagai hilang.</p>}
          </div>
          <TabList label="Jenis hasil" className="mt-3 px-5">
            {kinds.map((k) => (
              <TabLink key={k} href={withQuery(path, query, { tab: k })} active={tab === k} label={LINE_KIND[k].label} count={countOf(k)} />
            ))}
            {review.unlabeled.length > 0 && (
              <TabLink href={withQuery(path, query, { tab: 'tanpa_label' })} active={tab === 'tanpa_label'} label="Tanpa label" count={unlabeledTotal} />
            )}
          </TabList>
          {tab === 'tanpa_label' ? (
            <>
              <p className="px-5 pt-3 text-small text-text-muted">Barang tanpa label. Menjadi pcs stok awal saat disetujui.</p>
              <ul className="mt-2 divide-y divide-border border-t border-border">
                {review.unlabeled.map((u) => (
                  <li key={`${u.location_id}:${u.variant_id}:${u.condition}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3">
                    <span className="num w-16 font-medium">{rackCode.get(u.location_id)}</span>
                    <span className="min-w-0 flex-1">{variant.get(u.variant_id) ?? '-'}</span>
                    <Badge tone={u.condition === 'baik' ? 'success' : 'danger'}>{u.condition}</Badge>
                    <span className="num">{u.qty} pcs</span>
                  </li>
                ))}
              </ul>
            </>
          ) : shown.length === 0 ? (
            <EmptyState variant="check" compact>
              Tidak ada.
            </EmptyState>
          ) : (
            <>
              <p className="px-5 pt-3 text-small text-text-muted">{LINE_KIND[tab].hint}</p>
              <ul className="mt-2 divide-y divide-border border-t border-border">
                {shown.map((l) => (
                  <li key={`${l.location_id}:${l.piece_id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3">
                    <span className="num w-16 font-medium">{rackCode.get(l.location_id)}</span>
                    <Link href={`/pcs/${l.code}`} className="num link-code">
                      {l.code}
                    </Link>
                    <span className="min-w-0 flex-1 truncate text-text-muted">{variant.get(l.variant_id) ?? '-'}</span>
                    {l.kind === 'pindah' && l.from_code && <span className="num text-small text-text-muted">di sistem: {l.from_code}</span>}
                    {l.kind === 'keluar' && l.outbound_code && <span className="num text-small text-text-muted">keluar di {l.outbound_code}</span>}
                    {l.kind === 'ganda' && isSupervisor && open && (
                      <DropScanButton countId={c.id} rack={rackCode.get(l.location_id) ?? ''} piece={l.code} />
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
    </>
  );
}

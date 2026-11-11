import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Printer, ScanLine } from 'lucide-react';
import { SetCrumb } from '@/components/nav/sidebar-nav';
import { Badge } from '@/components/ui/status-badge';
import { UUID } from '@/lib/master';
import { OUTBOUND_STATUS, OUTBOUND_TYPE, type OutboundProgress, type OutboundStatus, type OutboundType } from '@/lib/outbound';
import { createClient, getCurrentAppUser } from '@/lib/supabase/server';
import { AddByCode, DocumentActions, ItemAction } from './outbound-detail';
import { buildHistory, type HistoryEvent } from '@/lib/outbound-history';
import { OutboundHistory } from './history';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';

export const metadata: Metadata = { title: 'Detail barang keluar' };

type Doc = {
  id: string;
  code: string;
  type: OutboundType;
  destination: string;
  ref_no: string | null;
  note: string | null;
  status: OutboundStatus;
  created_by: string;
  created_at: string;
  shipped_by: string | null;
  shipped_at: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
};
type Item = {
  id: string;
  added_at: string;
  returned_at: string | null;
  piece: {
    code: string;
    grade: 'baik' | 'reject';
    condition: 'baik' | 'rusak';
    status: string;
    location: { code: string } | null;
    variant: { sku: string; product_name: string; size: string; color: string } | null;
  } | null;
};

const when = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' });

export default async function OutboundDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();
  const { data } = await supabase.from('outbound').select('*').eq('id', id).maybeSingle();
  if (!data) notFound();
  const doc = data as Doc;

  const [me, { data: progressData }, { data: itemData }, { data: eventData }] = await Promise.all([
    getCurrentAppUser(),
    supabase.rpc('outbound_progress', { p_outbound_id: id }),
    supabase
      .from('outbound_item')
      .select('id, added_at, returned_at, piece:piece(code, grade, condition, status, location:location(code), variant:product_variant(sku, product_name, size, color))')
      .eq('outbound_id', id)
      .order('added_at', { ascending: false }),
    supabase
      .from('piece_event')
      .select('seq, type, note, created_at, created_by, piece:piece(code)')
      .eq('outbound_id', id)
      .order('seq'),
  ]);
  const events = (eventData ?? []) as unknown as HistoryEvent[];
  const history = buildHistory(doc, events);
  const userIds = [...new Set([doc.created_by, doc.shipped_by, doc.cancelled_by, ...events.map((e) => e.created_by)].filter((x): x is string => !!x))];
  const { data: names } = await supabase.rpc('staff_names', { p_ids: userIds });
  const progress = (progressData ?? []) as OutboundProgress;
  const items = (itemData ?? []) as unknown as Item[];
  const live = items.filter((i) => !i.returned_at);
  const returned = items.filter((i) => i.returned_at);
  const nameOf = new Map(((names ?? []) as { id: string; name: string }[]).map((n) => [n.id, n.name]));
  const roles = me?.roles ?? [];
  const canWork = doc.type === 'penyesuaian' ? roles.includes('supervisor') : roles.some((r) => r === 'gudang' || r === 'supervisor');
  const draft = doc.status === 'draft';
  const planned = progress.some((p) => p.planned > 0);

  return (
    <>
      <SetCrumb items={[{ label: doc.code }]} />
      <Link href="/barang-keluar" className="inline-flex h-10 items-center gap-2 text-small text-text-muted hover:text-text lg:hidden">
        <ArrowLeft size={16} strokeWidth={1.5} aria-hidden /> Barang keluar
      </Link>

      <PageHeader
        title={<span className="num">{doc.code}</span>}
        badges={
          <>
            <Badge tone={OUTBOUND_STATUS[doc.status].tone}>{OUTBOUND_STATUS[doc.status].label}</Badge>
            <Badge tone={doc.type === 'penyesuaian' ? 'warning' : doc.type === 'jual_bs' ? 'danger' : 'neutral'}>{OUTBOUND_TYPE[doc.type].label}</Badge>
          </>
        }
        description={
          <>
            {doc.type === 'penyesuaian' ? doc.destination : <>Ke {doc.destination}</>}
            {doc.ref_no && (
              <>
                {' '}· <span className="num">{doc.ref_no}</span>
              </>
            )}
          </>
        }
        actions={
          <>
          {draft && canWork && (
            <Link
              href={`/scan/gudang/keluar?doc=${doc.id}`}
              className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-surface px-4 font-medium hover:border-border-strong"
            >
              <ScanLine size={16} strokeWidth={1.5} aria-hidden /> Scan di HP
            </Link>
          )}
          {doc.status === 'dikirim' && (
            <Link
              href={`/print/surat-jalan/${doc.id}`}
              className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-surface px-4 font-medium hover:border-border-strong"
            >
              <Printer size={16} strokeWidth={1.5} aria-hidden /> Cetak surat jalan
            </Link>
          )}
          {draft && canWork && <DocumentActions id={doc.id} code={doc.code} count={live.length} destination={doc.destination} adjustment={doc.type === 'penyesuaian'} />}
          </>
        }
      />

      <section className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex flex-col gap-4">
          {draft && canWork && <AddByCode id={doc.id} />}

          <div className="overflow-hidden rounded-lg border border-border bg-surface">
            <div className="flex items-baseline justify-between gap-3 px-5 pt-5 pb-3">
              <h2 className="text-h2">{planned ? 'Rencana dan hasil scan' : 'Per variant'}</h2>
              <p className="num text-small text-text-muted">{live.length} pcs</p>
            </div>
            {progress.length === 0 ? (
              <div className="border-t border-border"><EmptyState variant="box" compact>{draft ? 'Belum ada barang. Scan label pcs atau bundle.' : 'Tidak ada barang.'}</EmptyState></div>
            ) : (
              <table className="w-full border-t border-border">
                <thead className="bg-surface-muted text-left text-caption tracking-[0.02em] text-text-muted">
                  <tr className="h-10">
                    <th className="px-5 font-medium">Variant</th>
                    {planned && <th className="px-5 text-right font-medium">Rencana</th>}
                    <th className="px-5 text-right font-medium">{doc.status === 'dikirim' ? 'Dikirim' : 'Discan'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {progress.map((p) => {
                    const over = p.planned > 0 && p.scanned > p.planned;
                    const short = p.planned > 0 && p.scanned < p.planned;
                    return (
                      <tr key={p.variant_id}>
                        <td className="px-5 py-3">
                          {p.label}
                          <p className="num text-small text-text-muted">{p.sku}</p>
                        </td>
                        {planned && <td className="num px-5 py-3 text-right text-text-muted">{p.planned || '-'}</td>}
                        <td className={`num px-5 py-3 text-right font-medium ${over ? 'text-warning' : short ? 'text-text-muted' : ''}`}>
                          {p.scanned}
                          {over && <p className="text-small font-normal">lebih {p.scanned - p.planned}</p>}
                          {short && <p className="text-small font-normal">kurang {p.planned - p.scanned}</p>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {items.length > 0 && (
            <div className="overflow-hidden rounded-lg border border-border bg-surface">
              <h2 className="px-5 pt-5 pb-3 text-h3">Daftar pcs</h2>
              <ul className="divide-y divide-border border-t border-border">
                {[...live, ...returned].map((i) => {
                  const p = i.piece;
                  if (!p) return null;
                  const bs = p.grade === 'reject' || p.condition === 'rusak';
                  return (
                    <li key={i.id} className={`flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-2.5 ${i.returned_at ? 'text-text-muted' : ''}`}>
                      <Link href={`/pcs/${p.code}`} className="num link-code w-28">
                        {p.code}
                      </Link>
                      <span className="min-w-0 flex-1 truncate text-small">
                        {p.variant ? `${p.variant.product_name} ${p.variant.size} · ${p.variant.color}` : '-'}
                      </span>
                      {bs && <Badge tone="danger">{p.grade === 'reject' ? 'Reject' : 'Rusak'}</Badge>}
                      {draft && <span className="num text-small text-text-muted">{p.location ? `Rak ${p.location.code}` : 'Belum di rak'}</span>}
                      {i.returned_at && <span className="text-small">Retur {when.format(new Date(i.returned_at))}</span>}
                      {canWork && !i.returned_at && (draft || doc.status === 'dikirim') && (
                        <ItemAction id={doc.id} code={p.code} mode={draft ? 'remove' : 'return'} />
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <OutboundHistory entries={history} nameOf={nameOf} />
        </div>

        <aside className="flex flex-col gap-3 self-start rounded-lg border border-border bg-surface p-5 text-small">
          <Meta label="Jenis" value={OUTBOUND_TYPE[doc.type].label} />
          <Meta label={doc.type === 'penyesuaian' ? 'Keterangan' : 'Tujuan'} value={doc.destination} />
          {doc.ref_no && <Meta label="No. referensi" value={doc.ref_no} mono />}
          {doc.note && <Meta label={doc.type === 'penyesuaian' ? 'Alasan' : 'Catatan'} value={doc.note} />}
          <Meta label="Dibuat" value={`${when.format(new Date(doc.created_at))} · ${nameOf.get(doc.created_by) ?? '-'}`} />
          {doc.shipped_at && <Meta label="Dikirim" value={`${when.format(new Date(doc.shipped_at))} · ${nameOf.get(doc.shipped_by ?? '') ?? '-'}`} />}
          {doc.cancelled_at && <Meta label="Dibatalkan" value={`${when.format(new Date(doc.cancelled_at))} · ${nameOf.get(doc.cancelled_by ?? '') ?? '-'}`} />}
          {returned.length > 0 && <Meta label="Retur" value={`${returned.length} pcs`} />}
        </aside>
      </section>
    </>
  );
}

function Meta({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-caption tracking-[0.02em] text-text-muted">{label}</p>
      <p className={mono ? 'num' : undefined}>{value}</p>
    </div>
  );
}

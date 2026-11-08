import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ImageIcon, Printer } from 'lucide-react';
import { ReconciliationBar, ReconciliationLegend } from '@/components/recon/reconciliation-bar';
import { InlineAlert } from '@/components/ui/inline-alert';
import { Badge, StatusBadge } from '@/components/ui/status-badge';
import { CORRECTABLE, MOVEMENT_LABEL, qtySummary, type MovementType } from '@/lib/movement';
import { createClient, getCurrentAppUser } from '@/lib/supabase/server';
import type { BundleStatus, Reason } from '@/lib/types';
import { CorrectionPanel } from './correction-panel';
import { ResolveFlag } from './resolve-flag';

export const metadata: Metadata = { title: 'Detail bundle' };

type Movement = {
  id: string;
  seq: number;
  type: MovementType;
  from_holder_id: string | null;
  to_holder_id: string | null;
  qty_sent: number | null;
  qty_received: number | null;
  qty_good: number | null;
  qty_reject: number | null;
  reason_id: string | null;
  note: string | null;
  photo_path: string | null;
  corrects_movement_id: string | null;
  is_void: boolean;
  scanned_by: string;
  scanned_at: string;
};

type Discrepancy = {
  id: string;
  movement_id: string;
  qty: number;
  from_step: string;
  to_step: string;
  status: 'terbuka' | 'selesai';
  note: string | null;
  created_at: string;
};

const timeFmt = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Jakarta',
});

export default async function BundleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const supabase = await createClient();
  const user = await getCurrentAppUser();
  const isSupervisor = user?.roles.includes('supervisor') ?? false;

  const [bundleRes, reconRes, movRes, effRes, reasonRes, discRes, childRes] = await Promise.all([
    supabase
      .from('bundle')
      .select(
        'id, code, target_qty, parent_bundle_id, batch:production_batch(id, code), variant:product_variant(sku, product_name, size, color), holder:holder!bundle_current_holder_id_fkey(name)',
      )
      .eq('id', id)
      .maybeSingle(),
    supabase.from('bundle_reconciliation').select('*').eq('bundle_id', id).maybeSingle(),
    supabase.from('movement').select('*').eq('bundle_id', id).order('seq'),
    supabase.from('effective_movement').select('id, seq, type').eq('bundle_id', id).order('seq'),
    supabase.from('reason').select('id, type, label'),
    supabase.from('discrepancy').select('*').eq('bundle_id', id).order('created_at'),
    supabase.from('bundle').select('id, code, target_qty').eq('parent_bundle_id', id).order('code'),
  ]);

  type BundleRow = {
    id: string;
    code: string;
    target_qty: number;
    parent_bundle_id: string | null;
    batch: { id: string; code: string } | null;
    variant: { sku: string; product_name: string; size: string; color: string } | null;
    holder: { name: string } | null;
  };
  const bundle = bundleRes.data as unknown as BundleRow | null;
  const recon = reconRes.data as
    | { status: BundleStatus; is_active: boolean; ref_qty: number; target_qty: number; ready: number; reject: number; wip_menunggu: number; wip_dikerjakan: number; selisih: number }
    | null;
  if (!bundle || !recon) notFound();

  const movements = (movRes.data ?? []) as Movement[];
  const effective = (effRes.data ?? []) as { id: string; seq: number; type: MovementType }[];
  const effectiveIds = new Set(effective.map((e) => e.id));
  const latest = effective.at(-1);
  const correctableId = latest && CORRECTABLE.includes(latest.type) ? latest.id : null;
  const reasons = new Map(((reasonRes.data ?? []) as Reason[]).map((r) => [r.id, r]));
  const discrepancies = (discRes.data ?? []) as Discrepancy[];
  const children = (childRes.data ?? []) as { id: string; code: string; target_qty: number }[];

  const parent = bundle.parent_bundle_id
    ? (await supabase.from('bundle').select('id, code').eq('id', bundle.parent_bundle_id).maybeSingle()).data
    : null;

  // Names: holders (readable by staff) and scanners (via staff_names, id + name only).
  const holderIds = [...new Set(movements.flatMap((m) => [m.from_holder_id, m.to_holder_id]).filter(Boolean))] as string[];
  const userIds = [...new Set(movements.map((m) => m.scanned_by))];
  const [holderRes, nameRes] = await Promise.all([
    holderIds.length ? supabase.from('holder').select('id, name').in('id', holderIds) : Promise.resolve({ data: [] }),
    userIds.length ? supabase.rpc('staff_names', { p_ids: userIds }) : Promise.resolve({ data: [] }),
  ]);
  const holderName = new Map(((holderRes.data ?? []) as { id: string; name: string }[]).map((h) => [h.id, h.name]));
  const userName = new Map(((nameRes.data ?? []) as { id: string; name: string }[]).map((u) => [u.id, u.name]));

  // Signed URLs for selisih photos (private bucket, 10 minutes)
  const photoUrl = new Map<string, string>();
  await Promise.all(
    movements
      .filter((m) => m.photo_path)
      .map(async (m) => {
        const { data } = await supabase.storage.from('selisih-photos').createSignedUrl(m.photo_path!, 600);
        if (data?.signedUrl) photoUrl.set(m.id, data.signedUrl);
      }),
  );

  const originals = movements.filter((m) => m.type !== 'correction');
  const correctionsOf = (mid: string) => movements.filter((m) => m.corrects_movement_id === mid);
  const v = bundle.variant;
  const openFlags = discrepancies.filter((d) => d.status === 'terbuka');

  return (
    <>
      <Link
        href={bundle.batch ? `/batch/${bundle.batch.id}` : '/batch'}
        className="inline-flex h-10 items-center gap-2 text-small text-text-muted hover:text-text"
      >
        <ArrowLeft size={16} strokeWidth={1.5} aria-hidden /> Batch <span className="num">{bundle.batch?.code}</span>
      </Link>

      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="num text-h1">{bundle.code}</h1>
            <StatusBadge status={recon.status} />
            {openFlags.length > 0 && <Badge tone="warning">Selisih</Badge>}
          </div>
          <p className="mt-1 text-text-muted">
            {v ? `${v.product_name} ${v.size} · ${v.color}` : '-'} · <span className="num">{v?.sku}</span>
            {bundle.holder && recon.is_active && <> · dipegang {bundle.holder.name}</>}
          </p>
          {parent && (
            <p className="text-small text-text-muted">
              Pecahan dari{' '}
              <Link href={`/bundle/${parent.id}`} className="num text-primary hover:underline">
                {parent.code}
              </Link>
            </p>
          )}
        </div>
        {recon.is_active && (
          <Link
            href={`/print/labels?bundle=${bundle.id}`}
            className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-surface px-4 font-medium hover:border-border-strong"
          >
            <Printer size={16} strokeWidth={1.5} aria-hidden /> Cetak ulang label
          </Link>
        )}
      </div>

      {children.length > 0 && (
        <InlineAlert tone="info" className="mt-6">
          Bundle ini sudah dipecah menjadi{' '}
          {children.map((c, i) => (
            <span key={c.id}>
              {i > 0 && ', '}
              <Link href={`/bundle/${c.id}`} className="num font-medium underline">
                {c.code}
              </Link>{' '}
              ({c.target_qty} pcs)
            </span>
          ))}
          . Labelnya tidak berlaku lagi.
        </InlineAlert>
      )}

      {recon.is_active && (
        <section className="mt-6 grid gap-4 lg:grid-cols-[1fr_280px]">
          <div className="rounded-lg border border-border bg-surface p-5">
            <h2 className="text-h2">Rekonsiliasi</h2>
            <div className="mt-4 flex flex-col gap-3">
              <ReconciliationBar r={{ ...recon, target: recon.target_qty }} />
              <ReconciliationLegend r={{ ...recon, target: recon.target_qty }} />
            </div>
          </div>
          <div className="rounded-lg border border-border bg-surface p-5">
            <p className="text-caption tracking-[0.02em] text-text-muted">Qty acuan</p>
            <p className="num mt-1 text-display">{recon.ref_qty}</p>
            <p className="text-small text-text-muted">dari target {recon.target_qty} pcs</p>
          </div>
        </section>
      )}

      {discrepancies.length > 0 && (
        <section className="mt-6 rounded-lg border border-border bg-surface">
          <h2 className="px-5 pt-5 text-h2">Flag selisih</h2>
          <ul className="mt-3 divide-y divide-border border-t border-border">
            {discrepancies.map((d) => (
              <li
                key={d.id}
                className={`flex flex-wrap items-start justify-between gap-3 px-5 py-4 ${d.status === 'terbuka' ? 'border-l-[3px] border-l-warning' : ''}`}
              >
                <div>
                  <p>
                    <span className="num font-medium">{d.qty}</span> pcs, {d.from_step} → {d.to_step}
                  </p>
                  <p className="text-small text-text-muted">
                    {timeFmt.format(new Date(d.created_at))}
                    {d.note && <> · {d.note}</>}
                  </p>
                </div>
                {d.status === 'terbuka' ? (
                  isSupervisor ? <ResolveFlag id={d.id} /> : <Badge tone="warning">Terbuka</Badge>
                ) : (
                  <Badge tone="success">Selesai</Badge>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-6 rounded-lg border border-border bg-surface">
        <h2 className="px-5 pt-5 text-h2">Riwayat scan</h2>
        <ol className="mt-3 divide-y divide-border border-t border-border">
          {originals.map((m) => {
            const corrections = correctionsOf(m.id);
            const active = effectiveIds.has(m.id);
            const voided = !active;
            const last = corrections.at(-1);
            const shown = last && !last.is_void ? last : m;
            const reason = shown.reason_id ? reasons.get(shown.reason_id) : null;
            const from = m.from_holder_id ? holderName.get(m.from_holder_id) : null;
            const to = m.to_holder_id ? holderName.get(m.to_holder_id) : null;
            return (
              <li key={m.id} className="px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className={voided ? 'text-text-muted line-through' : undefined}>
                    <p className="font-medium">
                      {MOVEMENT_LABEL[m.type]}
                      <span className="num ml-2 font-normal">{qtySummary(m.type, shown)}</span>
                    </p>
                    <p className="text-small text-text-muted">
                      {timeFmt.format(new Date(m.scanned_at))} · {userName.get(m.scanned_by) ?? '-'}
                      {(m.type === 'receive_sew' || m.type === 'receive_finishing') && from && to && (
                        <> · {from} → {to}</>
                      )}
                      {reason && <> · {reason.label}</>}
                      {m.note && m.type === 'split' && <> · {m.note}</>}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {voided && <Badge tone="neutral">Dibatalkan</Badge>}
                    {!voided && corrections.length > 0 && <Badge tone="info">Dikoreksi</Badge>}
                    {photoUrl.get(m.id) && (
                      <a
                        href={photoUrl.get(m.id)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-10 items-center gap-1.5 rounded-md px-3 text-small text-text-muted hover:bg-surface-muted hover:text-text"
                      >
                        <ImageIcon size={16} strokeWidth={1.5} aria-hidden /> Foto
                      </a>
                    )}
                  </div>
                </div>

                {corrections.length > 0 && (
                  <ul className="mt-3 flex flex-col gap-2 border-l-2 border-border pl-4">
                    {corrections.map((c) => (
                      <li key={c.id} className="text-small">
                        <span className="font-medium">{c.is_void ? 'Dibatalkan' : `Dikoreksi: ${qtySummary(m.type, c)}`}</span>
                        <span className="text-text-muted">
                          {' '}
                          · {timeFmt.format(new Date(c.scanned_at))} · {userName.get(c.scanned_by) ?? '-'} · {c.note}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                {isSupervisor && m.id === correctableId && (
                  <CorrectionPanel
                    movement={{
                      id: m.id,
                      type: m.type,
                      qty_sent: shown.qty_sent ?? m.qty_sent,
                      qty_received: shown.qty_received,
                      qty_good: shown.qty_good,
                      qty_reject: shown.qty_reject,
                      reason_id: shown.reason_id,
                    }}
                    reasons={[...reasons.values()]}
                  />
                )}
              </li>
            );
          })}
        </ol>
        {isSupervisor && !correctableId && recon.is_active && (
          <p className="border-t border-border px-5 py-3 text-small text-text-muted">Belum ada scan yang bisa dikoreksi.</p>
        )}
      </section>
    </>
  );
}

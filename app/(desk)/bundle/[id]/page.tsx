import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AlertTriangle, ArrowLeft, CircleCheck, Printer } from 'lucide-react';
import { ReconciliationBar, ReconciliationLegend } from '@/components/recon/reconciliation-bar';
import { InlineAlert } from '@/components/ui/inline-alert';
import { Badge, StatusBadge } from '@/components/ui/status-badge';
import { CORRECTABLE, type MovementType } from '@/lib/movement';
import { createClient, getCurrentAppUser } from '@/lib/supabase/server';
import type { BundleStatus, Reason } from '@/lib/types';
import { ResolveFlag } from './resolve-flag';
import { ScanTimeline } from './scan-timeline';
import { SetCrumb } from '@/components/nav/sidebar-nav';
import { PageHeader } from '@/components/ui/page-header';

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

  const [bundleRes, reconRes, movRes, effRes, reasonRes, discRes, childRes, pieceRes] = await Promise.all([
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
    supabase
      .from('piece')
      .select('id, code, grade, printed_at, location:location(code)')
      .eq('bundle_id', id)
      .eq('status', 'aktif')
      .order('code'),
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
  const pieces = (pieceRes.data ?? []) as unknown as {
    id: string;
    code: string;
    grade: 'baik' | 'reject';
    printed_at: string | null;
    location: { code: string } | null;
  }[];

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

  const v = bundle.variant;
  const openFlags = discrepancies.filter((d) => d.status === 'terbuka');
  const openQty = openFlags.reduce((n, d) => n + d.qty, 0);

  // Open flags come first and stand out; resolved ones stay quiet below.
  const flagSection = discrepancies.length > 0 && (
    <section id="flag-selisih" className="mt-6 scroll-mt-6 rounded-lg border border-border bg-surface">
      <div className="flex flex-wrap items-center gap-3 px-5 pt-5">
        <h2 className="text-h2">Flag selisih</h2>
        {openFlags.length > 0 && <Badge tone="warning">{openFlags.length} terbuka</Badge>}
      </div>
      {openFlags.length > 0 && (
        <p className="px-5 text-small text-text-muted">
          {isSupervisor ? 'Cek fisik bundle, lalu selesaikan flag dengan catatan.' : 'Menunggu dicek supervisor.'}
        </p>
      )}
      <ul className="mt-3 divide-y divide-border border-t border-border">
        {[...openFlags, ...discrepancies.filter((d) => d.status !== 'terbuka')].map((d) => {
          const open = d.status === 'terbuka';
          const Icon = open ? AlertTriangle : CircleCheck;
          return (
            <li
              key={d.id}
              className={`flex flex-wrap items-start justify-between gap-3 px-5 py-4 ${open ? 'border-l-[3px] border-l-warning bg-warning-soft' : ''}`}
            >
              <div className="flex gap-3">
                <Icon aria-hidden size={20} strokeWidth={1.5} className={`mt-0.5 shrink-0 ${open ? 'text-warning' : 'text-text-subtle'}`} />
                <div>
                  <p className={open ? 'text-warning' : 'text-text-muted'}>
                    <span className={`num ${open ? 'text-h3' : 'font-medium'}`}>Selisih {d.qty} pcs</span>
                    <span className={open ? 'text-text' : ''}>, {d.from_step} → {d.to_step}</span>
                  </p>
                  <p className="text-small text-text-muted">
                    {timeFmt.format(new Date(d.created_at))}
                    {d.note && <> · {d.note}</>}
                  </p>
                </div>
              </div>
              {open ? (
                isSupervisor ? <ResolveFlag id={d.id} /> : <Badge tone="warning">Terbuka</Badge>
              ) : (
                <Badge tone="success">Selesai</Badge>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );

  return (
    <>
      <SetCrumb
        root
        items={[
          { label: 'Produksi' },
          { label: 'Batch', href: '/batch' },
          ...(bundle.batch ? [{ label: bundle.batch.code, href: `/batch/${bundle.batch.id}` }] : []),
          { label: bundle.code },
        ]}
      />
      <Link
        href={bundle.batch ? `/batch/${bundle.batch.id}` : '/batch'}
        className="inline-flex h-10 items-center gap-2 text-small text-text-muted hover:text-text lg:hidden"
      >
        <ArrowLeft size={16} strokeWidth={1.5} aria-hidden /> Batch <span className="num">{bundle.batch?.code}</span>
      </Link>

      <PageHeader
        className="mt-2"
        title={<span className="num">{bundle.code}</span>}
        badges={
          <>
            <StatusBadge status={recon.status} />
            {openFlags.length > 0 && <Badge tone="warning">Selisih {openQty} pcs</Badge>}
          </>
        }
        description={
          <>
            {v ? `${v.product_name} ${v.size} · ${v.color}` : '-'} · <span className="num">{v?.sku}</span>
            {bundle.holder && recon.is_active && <> · dipegang {bundle.holder.name}</>}
          </>
        }
        meta={
          parent && (
            <>
              Pecahan dari{' '}
              <Link href={`/bundle/${parent.id}`} className="num link-code">
                {parent.code}
              </Link>
            </>
          )
        }
        actions={
          recon.is_active && (
            <Link
              href={`/print/labels?bundle=${bundle.id}`}
              className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-surface px-4 font-medium hover:border-border-strong"
            >
              <Printer size={16} strokeWidth={1.5} aria-hidden /> Cetak ulang label
            </Link>
          )
        }
      />

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

      {openFlags.length > 0 && flagSection}

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

      {pieces.length > 0 && <PieceSummary bundleId={bundle.id} pieces={pieces} />}

      {openFlags.length === 0 && flagSection}

      <section className="mt-6 rounded-lg border border-border bg-surface">
        <div className="flex items-baseline justify-between gap-3 px-5 pt-5">
          <h2 className="text-h2">Riwayat scan</h2>
          <p className="text-small text-text-muted">Terbaru di atas</p>
        </div>
        <ScanTimeline
          movements={movements}
          effectiveIds={effectiveIds}
          correctableId={correctableId}
          reasons={reasons}
          holderName={holderName}
          userName={userName}
          photoUrl={photoUrl}
          canCorrect={isSupervisor}
        />
        {isSupervisor && !correctableId && recon.is_active && (
          <p className="border-t border-border px-5 py-3 text-small text-text-muted">Belum ada scan yang bisa dikoreksi.</p>
        )}
      </section>
    </>
  );
}

/** Fase 2a: the finished pieces of this bundle, where they are, and their labels. */
function PieceSummary({
  bundleId,
  pieces,
}: {
  bundleId: string;
  pieces: { id: string; code: string; grade: 'baik' | 'reject'; printed_at: string | null; location: { code: string } | null }[];
}) {
  const good = pieces.filter((p) => p.grade === 'baik');
  const reject = pieces.filter((p) => p.grade === 'reject');
  const unprinted = pieces.filter((p) => !p.printed_at).length;
  const shelved = pieces.filter((p) => p.location);
  const racks = new Map<string, number>();
  for (const p of shelved) racks.set(p.location!.code, (racks.get(p.location!.code) ?? 0) + 1);
  const waiting = pieces.length - shelved.length;

  return (
    <section className="mt-6 rounded-lg border border-border bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
        <h2 className="text-h2">Pcs</h2>
        <div className="flex flex-wrap gap-2">
          {unprinted > 0 && (
            <Link
              href={`/print/pieces?bundle=${bundleId}`}
              className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 font-medium text-primary-foreground hover:bg-primary-hover"
            >
              <Printer size={16} strokeWidth={1.5} aria-hidden /> Cetak {unprinted} label pcs
            </Link>
          )}
          <Link
            href={`/print/pieces?bundle=${bundleId}&all=1`}
            className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-surface px-4 font-medium hover:border-border-strong"
          >
            <Printer size={16} strokeWidth={1.5} aria-hidden /> Cetak ulang semua
          </Link>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-4 px-5 sm:grid-cols-4">
        <div>
          <dt className="text-caption tracking-[0.02em] text-text-muted">Baik</dt>
          <dd className="num text-h2">{good.length}</dd>
        </div>
        <div>
          <dt className="text-caption tracking-[0.02em] text-text-muted">Reject</dt>
          <dd className="num text-h2">{reject.length}</dd>
        </div>
        <div>
          <dt className="text-caption tracking-[0.02em] text-text-muted">Di rak</dt>
          <dd className="num text-h2">{shelved.length}</dd>
        </div>
        <div>
          <dt className="text-caption tracking-[0.02em] text-text-muted">Belum di rak</dt>
          <dd className={`num text-h2 ${waiting > 0 ? 'text-warning' : ''}`}>{waiting}</dd>
        </div>
      </dl>

      {(racks.size > 0 || unprinted > 0) && (
        <div className="mt-4 flex flex-wrap items-center gap-1.5 px-5">
          {[...racks.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([code, n]) => (
              <Link
                key={code}
                href={`/stok/rak/${code}`}
                className="num inline-flex h-7 items-center gap-1.5 rounded-sm border border-border px-2 text-small hover:border-border-strong"
              >
                <span className="font-medium text-primary">{code}</span>
                <span className="text-text-muted">{n}</span>
              </Link>
            ))}
          {unprinted > 0 && <Badge tone="warning">{unprinted} label belum dicetak</Badge>}
        </div>
      )}

      <details className="group mt-4 border-t border-border">
        <summary className="flex h-11 cursor-pointer items-center px-5 text-small text-text-muted hover:text-text">
          Lihat {pieces.length} kode pcs
        </summary>
        <ul className="grid gap-x-6 px-5 pb-4 sm:grid-cols-2 lg:grid-cols-4">
          {pieces.map((p) => (
            <li key={p.id} className="flex items-center gap-2 py-1 text-small">
              <Link href={`/pcs/${p.code}`} className="num link-code">
                {p.code}
              </Link>
              {p.grade === 'reject' && <span className="text-danger">reject</span>}
              <span className="num text-text-subtle">{p.location?.code ?? (p.printed_at ? 'belum di rak' : 'belum dicetak')}</span>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}

'use client';

import { useCallback, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ChevronRight, CircleCheck, FilePlus2, Truck, Undo2 } from 'lucide-react';
import { addToOutbound, removeFromOutbound, shipOutbound } from '@/app/(desk)/barang-keluar/actions';
import { Button } from '@/components/ui/button';
import { InlineAlert } from '@/components/ui/inline-alert';
import { Badge } from '@/components/ui/status-badge';
import { OUTBOUND_TYPE, SKIP_LABEL, type OutboundProgress, type OutboundType } from '@/lib/outbound';
import { forgetLastScan } from '@/lib/scan/bus';
import { BottomBar, ScannerView } from '../../scanner-view';
import { EmptyState } from '@/components/ui/empty-state';

export type DraftDoc = { id: string; code: string; type: OutboundType; destination: string; ref_no: string | null; total: number };

/** Same code again within this window is ignored: the camera sees one label several times. */
const REPEAT_MS = 2500;

/**
 * Outbound picking on the phone. Pick a draft, then scan piece or bundle labels one after
 * another; each scan is added at once. Ship from here or from the desk.
 */
export function OutboundScan({
  canWork,
  drafts,
  selected,
  initialProgress,
}: {
  canWork: boolean;
  drafts: DraftDoc[];
  selected: DraftDoc | null;
  initialProgress: OutboundProgress;
}) {
  const router = useRouter();
  const [progress, setProgress] = useState(initialProgress);
  const [total, setTotal] = useState(selected?.total ?? 0);
  const [result, setResult] = useState<{ tone: 'success' | 'warning' | 'danger'; text: string } | null>(null);
  const [lastPiece, setLastPiece] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [shipped, setShipped] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const last = useRef<{ code: string; at: number } | null>(null);

  const onCode = useCallback(
    async (raw: string) => {
      if (!selected || loading) return;
      const code = raw.trim();
      const now = Date.now();
      if (last.current && last.current.code === code && now - last.current.at < REPEAT_MS) return;
      last.current = { code, at: now };
      setLoading(true);
      const res = await addToOutbound(selected.id, code);
      setLoading(false);
      if (!res.ok) {
        navigator.vibrate?.([40, 60, 40]);
        return setResult({ tone: 'danger', text: res.message });
      }
      navigator.vibrate?.(60);
      const d = res.data;
      setProgress(d.progress);
      setTotal(d.total);
      // undo only for a single piece; a bundle is fixed piece by piece on the desk
      // the scanned code (QR token or P-code) identifies the piece for removal too
      setLastPiece(d.added === 1 && /^Pcs /.test(d.message) ? code : null);
      const skipped = Object.entries(d.skipped)
        .map(([k, n]) => `${n} ${SKIP_LABEL[k] ?? k}`)
        .join(', ');
      setResult({
        tone: d.warning ? 'warning' : 'success',
        text: [d.message, skipped && `Dilewati: ${skipped}.`, d.warning].filter(Boolean).join(' '),
      });
    },
    [selected, loading],
  );

  if (!canWork) {
    return (
      <main className="px-4 pt-3">
        <InlineAlert tone="info">Hanya akun gudang atau supervisor yang bisa mengisi barang keluar.</InlineAlert>
      </main>
    );
  }

  if (shipped) {
    return (
      <main className="flex flex-1 flex-col px-4">
        <div role="status" className="mt-4 flex flex-col items-center gap-3 rounded-xl bg-success-soft px-6 py-10 text-center text-success">
          <CircleCheck size={24} strokeWidth={1.5} aria-hidden />
          <p className="text-h2">{shipped}</p>
        </div>
        <BottomBar>
          <div className="flex gap-2">
            <Link href={`/barang-keluar/${selected!.id}`} className="inline-flex h-12 flex-1 items-center justify-center rounded-md border border-border bg-surface font-medium">
              Lihat dokumen
            </Link>
            <Link href="/scan/gudang/keluar" className="inline-flex h-12 flex-1 items-center justify-center rounded-md bg-primary font-medium text-primary-foreground">
              Dokumen lain
            </Link>
          </div>
        </BottomBar>
      </main>
    );
  }

  if (!selected) {
    return (
      <main className="flex flex-1 flex-col gap-3 px-4 pt-3 pb-8">
        <div>
          <h1 className="text-h2">Barang keluar</h1>
          <p className="text-small text-text-muted">Pilih dokumen yang sedang disiapkan.</p>
        </div>
        {drafts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border-strong bg-surface"><EmptyState variant="document" compact>Belum ada dokumen yang sedang disiapkan.</EmptyState></div>
        ) : (
          <ul className="flex flex-col gap-2">
            {drafts.map((d) => (
              <li key={d.id}>
                <Link href={`/scan/gudang/keluar?doc=${d.id}`} className="flex min-h-16 items-center gap-3 rounded-lg border border-border bg-surface p-4 hover:border-border-strong">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2">
                      <span className="num text-h3">{d.code}</span>
                      <Badge tone={d.type === 'penyesuaian' ? 'warning' : d.type === 'jual_bs' ? 'danger' : 'neutral'}>{OUTBOUND_TYPE[d.type].label}</Badge>
                    </p>
                    <p className="truncate text-small text-text-muted">{d.destination}</p>
                  </div>
                  <span className="num text-small text-text-muted">{d.total} pcs</span>
                  <ChevronRight size={20} strokeWidth={1.5} aria-hidden className="text-text-subtle" />
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Link href="/barang-keluar/baru" className="inline-flex h-12 items-center justify-center gap-2 rounded-md border border-border bg-surface font-medium">
          <FilePlus2 size={20} strokeWidth={1.5} aria-hidden /> Buat dokumen baru
        </Link>
      </main>
    );
  }

  const adjustment = selected.type === 'penyesuaian';
  return (
    <main className="flex flex-1 flex-col px-4">
      <div className="-mx-4 flex h-12 items-center border-b border-border bg-surface px-2">
        <Link href="/scan/gudang/keluar" className="inline-flex h-11 items-center gap-1.5 rounded-md px-2 font-medium hover:bg-surface-muted">
          <ArrowLeft size={20} strokeWidth={1.75} aria-hidden />
          Dokumen
        </Link>
      </div>
      <section aria-label="Dokumen aktif" className="-mx-4 border-b border-primary/20 bg-primary-soft px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2">
              <span className="num text-h2 text-primary">{selected.code}</span>
              <Badge tone="neutral">{OUTBOUND_TYPE[selected.type].label}</Badge>
            </p>
            <p className="truncate text-small text-primary-hover">{selected.destination}</p>
          </div>
          <p className="text-right">
            <span className="num text-h1">{total}</span>
            <span className="block text-caption text-primary-hover">pcs</span>
          </p>
        </div>
        {progress.length > 0 && (
          <ul className="mt-2 flex max-h-28 flex-col gap-1 overflow-y-auto border-t border-primary/20 pt-2 text-small">
            {progress.map((p) => (
              <li key={p.variant_id} className="flex justify-between gap-3">
                <span className="min-w-0 truncate">{p.label}</span>
                <span className={`num ${p.planned > 0 && p.scanned > p.planned ? 'text-warning' : ''}`}>
                  <span className="font-semibold">{p.scanned}</span>
                  {p.planned > 0 && <span className="text-text-muted">/{p.planned}</span>}
                  {p.planned > 0 && p.scanned > p.planned && ' lebih'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {result && (
        <InlineAlert tone={result.tone} className="mt-3">
          {result.text}
        </InlineAlert>
      )}

      <ScannerView onCode={onCode} loading={loading} kinds={['piece', 'bundle']} hint="Scan pcs atau bundle, satu per satu" loadingText="Menambahkan..." className="-mx-4 mt-3" />

      <BottomBar>
        {confirming ? (
          <div className="flex flex-col gap-2">
            <p className="text-small">
              <span className="num font-medium">{total} pcs</span> {adjustment ? 'dikeluarkan dari stok' : `dikirim ke ${selected.destination}`}. Dokumen tidak bisa diubah lagi.
            </p>
            <div className="flex gap-2">
              <Button size="lg" variant="secondary" onClick={() => setConfirming(false)} disabled={pending}>
                Kembali
              </Button>
              <Button
                size="lg"
                className="flex-1"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const res = await shipOutbound(selected.id);
                    if (!res.ok) {
                      setConfirming(false);
                      return setResult({ tone: 'danger', text: res.message });
                    }
                    navigator.vibrate?.(120);
                    setShipped(res.data.message);
                    router.refresh();
                  })
                }
              >
                <Truck size={24} strokeWidth={1.5} aria-hidden /> {pending ? 'Menyimpan...' : adjustment ? 'Ya, keluarkan' : 'Ya, kirim'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            {lastPiece && (
              <Button
                size="lg"
                variant="secondary"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const res = await removeFromOutbound(selected.id, lastPiece);
                    if (!res.ok) return setResult({ tone: 'danger', text: res.message });
                    setProgress(res.data.progress);
                    setTotal(res.data.total);
                    setLastPiece(null);
                    last.current = null;
                    forgetLastScan(); // the same label can go in again right away
                    setResult({ tone: 'success', text: res.data.message });
                  })
                }
              >
                <Undo2 size={20} strokeWidth={1.5} aria-hidden /> Batalkan scan
              </Button>
            )}
            <Button size="lg" className="flex-1" disabled={total === 0 || pending} onClick={() => setConfirming(true)}>
              <Truck size={24} strokeWidth={1.5} aria-hidden /> {adjustment ? 'Selesai, keluarkan' : 'Selesai, kirim'}
            </Button>
          </div>
        )}
      </BottomBar>
    </main>
  );
}

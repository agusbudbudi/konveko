'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { ArrowRightLeft, PackagePlus, Warehouse } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InlineAlert } from '@/components/ui/inline-alert';
import { Badge } from '@/components/ui/status-badge';
import type { PutawayResult, WarehouseLookup } from '@/lib/types';
import { useScanner } from '@/lib/scan/use-scanner';
import { RejectedPanel, SuccessScreen, TaskHeader } from '../scan-ui';
import { BottomBar, loadRecent, pushRecent, ScannerView, type RecentScan } from '../scanner-view';
import { putaway, warehouseLookup } from './actions';

type Rack = Extract<WarehouseLookup, { kind: 'location' }>;
type Item = Exclude<WarehouseLookup, { kind: 'location' }>;

type Phase =
  | { k: 'scan' }
  | { k: 'loading' }
  | { k: 'item'; item: Item }
  | { k: 'error'; message: string }
  | { k: 'success'; result: PutawayResult };

const RACK_KEY = 'konveko:rak-aktif';
const SUCCESS_MS = 1200;
const RECENT_KEY = 'konveko:gudang-recent';

/**
 * Warehouse putaway (Fase 2a). The active rack stays set (and survives a
 * reload on this device) so a run of bundles goes to one rack with one scan
 * each. Scanning another rack QR switches the active rack.
 */
export function WarehouseScan({ canShelve }: { canShelve: boolean }) {
  const [rack, setRack] = useState<Rack | null>(null);
  const [phase, setPhase] = useState<Phase>({ k: 'scan' });
  const [recent, setRecent] = useState<RecentScan[]>([]);
  // Code of the bundle/pcs that was open when "Ganti rak" was tapped: reopened
  // once the new rack is scanned, so it does not have to be scanned again.
  const [pending, setPending] = useState<string | null>(null);
  const busy = useRef(false);

  // Restore the rack code, then re-read it so qty and kind are current.
  useEffect(() => {
    setRecent(loadRecent(RECENT_KEY));
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(RACK_KEY);
    } catch {}
    if (!saved) return;
    warehouseLookup(saved).then((res) => {
      if (res.ok && res.data.kind === 'location') setRack(res.data);
    });
  }, []);

  const chooseRack = (r: Rack) => {
    setRack(r);
    try {
      localStorage.setItem(RACK_KEY, r.code);
    } catch {}
  };

  const reset = useCallback(() => {
    busy.current = false;
    setPhase({ k: 'scan' });
  }, []);

  const onCode = useCallback(
    async (raw: string) => {
      if (busy.current) return;
      busy.current = true;
      setPhase({ k: 'loading' });
      const res = await warehouseLookup(raw);
      if (!res.ok) return setPhase({ k: 'error', message: res.message });
      if (res.data.kind === 'location') {
        chooseRack(res.data);
        if (pending) {
          setPending(null);
          const again = await warehouseLookup(pending);
          if (again.ok && again.data.kind !== 'location') return setPhase({ k: 'item', item: again.data });
        }
        busy.current = false;
        return setPhase({ k: 'scan' });
      }
      setPending(null);
      if (!rack) return setPhase({ k: 'error', message: 'Scan QR rak dulu, baru bundle atau pcs.' });
      setPhase({ k: 'item', item: res.data });
    },
    [rack, pending],
  );

  const clearRack = () => {
    if (phase.k === 'item') setPending(phase.item.code);
    setRack(null);
    try {
      localStorage.removeItem(RACK_KEY);
    } catch {}
    reset();
  };

  // From the error screen, the next hardware scan starts over without tapping "Scan lagi".
  useScanner((code) => {
    busy.current = false;
    onCode(code);
  }, phase.k === 'error');

  useEffect(() => {
    if (phase.k !== 'success') return;
    const t = setTimeout(reset, SUCCESS_MS);
    return () => clearTimeout(t);
  }, [phase, reset]);

  return (
    <main className="flex flex-1 flex-col px-4">
      {/* the confirm screen shows it under its own task header */}
      {phase.k !== 'success' && phase.k !== 'item' && <RackBar rack={rack} onClear={clearRack} />}

      {!canShelve && (
        <InlineAlert tone="info" className="mt-3">Hanya akun gudang atau supervisor yang bisa memasukkan barang ke rak.</InlineAlert>
      )}

      {phase.k === 'scan' || phase.k === 'loading' ? (
        <>
          {pending && !rack && (
            <InlineAlert tone="info" className="my-3">
              Scan QR rak baru. <span className="num">{pending}</span> akan dibuka lagi setelah rak dipilih.
            </InlineAlert>
          )}
          <ScannerView
            onCode={onCode}
            recent={recent}
            loading={phase.k === 'loading'}
            kinds={rack ? ['bundle', 'piece', 'rack'] : ['rack']}
            hint={rack ? `Scan bundle atau pcs untuk masuk ke ${rack.code}` : 'Scan QR rak dulu'}
            loadingText="Mencari..."
            className="-mx-4"
          />
        </>
      ) : phase.k === 'error' ? (
        <>
          <RejectedPanel message={phase.message} onRescan={reset} />
        </>
      ) : phase.k === 'item' && rack ? (
        <ItemView
          item={phase.item}
          rack={rack}
          canShelve={canShelve}
          onRescan={reset}
          onClearRack={clearRack}
          onDone={(result) => {
            navigator.vibrate?.(60);
            setRack((r) => (r ? { ...r, qty: r.qty + result.moved } : r));
            setPhase({ k: 'success', result });
            setRecent((list) =>
              pushRecent(RECENT_KEY, list, {
                code: result.code,
                text: `${result.moved} pcs masuk ${result.location_code}`,
                tone: 'success',
              }),
            );
          }}
        />
      ) : phase.k === 'success' ? (
        <SuccessScreen
          ms={SUCCESS_MS}
          onNext={reset}
          title={`${phase.result.moved} pcs masuk ${phase.result.location_code}`}
          subtitle={phase.result.message}
        />
      ) : null}
    </main>
  );
}

/** Active rack pinned under the header: the context every scan on this screen goes into. */
function RackBar({ rack, onClear }: { rack: Rack | null; onClear: () => void }) {
  if (!rack) {
    return (
      <section className="-mx-4 flex items-center gap-3 border-b border-border bg-surface px-4 py-3">
        <Warehouse size={24} strokeWidth={1.75} aria-hidden className="text-text-muted" />
        <div>
          <p className="font-medium">Scan QR rak dulu</p>
          <p className="text-small text-text-muted">Rak tetap aktif sampai diganti.</p>
        </div>
      </section>
    );
  }
  return (
    <section aria-label="Rak aktif" className="-mx-4 flex items-center gap-3 border-b border-primary/20 bg-primary-soft px-4 py-2.5">
      <div className="min-w-0">
        <p className="text-caption text-primary-hover">
          Rak aktif · {rack.location_kind === 'reject' ? 'reject' : 'stok'}
        </p>
        <p className="text-h1 text-primary">
          <span className="num">{rack.code}</span>{' '}
          <span className="num text-small font-medium text-primary-hover">· {rack.qty} pcs</span>
        </p>
      </div>
      <button
        type="button"
        onClick={onClear}
        className="ml-auto h-11 shrink-0 rounded-md border border-primary bg-surface px-3.5 text-small font-medium text-primary"
      >
        Ganti rak
      </button>
    </section>
  );
}

function ItemView({
  item,
  rack,
  canShelve,
  onRescan,
  onClearRack,
  onDone,
}: {
  item: Item;
  rack: Rack;
  canShelve: boolean;
  onRescan: () => void;
  onClearRack: () => void;
  onDone: (r: PutawayResult) => void;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const v = item.variant;
  const forReject = rack.location_kind === 'reject';

  // What would happen, and why not, computed from the lookup.
  let count = 0;
  let blocked: string | null = null;
  let action = '';
  if (item.kind === 'bundle') {
    count = forReject ? item.unshelved_reject : item.unshelved_baik;
    const other = forReject ? item.unshelved_baik : item.unshelved_reject;
    if (count === 0 && other > 0) {
      blocked = `Bundle ini masih punya ${other} pcs ${forReject ? 'baik' : 'reject'}. Scan rak ${forReject ? 'stok' : 'reject'} untuk barang itu.`;
    } else if (count === 0) {
      blocked = item.shelved > 0 ? 'Semua pcs bundle ini sudah di rak.' : 'Bundle ini belum punya pcs jadi. Selesaikan finishing dulu.';
    } else if (item.unprinted > 0) {
      blocked = `${item.unprinted} label pcs belum dicetak. Cetak dulu di meja finishing.`;
    }
    action = `Masukkan ${count} pcs ke rak ${rack.code}`;
  } else {
    count = 1;
    const kind = item.grade === 'reject' ? 'reject' : item.condition === 'rusak' ? 'rusak' : 'baik';
    if (item.status === 'batal') blocked = 'Pcs ini sudah dibatalkan. Buang labelnya.';
    else if (item.status === 'rework') blocked = 'Pcs ini sudah dikirim ke rework. Labelnya tidak berlaku lagi.';
    else if (item.status === 'keluar') blocked = `Pcs ini sudah keluar di ${item.outbound_code}. Catat dulu lewat mode Retur.`;
    else if (item.sellable === forReject) {
      blocked = `Pcs ini barang ${kind}. Scan rak ${item.sellable ? 'stok' : 'reject'}.`;
    } else if (!item.printed) blocked = 'Label pcs ini belum ditandai tercetak.';
    else if (item.location_code === rack.code) blocked = `Pcs ini sudah di rak ${rack.code}.`;
    action = item.location_code ? `Pindahkan dari ${item.location_code} ke ${rack.code}` : `Masukkan ke rak ${rack.code}`;
  }

  const confirm = () =>
    start(async () => {
      setError(null);
      const res = await putaway(rack.code, item.code);
      if (res.ok) onDone(res.data);
      else setError(res.message);
    });

  return (
    <>
      <TaskHeader title={item.kind === 'bundle' ? 'Masuk rak: bundle' : 'Masuk rak: pcs'} onBack={onRescan} />
      <RackBar rack={rack} onClear={onClearRack} />
      <section aria-live="polite" className="mt-3 rounded-xl border border-border bg-surface p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="num text-text-muted">
              {item.kind === 'bundle' ? 'Bundle' : 'Pcs'} {item.code}
            </p>
            <h2 className="mt-1 text-h2">
              {v.product_name} {v.size}
            </h2>
            <p className="text-small text-text-muted">
              {v.color} · <span className="num">{v.sku}</span>
              {item.kind === 'piece' && (
                <>
                  {' '}
                  · {item.bundle_code ? <>bundle <span className="num">{item.bundle_code}</span></> : 'stok awal'}
                </>
              )}
            </p>
          </div>
          {item.kind === 'piece' && (
            <Badge tone={item.sellable ? 'success' : 'danger'}>{item.grade === 'reject' ? 'Reject' : item.condition === 'rusak' ? 'Rusak' : 'Baik'}</Badge>
          )}
        </div>
        <div className="mt-4 flex items-end justify-between border-t border-border pt-4">
          {item.kind === 'bundle' ? (
            <div>
              <p className="text-caption text-text-muted">Menunggu masuk rak</p>
              <p className="num text-display">
                {item.unshelved_baik + item.unshelved_reject} <span className="text-h3 font-medium text-text-muted">pcs</span>
              </p>
              <p className="text-small text-text-muted">
                {item.unshelved_baik} baik · {item.unshelved_reject} reject · {item.shelved} sudah di rak
              </p>
            </div>
          ) : (
            <div>
              <p className="text-caption text-text-muted">Lokasi sekarang</p>
              <p className="num text-h2">{item.location_code ?? 'Belum di rak'}</p>
            </div>
          )}
        </div>
      </section>

      {blocked || !canShelve ? (
        <RejectedPanel
          message={blocked ?? 'Hanya akun gudang atau supervisor yang bisa memasukkan barang ke rak.'}
          onRescan={onRescan}
        />
      ) : (
        <>
          {error && <RejectedPanel message={error} />}
          <BottomBar>
          <div className="flex gap-2">
            <Button size="lg" className="h-14 flex-1" onClick={confirm} disabled={pending} autoFocus>
              {item.kind === 'piece' && item.location_code ? (
                <ArrowRightLeft size={24} strokeWidth={1.5} aria-hidden />
              ) : (
                <PackagePlus size={24} strokeWidth={1.5} aria-hidden />
              )}
              {pending ? 'Menyimpan...' : action}
            </Button>
          </div>
          </BottomBar>
        </>
      )}
    </>
  );
}

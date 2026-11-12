'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { ArrowRightLeft, CircleCheck, PackagePlus, ScanLine, Warehouse } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InlineAlert } from '@/components/ui/inline-alert';
import { Badge } from '@/components/ui/status-badge';
import type { PutawayResult, WarehouseLookup } from '@/lib/types';
import { useScanner } from '@/lib/scan/use-scanner';
import { BottomBar, ScannerView } from '../scanner-view';
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

/**
 * Warehouse putaway (Fase 2a). The active rack stays set (and survives a
 * reload on this device) so a run of bundles goes to one rack with one scan
 * each. Scanning another rack QR switches the active rack.
 */
export function WarehouseScan({ canShelve }: { canShelve: boolean }) {
  const [rack, setRack] = useState<Rack | null>(null);
  const [phase, setPhase] = useState<Phase>({ k: 'scan' });
  const [notice, setNotice] = useState<string | null>(null);
  // Code of the bundle/pcs that was open when "Ganti rak" was tapped: reopened
  // once the new rack is scanned, so it does not have to be scanned again.
  const [pending, setPending] = useState<string | null>(null);
  const busy = useRef(false);

  // Restore the rack code, then re-read it so qty and kind are current.
  useEffect(() => {
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
    setNotice(`Rak aktif: ${r.code}`);
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
      setNotice(null);
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
    setNotice(null);
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
      <RackCard rack={rack} onClear={clearRack} />

      {!canShelve && (
        <InlineAlert tone="info" className="mt-3">Hanya akun gudang atau supervisor yang bisa memasukkan barang ke rak.</InlineAlert>
      )}

      {phase.k === 'scan' || phase.k === 'loading' ? (
        <>
          {notice && (
            <InlineAlert tone="success" className="mt-3">
              {notice}
            </InlineAlert>
          )}
          {pending && !rack && (
            <InlineAlert tone="info" className="mt-3">
              Scan QR rak baru. <span className="num">{pending}</span> akan dibuka lagi setelah rak dipilih.
            </InlineAlert>
          )}
          <ScannerView
            onCode={onCode}
            loading={phase.k === 'loading'}
            kinds={rack ? ['bundle', 'piece', 'rack'] : ['rack']}
            hint={rack ? `Scan bundle atau pcs untuk masuk ke ${rack.code}` : 'Scan QR rak dulu'}
            loadingText="Mencari..."
            className="-mx-4 mt-3"
          />
        </>
      ) : phase.k === 'error' ? (
        <>
          <InlineAlert tone="danger" className="mt-4">
            {phase.message}
          </InlineAlert>
          <BottomBar>
            <Button size="lg" className="w-full" onClick={reset} autoFocus>
              <ScanLine size={24} strokeWidth={1.5} aria-hidden /> Scan lagi
            </Button>
          </BottomBar>
        </>
      ) : phase.k === 'item' && rack ? (
        <ItemView
          item={phase.item}
          rack={rack}
          canShelve={canShelve}
          onRescan={reset}
          onDone={(result) => {
            navigator.vibrate?.(60);
            setRack((r) => (r ? { ...r, qty: r.qty + result.moved } : r));
            setPhase({ k: 'success', result });
          }}
        />
      ) : phase.k === 'success' ? (
        <div role="status" className="mt-4 flex flex-1 flex-col items-center justify-center gap-3 rounded-xl bg-success-soft px-6 text-center text-success">
          <CircleCheck size={24} strokeWidth={1.5} aria-hidden />
          <p className="text-h2">{phase.result.message}</p>
        </div>
      ) : null}
    </main>
  );
}

function RackCard({ rack, onClear }: { rack: Rack | null; onClear: () => void }) {
  if (!rack) {
    return (
      <section className="mt-2 flex items-center gap-3 rounded-xl border border-dashed border-border-strong bg-surface p-4">
        <Warehouse size={24} strokeWidth={1.5} aria-hidden className="text-text-muted" />
        <div>
          <p className="font-medium">Scan QR rak dulu</p>
          <p className="text-small text-text-muted">Rak tetap aktif sampai diganti.</p>
        </div>
      </section>
    );
  }
  return (
    <section className="mt-2 flex items-center justify-between gap-3 rounded-xl border border-primary bg-primary-soft p-4">
      <div className="flex items-center gap-3">
        <Warehouse size={24} strokeWidth={1.5} aria-hidden className="text-primary" />
        <div>
          <p className="text-caption text-text-muted">Rak aktif</p>
          <p className="flex items-center gap-2">
            <span className="num text-h2 text-primary">{rack.code}</span>
            <Badge tone={rack.location_kind === 'reject' ? 'danger' : 'neutral'}>
              {rack.location_kind === 'reject' ? 'Reject' : 'Stok'}
            </Badge>
          </p>
          <p className="num text-small text-text-muted">{rack.qty} pcs di rak</p>
        </div>
      </div>
      <Button variant="ghost" onClick={onClear}>
        Ganti rak
      </Button>
    </section>
  );
}

function ItemView({
  item,
  rack,
  canShelve,
  onRescan,
  onDone,
}: {
  item: Item;
  rack: Rack;
  canShelve: boolean;
  onRescan: () => void;
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
      <section aria-live="polite" className="mt-4 rounded-xl border border-border bg-surface p-4">
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

      {(blocked || error) && (
        <InlineAlert tone="danger" className="mt-4">
          {error ?? blocked}
        </InlineAlert>
      )}

      <BottomBar>
        {blocked || !canShelve ? (
          <Button size="lg" className="w-full" onClick={onRescan} autoFocus>
            <ScanLine size={24} strokeWidth={1.5} aria-hidden /> Scan lagi
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button size="lg" variant="secondary" onClick={onRescan} disabled={pending}>
              Batal
            </Button>
            <Button size="lg" className="flex-1" onClick={confirm} disabled={pending} autoFocus>
              {item.kind === 'piece' && item.location_code ? (
                <ArrowRightLeft size={24} strokeWidth={1.5} aria-hidden />
              ) : (
                <PackagePlus size={24} strokeWidth={1.5} aria-hidden />
              )}
              {pending ? 'Menyimpan...' : action}
            </Button>
          </div>
        )}
      </BottomBar>
    </>
  );
}

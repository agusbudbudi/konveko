'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { ScanLine, Undo2 } from 'lucide-react';
import { returnPiece } from '@/app/(desk)/barang-keluar/actions';
import { Button } from '@/components/ui/button';
import { InlineAlert } from '@/components/ui/inline-alert';
import { Input, Label } from '@/components/ui/input';
import { cn } from '@/lib/cn';
import { RETURN_REASONS } from '@/lib/outbound';
import type { WarehouseLookup } from '@/lib/types';
import { warehouseLookup } from '../actions';
import { useScanner } from '@/lib/scan/use-scanner';
import { ReasonChips, RejectedPanel, SuccessScreen, TaskHeader } from '../../scan-ui';
import { BottomBar, ScannerView } from '../../scanner-view';

type Piece = Extract<WarehouseLookup, { kind: 'piece' }>;
type Phase = { k: 'scan' } | { k: 'loading' } | { k: 'piece'; piece: Piece } | { k: 'error'; message: string } | { k: 'done'; message: string };

const DONE_MS = 1800;

/** Returns: scan a piece that left the warehouse, choose its condition and reason. */
export function ReturnScan({ canWork }: { canWork: boolean }) {
  const [phase, setPhase] = useState<Phase>({ k: 'scan' });
  const reset = useCallback(() => setPhase({ k: 'scan' }), []);

  const onCode = useCallback(async (raw: string) => {
    setPhase({ k: 'loading' });
    const res = await warehouseLookup(raw);
    if (!res.ok) return setPhase({ k: 'error', message: res.message });
    const d = res.data;
    if (d.kind !== 'piece') return setPhase({ k: 'error', message: 'Retur dicatat per pcs. Scan label pcs, bukan bundle atau rak.' });
    if (d.status !== 'keluar') {
      return setPhase({
        k: 'error',
        message: d.status === 'batal' ? `Pcs ${d.code} sudah dibatalkan.` : `Pcs ${d.code} masih di gudang, tidak perlu diretur.`,
      });
    }
    setPhase({ k: 'piece', piece: d });
  }, []);

  // From the error screen, the next hardware scan starts over without tapping "Scan lagi".
  useScanner(onCode, phase.k === 'error');

  useEffect(() => {
    if (phase.k !== 'done') return;
    const t = setTimeout(reset, DONE_MS);
    return () => clearTimeout(t);
  }, [phase, reset]);

  if (!canWork) {
    return (
      <main className="px-4 pt-3">
        <InlineAlert tone="info">Hanya akun gudang atau supervisor yang bisa mencatat retur.</InlineAlert>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col px-4">
      {phase.k === 'scan' || phase.k === 'loading' ? (
        <ScannerView onCode={onCode} loading={phase.k === 'loading'} kinds={['piece']} hint="Scan label pcs yang dikembalikan" loadingText="Mencari pcs..." className="-mx-4 mt-3" />
      ) : phase.k === 'error' ? (
        <>
          <TaskHeader title="Retur" backLabel="Kembali ke scan" onBack={reset} />
          <RejectedPanel message={phase.message} />
          <BottomBar>
            <Button size="lg" className="h-14 w-full" onClick={reset} autoFocus>
              <ScanLine size={24} strokeWidth={1.5} aria-hidden /> Scan lagi
            </Button>
          </BottomBar>
        </>
      ) : phase.k === 'piece' ? (
        <ReturnForm piece={phase.piece} onCancel={reset} onDone={(message) => setPhase({ k: 'done', message })} />
      ) : (
        <SuccessScreen ms={DONE_MS} onNext={reset} title="Retur tersimpan" subtitle={phase.message} />
      )}
    </main>
  );
}

function ReturnForm({ piece, onCancel, onDone }: { piece: Piece; onCancel: () => void; onDone: (m: string) => void }) {
  const [condition, setCondition] = useState<'baik' | 'rusak'>('baik');
  const [reason, setReason] = useState<string>(RETURN_REASONS[0]);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const v = piece.variant;
  const other = reason === 'lain';

  return (
    <>
      <TaskHeader title="Retur pcs" onBack={onCancel} />
      <section aria-live="polite" className="mt-3 rounded-xl border border-border bg-surface px-4 py-3">
        <p className="num text-text-muted">Pcs {piece.code}</p>
        <h2 className="mt-1 text-h2">
          {v.product_name} {v.size}
        </h2>
        <p className="text-small text-text-muted">
          {v.color} · <span className="num">{v.sku}</span> · keluar di <span className="num">{piece.outbound_code}</span>
        </p>
      </section>

      <fieldset className="mt-4 flex flex-col gap-2">
        <legend className="mb-1.5 text-h3">Kondisi barang</legend>
        <div className="grid grid-cols-2 gap-2">
          {(['baik', 'rusak'] as const).map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={condition === c}
              onClick={() => setCondition(c)}
              className={cn(
                'flex min-h-20 flex-col items-start gap-0.5 rounded-lg p-3.5 text-left',
                condition === c ? 'border-2 border-primary bg-primary-soft' : 'border border-border-strong bg-surface',
              )}
            >
              <span className={cn('text-h3', condition === c && 'text-primary')}>{c === 'baik' ? 'Baik' : 'Rusak'}</span>
              <span className="text-small text-text-muted">{c === 'baik' ? 'Kembali ke rak stok' : 'Ke rak reject, bisa dijual BS'}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <div className="mt-4 flex flex-col gap-4">
        <ReasonChips
          legend="Alasan retur"
          options={[...RETURN_REASONS, 'lain'].map((r) => ({ value: r, label: r === 'lain' ? 'Lainnya' : r }))}
          value={reason}
          onChange={setReason}
        />
        <div>
          <Label htmlFor="rt-note">
            Catatan {!other && <span className="font-normal text-text-muted">(opsional)</span>}
          </Label>
          <Input id="rt-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} aria-invalid={(other && !note.trim()) || undefined} />
        </div>
      </div>

      {error && (
        <InlineAlert tone="danger" className="mt-4">
          {error}
        </InlineAlert>
      )}

      <BottomBar>
        <div className="flex gap-2">
          <Button
            size="lg"
            className="h-14 flex-1"
            disabled={pending || (other && !note.trim())}
            onClick={() =>
              start(async () => {
                setError(null);
                const text = [other ? '' : reason, note.trim()].filter(Boolean).join('. ');
                const res = await returnPiece(piece.code, condition, text);
                if (!res.ok) return setError(res.message);
                navigator.vibrate?.(60);
                onDone(res.data.message);
              })
            }
          >
            <Undo2 size={24} strokeWidth={1.5} aria-hidden /> {pending ? 'Menyimpan...' : condition === 'baik' ? 'Simpan retur, ke rak stok' : 'Simpan retur, ke rak reject'}
          </Button>
        </div>
      </BottomBar>
    </>
  );
}

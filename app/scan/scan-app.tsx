'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { Camera, CircleCheck, ScanLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InlineAlert } from '@/components/ui/inline-alert';
import { Input, Label, Select } from '@/components/ui/input';
import { QtyStepper } from '@/components/ui/qty-stepper';
import { StatusBadge } from '@/components/ui/status-badge';
import { cn } from '@/lib/cn';
import { uploadSelisihPhoto } from '@/lib/photo';
import { STATUS_LABEL, type ActionResult, type LookupResult, type Reason, type ScanResult } from '@/lib/types';
import { finishBundle, lookupBundle, receiveBundle } from './actions';
import { CameraScanner } from './camera-scanner';

type Phase =
  | { k: 'scan' }
  | { k: 'loading' }
  | { k: 'result'; bundle: LookupResult }
  | { k: 'error'; message: string }
  | { k: 'success'; result: ScanResult };

const SUCCESS_MS = 1200;

export type ScanActions = {
  lookup: typeof lookupBundle;
  receive: typeof receiveBundle;
  finish: typeof finishBundle;
};

const serverActions: ScanActions = { lookup: lookupBundle, receive: receiveBundle, finish: finishBundle };

export function ScanApp({
  userId,
  reasons,
  actions = serverActions,
}: {
  userId: string;
  reasons: Reason[];
  /** Injectable for the dev preview; defaults to the real server actions. */
  actions?: ScanActions;
}) {
  const [phase, setPhase] = useState<Phase>({ k: 'scan' });
  const busy = useRef(false);

  const reset = useCallback(() => {
    busy.current = false;
    setPhase({ k: 'scan' });
  }, []);

  const lookup = useCallback(async (raw: string) => {
    if (busy.current) return; // ignore repeat detections of the same label
    busy.current = true;
    setPhase({ k: 'loading' });
    const res = await actions.lookup(raw);
    setPhase(res.ok ? { k: 'result', bundle: res.data } : { k: 'error', message: res.message });
  }, [actions]);

  const onDone = useCallback((result: ScanResult) => {
    navigator.vibrate?.(60);
    setPhase({ k: 'success', result });
  }, []);

  useEffect(() => {
    if (phase.k !== 'success') return;
    const t = setTimeout(reset, SUCCESS_MS);
    return () => clearTimeout(t);
  }, [phase, reset]);

  return (
    <main className="flex flex-1 flex-col px-4 pb-32">
      {phase.k === 'scan' || phase.k === 'loading' ? (
        <ScannerView onCode={lookup} loading={phase.k === 'loading'} />
      ) : phase.k === 'error' ? (
        <>
          <InlineAlert tone="danger" className="mt-4">{phase.message}</InlineAlert>
          <BottomBar>
            <Button size="lg" className="w-full" onClick={reset} autoFocus>
              <ScanLine size={24} strokeWidth={1.5} aria-hidden /> Scan lagi
            </Button>
          </BottomBar>
        </>
      ) : phase.k === 'result' ? (
        <ResultView bundle={phase.bundle} reasons={reasons} userId={userId} actions={actions} onDone={onDone} onRescan={reset} />
      ) : (
        <SuccessView result={phase.result} />
      )}
    </main>
  );
}

// ---------------------------------------------------------------------------

function ScannerView({ onCode, loading }: { onCode: (code: string) => void; loading: boolean }) {
  const [manual, setManual] = useState('');
  const [fineP, setFinePointer] = useState(false);

  // Desktop / handheld-scanner stations: keep the field focused so the
  // scanner's keystrokes + Enter land here. On phones, don't pop the keyboard.
  useEffect(() => setFinePointer(window.matchMedia('(pointer: fine)').matches), []);

  return (
    <div className="mt-2 flex flex-col gap-4">
      <CameraScanner onDetected={onCode} paused={loading} />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (manual.trim()) onCode(manual);
        }}
        className="flex flex-col gap-2"
      >
        <Label htmlFor="manual-code">Ketik kode bundle</Label>
        <div className="flex gap-2">
          <Input
            id="manual-code"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="B-00231"
            autoComplete="off"
            autoCapitalize="characters"
            enterKeyHint="search"
            autoFocus={fineP}
            className="num h-12 sm:h-12"
          />
          <Button type="submit" variant="secondary" size="lg" disabled={loading || !manual.trim()}>
            Cari
          </Button>
        </div>
      </form>
      {loading && <p className="text-small text-text-muted" aria-live="polite">Mencari bundle...</p>}
    </div>
  );
}

function BundleSummary({ bundle }: { bundle: LookupResult }) {
  const v = bundle.variant;
  return (
    <section aria-live="polite" className="mt-2 rounded-xl border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="num text-text-muted">{bundle.code}</p>
          <h2 className="mt-1 text-h2">
            {v.product_name} {v.size}
          </h2>
          <p className="text-small text-text-muted">
            {v.color} · Batch <span className="num">{bundle.batch_code}</span>
          </p>
        </div>
        <StatusBadge status={bundle.status} />
      </div>
      <div className="mt-4 flex items-end justify-between border-t border-border pt-4">
        <div>
          <p className="text-caption text-text-muted">Qty acuan</p>
          <p className="num text-display">
            {bundle.ref_qty} <span className="text-h3 font-medium text-text-muted">pcs</span>
          </p>
        </div>
        {bundle.holder_name && (
          <p className="text-right text-small text-text-muted">
            Pemegang
            <br />
            <span className="text-text">{bundle.holder_name}</span>
          </p>
        )}
      </div>
    </section>
  );
}

function ResultView({
  bundle,
  reasons,
  userId,
  actions,
  onDone,
  onRescan,
}: {
  bundle: LookupResult;
  reasons: Reason[];
  userId: string;
  actions: ScanActions;
  onDone: (r: ScanResult) => void;
  onRescan: () => void;
}) {
  if (!bundle.allowed || !bundle.next_action) {
    return (
      <>
        <BundleSummary bundle={bundle} />
        {bundle.message && (
          <InlineAlert tone="danger" className="mt-4">
            {bundle.message}
          </InlineAlert>
        )}
        <BottomBar>
          <Button size="lg" className="w-full" onClick={onRescan} autoFocus>
            <ScanLine size={24} strokeWidth={1.5} aria-hidden /> Scan lagi
          </Button>
        </BottomBar>
      </>
    );
  }
  return bundle.next_action === 'terima' ? (
    <ReceiveForm bundle={bundle} reasons={reasons.filter((r) => r.type === 'selisih')} userId={userId} receive={actions.receive} onDone={onDone} onRescan={onRescan} />
  ) : (
    <FinishForm bundle={bundle} reasons={reasons.filter((r) => r.type === 'reject')} finish={actions.finish} onDone={onDone} onRescan={onRescan} />
  );
}

function useSubmit(onDone: (r: ScanResult) => void) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<{ message: string; stale: boolean } | null>(null);
  const submit = (fn: () => Promise<ActionResult<ScanResult>>) =>
    start(async () => {
      setError(null);
      try {
        const res = await fn();
        if (res.ok) onDone(res.data);
        else setError({ message: res.message, stale: res.code === 'version_conflict' || res.code === 'wrong_status' });
      } catch {
        setError({ message: 'Koneksi terputus. Scan belum terkirim, coba lagi.', stale: false });
      }
    });
  return { pending, error, submit };
}

function ReceiveForm({
  bundle,
  reasons,
  userId,
  receive,
  onDone,
  onRescan,
}: {
  bundle: LookupResult;
  reasons: Reason[];
  userId: string;
  receive: ScanActions['receive'];
  onDone: (r: ScanResult) => void;
  onRescan: () => void;
}) {
  const [qty, setQty] = useState(bundle.ref_qty);
  const [reasonId, setReasonId] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const { pending, error, submit } = useSubmit(onDone);
  const selisih = bundle.ref_qty - qty;
  const needsReason = selisih > 0;
  const canSubmit = !pending && (!needsReason || reasonId !== '');

  const confirm = () =>
    submit(async () => {
      let photoPath: string | null = null;
      if (needsReason && photo) {
        try {
          photoPath = await uploadSelisihPhoto(userId, photo);
        } catch {
          return { ok: false, message: 'Foto gagal diupload. Hapus foto atau coba lagi.', code: null };
        }
      }
      return receive({
        code: bundle.code,
        qtyReceived: qty,
        reasonId: needsReason ? reasonId : null,
        photoPath,
        version: bundle.version,
      });
    });

  return (
    <>
      <BundleSummary bundle={bundle} />
      <div className="mt-4 flex flex-col gap-4">
        <QtyStepper id="qty-received" label="Qty diterima" value={qty} onChange={setQty} max={bundle.ref_qty} />
        {needsReason && (
          <div className="flex flex-col gap-4 motion-safe:animate-[fade-in_150ms_cubic-bezier(0.2,0,0,1)]">
            <InlineAlert tone="warning">
              Selisih <span className="num font-medium">{selisih}</span> pcs dari qty kirim{' '}
              <span className="num">{bundle.ref_qty}</span>.
            </InlineAlert>
            <div>
              <Label htmlFor="reason">Alasan selisih</Label>
              <Select id="reason" value={reasonId} onChange={(e) => setReasonId(e.target.value)} required aria-invalid={reasonId === '' || undefined}>
                <option value="" disabled>
                  Pilih alasan
                </option>
                {reasons.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </Select>
            </div>
            <PhotoInput file={photo} onChange={setPhoto} />
          </div>
        )}
        {error && <InlineAlert tone="danger">{error.message}</InlineAlert>}
      </div>
      <BottomBar>
        {error?.stale ? (
          <Button size="lg" className="w-full" onClick={onRescan}>
            <ScanLine size={24} strokeWidth={1.5} aria-hidden /> Scan lagi
          </Button>
        ) : (
          <Button size="lg" className="w-full" disabled={!canSubmit} onClick={confirm}>
            {pending ? 'Mengirim...' : `Konfirmasi terima ${qty} pcs`}
          </Button>
        )}
      </BottomBar>
    </>
  );
}

function FinishForm({
  bundle,
  reasons,
  finish,
  onDone,
  onRescan,
}: {
  bundle: LookupResult;
  reasons: Reason[];
  finish: ScanActions['finish'];
  onDone: (r: ScanResult) => void;
  onRescan: () => void;
}) {
  const isFinishing = bundle.status === 'proses_finishing';
  const goodLabel = isFinishing ? 'Lolos QC' : 'Jadi';
  const [good, setGood] = useState(bundle.ref_qty);
  const [reject, setReject] = useState(0);
  const [reasonId, setReasonId] = useState('');
  const { pending, error, submit } = useSubmit(onDone);
  const sum = good + reject;
  const balanced = sum === bundle.ref_qty;
  const canSubmit = !pending && balanced && (reject === 0 || reasonId !== '');

  const confirm = () =>
    submit(() =>
      finish({
        code: bundle.code,
        qtyGood: good,
        qtyReject: reject,
        reasonId: reject > 0 ? reasonId : null,
        version: bundle.version,
      }),
    );

  return (
    <>
      <BundleSummary bundle={bundle} />
      <div className="mt-4 flex flex-col gap-4">
        <QtyStepper id="qty-good" label={goodLabel} value={good} onChange={setGood} max={bundle.ref_qty} invalid={!balanced} />
        <QtyStepper id="qty-reject" label="Reject" value={reject} onChange={setReject} max={bundle.ref_qty} invalid={!balanced} />
        <p className={cn('num rounded-md px-4 py-3 text-right', balanced ? 'bg-surface-muted text-text' : 'bg-danger-soft text-danger')} aria-live="polite">
          {good} + {reject} = {sum} dari {bundle.ref_qty}
        </p>
        {reject > 0 && (
          <div>
            <Label htmlFor="reject-reason">Alasan reject</Label>
            <Select id="reject-reason" value={reasonId} onChange={(e) => setReasonId(e.target.value)} required aria-invalid={reasonId === '' || undefined}>
              <option value="" disabled>
                Pilih alasan
              </option>
              {reasons.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </Select>
          </div>
        )}
        {error && <InlineAlert tone="danger">{error.message}</InlineAlert>}
      </div>
      <BottomBar>
        {error?.stale ? (
          <Button size="lg" className="w-full" onClick={onRescan}>
            <ScanLine size={24} strokeWidth={1.5} aria-hidden /> Scan lagi
          </Button>
        ) : (
          <Button size="lg" className="w-full" disabled={!canSubmit} onClick={confirm}>
            {pending
              ? 'Mengirim...'
              : `Konfirmasi selesai ${good} ${isFinishing ? 'lolos QC' : 'jadi'}, ${reject} reject`}
          </Button>
        )}
      </BottomBar>
    </>
  );
}

function PhotoInput({ file, onChange }: { file: File | null; onChange: (f: File | null) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
      {file ? (
        <div className="flex items-center justify-between rounded-md border border-border bg-surface px-4 py-3">
          <span className="truncate text-small">Foto terlampir</span>
          <Button variant="ghost" onClick={() => { onChange(null); if (inputRef.current) inputRef.current.value = ''; }}>
            Hapus foto
          </Button>
        </div>
      ) : (
        <Button variant="secondary" size="lg" className="w-full" onClick={() => inputRef.current?.click()}>
          <Camera size={24} strokeWidth={1.5} aria-hidden /> Tambah foto (opsional)
        </Button>
      )}
    </div>
  );
}

function SuccessView({ result }: { result: ScanResult }) {
  return (
    <div role="status" className="mt-2 flex flex-1 flex-col items-center justify-center gap-3 rounded-xl bg-success-soft px-6 text-center text-success">
      <CircleCheck size={24} strokeWidth={1.5} aria-hidden />
      <p className="text-h2">{result.message}</p>
      <p className="text-small">Status sekarang: {STATUS_LABEL[result.status].toLowerCase()}</p>
    </div>
  );
}

function BottomBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 border-t border-border bg-surface">
      <div className="mx-auto w-full max-w-md px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))]">{children}</div>
    </div>
  );
}

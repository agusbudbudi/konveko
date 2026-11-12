'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { Camera, CircleCheck, ScanLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InlineAlert } from '@/components/ui/inline-alert';
import { Combobox } from '@/components/ui/combobox';
import { Input, Label } from '@/components/ui/input';
import { QtyStepper } from '@/components/ui/qty-stepper';
import { Badge, StatusBadge } from '@/components/ui/status-badge';
import { cn } from '@/lib/cn';
import { uploadSelisihPhoto } from '@/lib/photo';
import { STATUS_LABEL, type ActionResult, type LookupResult, type Reason, type ScanResult } from '@/lib/types';
import { finishBundle, lookupBundle, receiveBundle } from './actions';
import { CameraScanner } from './camera-scanner';
import { normalizeScan } from '@/lib/scan/normalize';
import { setScanPrefs, usesCamera, useScanPrefs } from '@/lib/scan/prefs';
import { useScanner } from '@/lib/scan/use-scanner';

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

  // From the error screen, the next hardware scan starts over without tapping "Scan lagi".
  useScanner((code) => {
    busy.current = false;
    lookup(code);
  }, phase.k === 'error');

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

export function ScannerView({
  onCode,
  loading,
  label = 'Ketik kode bundle',
  placeholder = 'B-00231',
  loadingText = 'Mencari bundle...',
}: {
  onCode: (code: string) => void;
  loading: boolean;
  label?: string;
  placeholder?: string;
  loadingText?: string;
}) {
  const [manual, setManual] = useState('');
  const [fineP, setFinePointer] = useState(false);
  const prefs = useScanPrefs();
  const camera = prefs ? usesCamera(prefs) : null;

  // Desktop / handheld-scanner stations: keep the field focused so the
  // scanner's keystrokes + Enter land here. On phones, don't pop the keyboard.
  useEffect(() => setFinePointer(window.matchMedia('(pointer: fine)').matches), []);

  // Hardware scanners (SUNMI, wedge guns, native bridge) work with no field focused.
  useScanner((code) => {
    setManual(''); // a scan into the focused code box replaces what was typed
    onCode(code);
  }, !loading);

  return (
    <div className="mt-2 flex flex-col gap-4">
      {camera === null ? (
        <div aria-hidden className="h-40 rounded-xl border border-border bg-surface-muted" />
      ) : camera ? (
        <CameraScanner onDetected={(c) => onCode(normalizeScan(c))} paused={loading} />
      ) : (
        <HardwareReady loading={loading} />
      )}
      {camera !== null && (
        <div className="-mt-2 flex items-center justify-between text-small">
          <button
            type="button"
            onClick={() => setScanPrefs({ input: camera ? 'scanner' : 'camera' })}
            className="inline-flex h-10 items-center gap-1.5 text-text-muted hover:text-text"
          >
            {camera ? <ScanLine size={16} strokeWidth={1.5} aria-hidden /> : <Camera size={16} strokeWidth={1.5} aria-hidden />}
            {camera ? 'Pakai tombol scan perangkat' : 'Pakai kamera'}
          </button>
          <Link href="/scan/perangkat" className="inline-flex h-10 items-center text-text-muted hover:text-text">
            Atur perangkat
          </Link>
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!manual.trim()) return;
          onCode(manual);
          setManual(''); // the view can stay mounted (warehouse: rack -> bundle), start clean
        }}
        className="flex flex-col gap-2"
      >
        <Label htmlFor="manual-code">{label}</Label>
        <div className="flex gap-2">
          <Input
            id="manual-code"
            data-scan-field
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder={placeholder}
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
      {loading && <p className="text-small text-text-muted" aria-live="polite">{loadingText}</p>}
    </div>
  );
}

/** Shown instead of the camera on devices with a built-in or attached scanner. */
function HardwareReady({ loading }: { loading: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border-strong bg-surface px-6 py-8 text-center">
      <ScanReadyArt loading={loading} />
      <p className="text-h3">{loading ? 'Membaca...' : 'Siap scan'}</p>
      <p className="text-small text-text-muted">Tekan tombol scan di perangkat, arahkan ke QR di label.</p>
    </div>
  );
}

/**
 * Handheld scanner aiming at a QR label, a laser line sweeping the code.
 * Same palette and soft blob as components/ui/empty-state.tsx.
 */
function ScanReadyArt({ loading }: { loading: boolean }) {
  const c = {
    blob: 'var(--primary-soft)',
    surface: 'var(--surface)',
    muted: 'var(--surface-muted)',
    line: 'var(--border-strong)',
    primary: 'var(--primary)',
    laser: 'var(--highlight)',
  };
  // QR data modules (x, y, w, h) between the three finder squares
  const modules = [
    [108, 30, 4, 4], [108, 38, 4, 4], [116, 42, 4, 4], [124, 48, 4, 4], [108, 50, 4, 4],
    [116, 56, 4, 4], [124, 60, 4, 4], [108, 62, 8, 4], [120, 52, 4, 4],
  ];
  const finders = [
    [92, 28],
    [118, 28],
    [92, 54],
  ];
  return (
    <svg aria-hidden viewBox="0 0 160 104" fill="none" className="h-28 w-44 shrink-0">
      <ellipse cx="80" cy="95" rx="54" ry="6" style={{ fill: c.muted }} />
      <circle cx="80" cy="50" r="42" style={{ fill: c.blob }} />
      <circle cx="132" cy="14" r="3" style={{ fill: c.laser }} opacity=".7" />
      <circle cx="26" cy="78" r="2.5" style={{ fill: c.primary }} opacity=".35" />

      {/* Beam from the scanner window to the label */}
      <path
        d="M63 43 88 26v46L63 55Z"
        style={{ fill: c.laser }}
        opacity=".18"
        className={cn(loading && 'motion-safe:animate-pulse')}
      />

      {/* Label with QR */}
      <rect x="86" y="22" width="48" height="58" rx="6" style={{ fill: c.surface, stroke: c.line }} strokeWidth="2" />
      {finders.map(([x, y]) => (
        <g key={`${x}-${y}`}>
          <rect x={x} y={y} width="12" height="12" rx="2" style={{ stroke: c.primary }} strokeWidth="2" />
          <rect x={x + 4} y={y + 4} width="4" height="4" rx="1" style={{ fill: c.primary }} />
        </g>
      ))}
      {modules.map(([x, y, w, h]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={w} height={h} rx="1" style={{ fill: c.primary }} opacity=".85" />
      ))}
      <path d="M92 73h18" style={{ stroke: c.line }} strokeWidth="2.5" strokeLinecap="round" />
      <rect
        x="89"
        y="46"
        width="42"
        height="2"
        rx="1"
        style={{ fill: c.laser }}
        className={cn('motion-safe:animate-[scan-sweep_2.4s_ease-in-out_infinite]', loading && 'opacity-40')}
      />

      {/* Handheld scanner */}
      <path
        d="M40 57 34 80a3 3 0 0 0 3 4h8a3 3 0 0 0 3-2.5L52 57Z"
        style={{ fill: c.surface, stroke: c.primary }}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <rect x="28" y="38" width="38" height="21" rx="7" style={{ fill: c.surface, stroke: c.primary }} strokeWidth="2.5" />
      <rect x="60" y="43" width="4" height="11" rx="1.5" style={{ fill: c.laser }} />
      <path d="M36 46h12" style={{ stroke: c.line }} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M53 60c2 4 1 7-2 8" style={{ stroke: c.primary }} strokeWidth="2.5" strokeLinecap="round" />
    </svg>
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
        <div className="flex flex-col items-end gap-1.5">
          <StatusBadge status={bundle.status} />
          {bundle.rework && <Badge tone="info">Rework</Badge>}
        </div>
      </div>
      {bundle.rework && (
        <p className="mt-3 rounded-md bg-info-soft px-3 py-2 text-small text-info">
          Rework dari <span className="num font-medium">{bundle.rework.of_code}</span>
          {bundle.rework.note && <>: {bundle.rework.note}</>}
        </p>
      )}
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
              <Combobox
                id="reason"
                value={reasonId}
                onChange={setReasonId}
                required
                size="lg"
                searchable={false}
                invalid={reasonId === ''}
                placeholder="Pilih alasan"
                options={reasons.map((r) => ({ value: r.id, label: r.label }))}
              />
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
            <Combobox
                id="reject-reason"
                value={reasonId}
                onChange={setReasonId}
                required
                size="lg"
                searchable={false}
                invalid={reasonId === ''}
                placeholder="Pilih alasan"
                options={reasons.map((r) => ({ value: r.id, label: r.label }))}
              />
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
      {result.status === 'ready_stock' && <p className="text-small">Label pcs masuk antrian cetak.</p>}
    </div>
  );
}

/** Sticky action bar of a task screen. Its [data-scan-task] hides the tab bar (globals.css). */
export function BottomBar({ children }: { children: React.ReactNode }) {
  return (
    <div data-scan-task className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface">
      <div className="mx-auto w-full max-w-md px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))]">{children}</div>
    </div>
  );
}

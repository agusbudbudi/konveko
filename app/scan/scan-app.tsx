'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { Camera, Check, RefreshCw, ScanLine, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InlineAlert } from '@/components/ui/inline-alert';
import { Badge, StatusBadge } from '@/components/ui/status-badge';
import { cn } from '@/lib/cn';
import { uploadSelisihPhoto } from '@/lib/photo';
import { type ActionResult, type LookupResult, type Reason, type ScanResult } from '@/lib/types';
import { finishBundle, lookupBundle, receiveBundle } from './actions';
import { useScanner } from '@/lib/scan/use-scanner';
import { BigStepper, ReasonChips, RejectedPanel, SuccessScreen, TaskHeader } from './scan-ui';
import { BottomBar, loadRecent, pushRecent, ScannerView, type RecentScan } from './scanner-view';

const RECENT_KEY = 'konveko:scan-recent';

/**
 * Server message to a title and a detail:
 *   "Bundle B-00231 diterima. 18 dari 20 pcs, selisih 2." -> "Diterima", "18 dari 20 pcs, selisih 2"
 *   "Bundle B-00244 selesai jahit. 19 jadi, 1 reject."   -> "Selesai jahit", "19 jadi, 1 reject"
 */
export function splitResult(code: string, message: string) {
  const s = message.replace(`Bundle ${code} `, '').trim();
  const dot = s.indexOf('. ');
  const head = (dot === -1 ? s : s.slice(0, dot)).replace(/\.$/, '');
  const detail = dot === -1 ? '' : s.slice(dot + 2).replace(/\.$/, '');
  return { title: head.charAt(0).toUpperCase() + head.slice(1), detail };
}

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
  const [recent, setRecent] = useState<RecentScan[]>([]);
  const busy = useRef(false);

  useEffect(() => setRecent(loadRecent(RECENT_KEY)), []);

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

  // From a rejected scan, the next hardware scan starts over without tapping "Scan lagi".
  useScanner((code) => {
    busy.current = false;
    lookup(code);
  }, phase.k === 'error' || (phase.k === 'result' && (!phase.bundle.allowed || !phase.bundle.next_action)));

  const onDone = useCallback((result: ScanResult) => {
    navigator.vibrate?.(60);
    setPhase({ k: 'success', result });
    setRecent((list) =>
      pushRecent(RECENT_KEY, list, {
        code: result.code,
        text: (({ title, detail }) => (detail ? `${title}: ${detail}` : title))(splitResult(result.code, result.message)),
        tone: (result.selisih ?? 0) > 0 ? 'warning' : 'success',
      }),
    );
  }, []);

  useEffect(() => {
    if (phase.k !== 'success') return;
    const t = setTimeout(reset, SUCCESS_MS);
    return () => clearTimeout(t);
  }, [phase, reset]);

  return (
    <main className={cn('flex flex-1 flex-col', phase.k !== 'scan' && phase.k !== 'loading' && 'px-4')}>
      {phase.k === 'scan' || phase.k === 'loading' ? (
        <ScannerView onCode={lookup} loading={phase.k === 'loading'} recent={recent} loadingText="Mencari bundle..." />
      ) : phase.k === 'error' ? (
        <>
          <TaskHeader title="Scan" backLabel="Kembali ke scan" onBack={reset} />
          <RejectedPanel message={phase.message} />
          <BottomBar>
            <Button size="lg" className="h-14 w-full" onClick={reset} autoFocus>
              <ScanLine size={24} strokeWidth={1.5} aria-hidden /> Scan lagi
            </Button>
          </BottomBar>
        </>
      ) : phase.k === 'result' ? (
        <ResultView
          key={`${phase.bundle.code}-${phase.bundle.version}`}
          bundle={phase.bundle}
          reasons={reasons}
          userId={userId}
          actions={actions}
          onDone={onDone}
          onRescan={reset}
          onReload={() => {
            busy.current = false;
            lookup(phase.bundle.code);
          }}
        />
      ) : (
        <SuccessView result={phase.result} onNext={reset} />
      )}
    </main>
  );
}

function BundleSummary({ bundle }: { bundle: LookupResult }) {
  const v = bundle.variant;
  return (
    <section aria-live="polite" className="mt-3 rounded-xl border border-border bg-surface px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="num text-small text-text-muted">
            {bundle.code} · {bundle.batch_code}
          </p>
          <h2 className="text-h2">
            {v.product_name} {v.size}
          </h2>
          <p className="truncate text-small text-text-muted">
            {v.color}
            {bundle.holder_name && <> · {bundle.holder_name}</>}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <StatusBadge status={bundle.status} />
          {bundle.rework && <Badge tone="info">Rework</Badge>}
          <p className="text-caption text-text-muted">
            Acuan <span className="num text-h3 text-text">{bundle.ref_qty}</span> pcs
          </p>
        </div>
      </div>
      {bundle.rework && (
        <p className="mt-2 rounded-md bg-info-soft px-3 py-2 text-small text-info">
          Rework dari <span className="num font-medium">{bundle.rework.of_code}</span>
          {bundle.rework.note && <>: {bundle.rework.note}</>}
        </p>
      )}
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
  onReload,
}: {
  bundle: LookupResult;
  reasons: Reason[];
  userId: string;
  actions: ScanActions;
  onDone: (r: ScanResult) => void;
  onRescan: () => void;
  /** Look the same code up again (after a conflict): shows what is recorded now. */
  onReload: () => void;
}) {
  if (!bundle.allowed || !bundle.next_action) {
    return (
      <>
        <TaskHeader title="Bundle" backLabel="Kembali ke scan" onBack={onRescan} />
        <BundleSummary bundle={bundle} />
        <RejectedPanel message={bundle.message ?? 'Bundle ini tidak bisa diproses sekarang.'} />
        <BottomBar>
          <Button size="lg" className="h-14 w-full" onClick={onRescan} autoFocus>
            <ScanLine size={24} strokeWidth={1.5} aria-hidden /> Scan lagi
          </Button>
        </BottomBar>
      </>
    );
  }
  return bundle.next_action === 'terima' ? (
    <ReceiveForm bundle={bundle} reasons={reasons.filter((r) => r.type === 'selisih')} userId={userId} receive={actions.receive} onDone={onDone} onRescan={onRescan} onReload={onReload} />
  ) : (
    <FinishForm bundle={bundle} reasons={reasons.filter((r) => r.type === 'reject')} finish={actions.finish} onDone={onDone} onRescan={onRescan} onReload={onReload} />
  );
}

/** Why a send failed: offline (keep the form, send again) or stale (someone changed the bundle). */
type SendError = { kind: 'network' | 'stale' | 'other'; message: string };

function useSubmit(onDone: (r: ScanResult) => void) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<SendError | null>(null);
  const submit = (fn: () => Promise<ActionResult<ScanResult>>) =>
    start(async () => {
      setError(null);
      if (!navigator.onLine) {
        setError({ kind: 'network', message: 'Koneksi terputus. Cari sinyal atau WiFi, lalu kirim ulang. Tidak perlu scan lagi.' });
        return;
      }
      try {
        const res = await fn();
        if (res.ok) onDone(res.data);
        else
          setError({
            kind: res.code === 'version_conflict' || res.code === 'wrong_status' ? 'stale' : 'other',
            message: res.message,
          });
      } catch {
        setError({ kind: 'network', message: 'Koneksi terputus. Cari sinyal atau WiFi, lalu kirim ulang. Tidak perlu scan lagi.' });
      }
    });
  return { pending, error, submit };
}

/** The error under a form, and the bottom button that fits it. */
function SendErrorView({ error, mine }: { error: SendError; mine: React.ReactNode }) {
  if (error.kind === 'network') {
    return (
      <div role="alert" className="flex gap-2.5 rounded-md bg-danger-soft p-3 text-danger">
        <WifiOff size={20} strokeWidth={1.75} aria-hidden className="mt-0.5 shrink-0" />
        <div>
          <p className="font-semibold">Scan belum terkirim</p>
          <p className="text-small">{error.message}</p>
        </div>
      </div>
    );
  }
  if (error.kind === 'stale') {
    return (
      <div role="alert" className="rounded-md bg-warning-soft p-3 text-warning">
        <p className="font-semibold">Bundle ini baru saja diubah</p>
        <p className="text-small">{error.message}</p>
        <p className="mt-1.5 text-small">
          Isianmu tadi (tidak disimpan): <span className="font-medium">{mine}</span>
        </p>
      </div>
    );
  }
  return <InlineAlert tone="danger">{error.message}</InlineAlert>;
}

function SubmitBar({
  error,
  pending,
  disabled,
  label,
  onSubmit,
  onReload,
}: {
  error: SendError | null;
  pending: boolean;
  disabled: boolean;
  label: string;
  onSubmit: () => void;
  onReload: () => void;
}) {
  return (
    <BottomBar>
      {error?.kind === 'stale' ? (
        <Button size="lg" className="h-14 w-full" onClick={onReload}>
          <RefreshCw size={20} strokeWidth={1.75} aria-hidden /> Lihat data terbaru
        </Button>
      ) : (
        <Button size="lg" className="h-14 w-full text-[16px]" disabled={disabled} onClick={onSubmit}>
          {error?.kind === 'network' && <RefreshCw size={20} strokeWidth={1.75} aria-hidden />}
          {pending ? 'Mengirim...' : error?.kind === 'network' ? `Kirim ulang: ${label.replace(/^Konfirmasi /, '')}` : label}
        </Button>
      )}
    </BottomBar>
  );
}

function ReceiveForm({
  bundle,
  reasons,
  userId,
  receive,
  onDone,
  onRescan,
  onReload,
}: {
  bundle: LookupResult;
  reasons: Reason[];
  userId: string;
  receive: ScanActions['receive'];
  onDone: (r: ScanResult) => void;
  onRescan: () => void;
  onReload: () => void;
}) {
  const [qty, setQty] = useState(bundle.ref_qty);
  const [reasonId, setReasonId] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const { pending, error, submit } = useSubmit(onDone);
  const selisih = bundle.ref_qty - qty;
  const needsReason = selisih > 0;
  const canSubmit = !pending && (!needsReason || reasonId !== '');
  const reasonLabel = reasons.find((r) => r.id === reasonId)?.label;

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
      <TaskHeader title="Terima bundle" onBack={onRescan} />
      <BundleSummary bundle={bundle} />
      <div className="mt-4 flex flex-col gap-4">
        <BigStepper
          id="qty-received"
          label="Qty diterima"
          value={qty}
          onChange={setQty}
          max={bundle.ref_qty}
          quick={{ label: `Sesuai ${bundle.ref_qty}`, value: bundle.ref_qty }}
        />
        {needsReason && (
          <>
            <p role="status" className="rounded-md bg-warning-soft px-3 py-2.5 text-warning">
              Kurang <span className="num font-semibold">{selisih}</span> pcs dari qty kirim{' '}
              <span className="num">{bundle.ref_qty}</span>. Pilih alasannya.
            </p>
            <ReasonChips
              legend="Alasan selisih"
              options={reasons.map((r) => ({ value: r.id, label: r.label }))}
              value={reasonId}
              onChange={setReasonId}
              invalid={reasonId === ''}
            />
            <PhotoInput file={photo} onChange={setPhoto} />
          </>
        )}
        {error && (
          <SendErrorView
            error={error}
            mine={
              <>
                terima <span className="num">{qty}</span> pcs{reasonLabel && <>, {reasonLabel.toLowerCase()}</>}
              </>
            }
          />
        )}
      </div>
      <SubmitBar
        error={error}
        pending={pending}
        disabled={!canSubmit}
        label={`Konfirmasi terima ${qty} pcs`}
        onSubmit={confirm}
        onReload={onReload}
      />
    </>
  );
}

function FinishForm({
  bundle,
  reasons,
  finish,
  onDone,
  onRescan,
  onReload,
}: {
  bundle: LookupResult;
  reasons: Reason[];
  finish: ScanActions['finish'];
  onDone: (r: ScanResult) => void;
  onRescan: () => void;
  onReload: () => void;
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
  const goodWord = isFinishing ? 'lolos QC' : 'jadi';

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
      <TaskHeader title={isFinishing ? 'Selesai QC' : 'Selesai jahit'} onBack={onRescan} />
      <BundleSummary bundle={bundle} />
      <div className="mt-4 flex flex-col gap-3">
        <BigStepper inline id="qty-good" label={goodLabel} value={good} onChange={setGood} max={bundle.ref_qty} invalid={!balanced} />
        <BigStepper inline id="qty-reject" label="Reject" tone="danger" value={reject} onChange={setReject} max={bundle.ref_qty} invalid={!balanced} />
        <section aria-live="polite" className={cn('flex flex-col gap-2 rounded-lg p-3', balanced ? 'bg-surface-muted' : 'bg-danger-soft')}>
          <div aria-hidden className="flex h-2.5 gap-0.5 overflow-hidden rounded-sm bg-border-strong">
            {good > 0 && <span className="bg-chart-ready" style={{ flex: `${good} 1 0` }} />}
            {reject > 0 && <span className="bg-chart-reject" style={{ flex: `${reject} 1 0` }} />}
            {sum < bundle.ref_qty && <span style={{ flex: `${bundle.ref_qty - sum} 1 0` }} />}
          </div>
          <p className="num flex items-center justify-between">
            <span className={cn(!balanced && 'text-danger')}>
              <span className="font-semibold">{good}</span> + <span className="font-semibold">{reject}</span> ={' '}
              <span className="font-semibold">{sum}</span> dari {bundle.ref_qty}
            </span>
            {balanced ? (
              <span className="inline-flex items-center gap-1 text-small font-semibold text-success">
                <Check size={16} strokeWidth={2.5} aria-hidden /> Pas
              </span>
            ) : (
              <span className="text-small font-semibold text-danger">
                {sum < bundle.ref_qty ? `Kurang ${bundle.ref_qty - sum}` : `Lebih ${sum - bundle.ref_qty}`}
              </span>
            )}
          </p>
        </section>
        {reject > 0 && (
          <ReasonChips
            legend="Alasan reject"
            options={reasons.map((r) => ({ value: r.id, label: r.label }))}
            value={reasonId}
            onChange={setReasonId}
            invalid={reasonId === ''}
          />
        )}
        {error && (
          <SendErrorView
            error={error}
            mine={
              <>
                <span className="num">{good}</span> {goodWord}, <span className="num">{reject}</span> reject
              </>
            }
          />
        )}
      </div>
      <SubmitBar
        error={error}
        pending={pending}
        disabled={!canSubmit}
        label={`Konfirmasi ${good} ${goodWord}, ${reject} reject`}
        onSubmit={confirm}
        onReload={onReload}
      />
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
        <div className="flex items-center justify-between rounded-md border border-border bg-surface px-4 py-2">
          <span className="truncate text-small">Foto terlampir</span>
          <Button variant="ghost" onClick={() => { onChange(null); if (inputRef.current) inputRef.current.value = ''; }}>
            Hapus foto
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-md border border-dashed border-border-strong bg-surface font-medium text-neutral"
        >
          <Camera size={20} strokeWidth={1.75} aria-hidden /> Tambah foto (opsional)
        </button>
      )}
    </div>
  );
}

function SuccessView({ result, onNext }: { result: ScanResult; onNext: () => void }) {
  const { title, detail } = splitResult(result.code, result.message);
  return (
    <SuccessScreen
      ms={SUCCESS_MS}
      onNext={onNext}
      title={title}
      subtitle={
        <>
          <span className="num font-semibold">{result.code}</span>
          {detail && <> · {detail}</>}
        </>
      }
    >
      <p className="inline-flex items-center gap-2 text-small">
        Status sekarang <StatusBadge status={result.status} />
      </p>
      {result.status === 'ready_stock' && <p className="text-small">Label pcs masuk antrian cetak.</p>}
      <p className="text-small text-success">Kembali ke scan otomatis...</p>
    </SuccessScreen>
  );
}

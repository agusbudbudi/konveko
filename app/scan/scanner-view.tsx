'use client';

import { Camera, CircleAlert, Keyboard, Loader2, ScanLine } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/cn';
import { normalizeScan } from '@/lib/scan/normalize';
import { setScanPrefs, usesCamera, useScanPrefs } from '@/lib/scan/prefs';
import { useScanner } from '@/lib/scan/use-scanner';
import { CameraScanner } from './camera-scanner';
import { KeypadEntry, type EntryKind } from './keypad-entry';

/** One line in the "Terakhir di-scan" card / list. */
export type RecentScan = { id: string; code: string; text: string; tone: 'success' | 'warning' | 'danger'; at: number };

/**
 * The scan screen of every mode: camera edge to edge (or the "Siap scan" card on a device
 * with a hardware scanner), what was scanned last, and "Ketik kode" for damaged labels.
 * Hardware scans (SUNMI, wedge guns) arrive here whichever input is shown.
 */
export function ScannerView({
  onCode,
  loading,
  kinds = ['bundle'],
  hint = 'Arahkan ke QR di label bundle',
  loadingText = 'Mencari...',
  recent = [],
  className,
}: {
  onCode: (code: string) => void;
  loading: boolean;
  /** Code kinds the keypad offers, first one preselected. */
  kinds?: EntryKind[];
  hint?: string;
  loadingText?: string;
  /** Newest first. Camera mode shows the first; scanner mode lists a few. */
  recent?: RecentScan[];
  className?: string;
}) {
  const [typing, setTyping] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const prefs = useScanPrefs();
  const camera = prefs ? usesCamera(prefs) : null;

  const run = (code: string) => {
    setPending(code);
    onCode(code);
  };

  // Hardware scanners work with no field focused, also while the keypad is open.
  useScanner((code) => {
    setTyping(false);
    run(code);
  }, !loading);

  if (typing) {
    return (
      <KeypadEntry
        kinds={kinds}
        busy={loading}
        onClose={() => setTyping(false)}
        onSubmit={(code) => {
          setTyping(false);
          run(code);
        }}
      />
    );
  }

  const typeButton = (
    <button
      type="button"
      onClick={() => setTyping(true)}
      className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-md border border-border-strong bg-surface font-medium hover:bg-surface-muted"
    >
      <Keyboard size={20} strokeWidth={1.75} aria-hidden />
      Label rusak? Ketik kode
    </button>
  );

  return (
    <div className={cn('flex flex-1 flex-col', className)}>
      {camera === null ? (
        <div aria-hidden className="min-h-64 flex-1 bg-surface-muted" />
      ) : camera ? (
        <CameraScanner
          className="flex-1"
          paused={loading}
          hint={hint}
          onDetected={(c) => run(normalizeScan(c))}
          actions={
            <button
              type="button"
              onClick={() => setScanPrefs({ input: 'scanner' })}
              className="inline-flex h-11 items-center gap-2 rounded-md border border-border-strong bg-surface px-3.5 text-small font-medium text-text"
            >
              <ScanLine size={20} strokeWidth={1.75} aria-hidden />
              Pakai scanner
            </button>
          }
        />
      ) : (
        <HardwareReady loading={loading} />
      )}

      <section aria-live="polite" className="flex flex-col gap-2.5 border-t border-border bg-surface px-4 py-3">
        {loading ? (
          <div className="flex items-center gap-3 py-1">
            <Loader2 size={24} strokeWidth={2} aria-hidden className="shrink-0 animate-spin text-primary" />
            <div className="min-w-0">
              <p className="text-h3">{loadingText}</p>
              {pending && <p className="num truncate text-small text-text-muted">{pending}</p>}
            </div>
          </div>
        ) : camera === false ? (
          <RecentList items={recent} />
        ) : (
          recent[0] && <LastScan item={recent[0]} />
        )}
        {!loading && (
          <div className="flex gap-2">
            {typeButton}
            {camera === false && (
              <button
                type="button"
                onClick={() => setScanPrefs({ input: 'camera', hardwareSeen: false })}
                className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-md border border-border-strong bg-surface px-3.5 font-medium hover:bg-surface-muted"
              >
                <Camera size={20} strokeWidth={1.75} aria-hidden />
                Kamera
              </button>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

/** Shown instead of the camera on devices with a built-in or attached scanner. */
function HardwareReady({ loading }: { loading: boolean }) {
  return (
    <div className="px-4 pt-4 pb-3">
      <div className="flex items-center gap-4 rounded-xl border-2 border-dashed border-primary bg-primary-soft px-4 py-5">
        <span className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <ScanLine size={30} strokeWidth={1.75} aria-hidden className={cn(loading && 'motion-safe:animate-pulse')} />
        </span>
        <div>
          <p className="text-h1 text-primary">{loading ? 'Membaca...' : 'Siap scan'}</p>
          <p className="text-small text-primary-hover">Tekan tombol scan di perangkat, arahkan ke QR di label.</p>
        </div>
      </div>
    </div>
  );
}

const TONE = {
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
} as const;

function ago(at: number) {
  const min = Math.floor((Date.now() - at) / 60_000);
  return min < 1 ? 'baru saja' : `${min} mnt`;
}

function LastScan({ item }: { item: RecentScan }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5">
      <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-md', TONE[item.tone])}>
        {item.tone === 'danger' ? <CircleAlert size={18} strokeWidth={2} aria-hidden /> : <ScanLine size={18} strokeWidth={2} aria-hidden />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-caption text-text-muted">Terakhir di-scan</p>
        <p className="truncate text-small font-medium">
          <span className="num font-semibold">{item.code}</span> · {item.text}
        </p>
      </div>
      <span className="num shrink-0 text-caption text-text-muted">{ago(item.at)}</span>
    </div>
  );
}

function RecentList({ items }: { items: RecentScan[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h2 className="mb-1.5 text-h3">Scan terakhir</h2>
      <ul className="rounded-lg border border-border">
        {items.slice(0, 4).map((it, i) => (
          <li key={it.id} className={cn('flex items-center gap-3 px-3 py-2.5', i > 0 && 'border-t border-border')}>
            <div className="min-w-0 flex-1">
              <p className="num text-small font-semibold">{it.code}</p>
              <p className={cn('truncate text-small', it.tone === 'success' ? 'text-text-muted' : it.tone === 'warning' ? 'text-warning' : 'text-danger')}>
                {it.text}
              </p>
            </div>
            <span className="num shrink-0 text-caption text-text-muted">
              {new Date(it.at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Sticky action bar of a task screen. Its [data-scan-task] hides the tab bar (globals.css),
 * and the spacer keeps the last content clear of the fixed bar.
 */
export function BottomBar({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div aria-hidden className="h-28 shrink-0" />
      <div data-scan-task className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface">
        <div className="mx-auto w-full max-w-md px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))]">{children}</div>
      </div>
    </>
  );
}

/** Recent scans kept for this tab session, so a reload keeps "Terakhir di-scan". */
export function loadRecent(key: string): RecentScan[] {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as RecentScan[]) : [];
  } catch {
    return [];
  }
}

export function pushRecent(key: string, list: RecentScan[], item: Omit<RecentScan, 'id' | 'at'>): RecentScan[] {
  const next = [{ ...item, id: `${Date.now()}-${item.code}`, at: Date.now() }, ...list].slice(0, 10);
  try {
    sessionStorage.setItem(key, JSON.stringify(next));
  } catch {}
  return next;
}

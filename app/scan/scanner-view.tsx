'use client';

import { Camera, Check, CircleAlert, Keyboard, Loader2, ScanLine } from 'lucide-react';
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
      className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-md border border-border-strong bg-surface font-medium whitespace-nowrap hover:bg-surface-muted"
    >
      <Keyboard size={20} strokeWidth={1.75} aria-hidden />
      {camera === false ? 'Ketik kode' : 'Label rusak? Ketik kode'}
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

      {/* under the dark camera the panel is a white strip; in scanner mode it sits on the page like the card above */}
      <section
        aria-live="polite"
        className={cn('flex flex-col gap-2.5 px-4', camera === false ? 'pb-3' : 'border-t border-border bg-surface py-3')}
      >
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
      <div className="flex items-center gap-3 rounded-xl border-2 border-dashed border-primary bg-primary-soft py-3 pr-4 pl-2">
        <ScanReadyArt loading={loading} onTint className="h-16 w-24" />
        <div className="min-w-0">
          <p className="text-h1 text-primary">{loading ? 'Membaca...' : 'Siap scan'}</p>
          <p className="text-small text-primary-hover">Tekan tombol scan di perangkat, arahkan ke QR di label.</p>
        </div>
      </div>
    </div>
  );
}

/**
 * Handheld scanner aiming at a QR label, a laser line sweeping the code.
 * Same palette and soft blob as components/ui/empty-state.tsx.
 */
function ScanReadyArt({ loading, onTint = false, className }: { loading: boolean; onTint?: boolean; className?: string }) {
  const c = {
    // on the primary-soft card the usual blob would vanish; a white one keeps the shape
    blob: onTint ? 'var(--surface)' : 'var(--primary-soft)',
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
    <svg aria-hidden viewBox="0 0 160 104" fill="none" className={cn("shrink-0", className ?? "h-28 w-44")}>
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
        {item.tone === 'danger' ? <CircleAlert size={18} strokeWidth={2} aria-hidden /> : <Check size={18} strokeWidth={2.25} aria-hidden />}
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
 * Sticky action bar of a task screen. Its [data-scan-task] hides the tab bar (globals.css).
 * Sticky, not fixed: it sits at the end of the page's flex column <main> (px-4, flex-1), pushed
 * to the bottom by mt-auto, so no spacer has to guess its height. Render it as a direct child of <main>.
 */
export function BottomBar({ children }: { children: React.ReactNode }) {
  return (
    <div
      data-scan-task
      className="sticky bottom-0 z-20 -mx-4 mt-auto border-t border-border bg-surface px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))]"
    >
      {children}
    </div>
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

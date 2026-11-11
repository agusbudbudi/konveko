'use client';

import { WedgeDetector } from './keyboard-wedge';
import { normalizeScan } from './normalize';
import { getScanPrefs, setScanPrefs } from './prefs';

/**
 * One entry point for every scan source that is not tied to a component.
 *
 *   wedge   keyboard-wedge scanners (SUNMI keyboard output, Zebra keystroke, USB/BT guns).
 *           Keys are read at window level, so no field has to be focused and the
 *           phone keyboard never pops up.
 *   native  a native wrapper (Capacitor/TWA) that receives the scanner's Android broadcast
 *           (SUNMI `com.sunmi.scanner.ACTION_DATA_CODE_RECEIVED`, Zebra DataWedge intent)
 *           calls `window.konvekoScan(code)` or dispatches a `konveko:scan` CustomEvent.
 *
 * The camera stays inside its component (it needs a video element) and calls the
 * page handler directly. Adding a source = call `emit(code, source)`.
 *
 * Only the most recently subscribed listener receives a scan: the screen on top
 * (a modal, the current phase) owns the scanner.
 */

export type ScanSource = 'camera' | 'wedge' | 'native';
export type ScanEvent = { code: string; raw: string; source: ScanSource; gaps?: number[] };
export type KeyTrace = { key: string; gap: number | null; inField: boolean; result: string };

type Listener = (e: ScanEvent) => void;

/** The same code again within this window is a repeat read of one label. */
const REPEAT_MS = 1500;

const listeners: Listener[] = [];
const tracers = new Set<(t: KeyTrace) => void>();
let detector: WedgeDetector | null = null;
let idleTimer: ReturnType<typeof setTimeout> | undefined;
let lastKeyAt: number | null = null;
let last: { code: string; at: number } | null = null;

declare global {
  interface Window {
    konvekoScan?: (code: string) => void;
  }
}

function isField(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  if (t.isContentEditable || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return true;
  if (!(t instanceof HTMLInputElement)) return false;
  return !['button', 'checkbox', 'radio', 'submit', 'reset', 'file', 'range', 'color'].includes(t.type);
}

export function emit(raw: string, source: ScanSource, gaps?: number[]) {
  const code = normalizeScan(raw);
  if (!code) return;
  const now = performance.now();
  if (last && last.code === code && now - last.at < REPEAT_MS) return;
  last = { code, at: now };
  if (source !== 'camera' && !getScanPrefs().hardwareSeen) setScanPrefs({ hardwareSeen: true });
  listeners[listeners.length - 1]?.({ code, raw, source, gaps });
}

function onKeyDown(e: KeyboardEvent) {
  const now = performance.now();
  const gap = lastKeyAt === null ? null : Math.round(now - lastKeyAt);
  lastKeyAt = now;
  // A focused field takes the keys itself (a person typing a note or a qty), except a
  // field marked `data-scan-field` (a code box): there a scan is still detected and
  // delivered clean, and the handler replaces whatever the field held, so a scan never
  // gets glued to the previous search text.
  const scanField = e.target instanceof HTMLElement && e.target.hasAttribute('data-scan-field');
  const inField = isField(e.target) && !scanField;
  let result = 'field';
  if (!inField && detector) {
    const r = detector.feed({ key: e.key, time: now, ctrlKey: e.ctrlKey, altKey: e.altKey, metaKey: e.metaKey });
    result = r.kind;
    if (r.kind === 'scan') {
      e.preventDefault();
      e.stopPropagation();
      emit(r.code, 'wedge', r.gaps);
    } else if (r.kind === 'buffered' && (e.key === 'Enter' || e.key === 'Tab')) {
      e.preventDefault();
    }
    clearTimeout(idleTimer);
    const deadline = detector.idleDeadline();
    if (deadline !== null) {
      idleTimer = setTimeout(() => {
        const f = detector?.flushIdle(performance.now());
        if (f?.kind === 'scan') emit(f.code, 'wedge', f.gaps);
      }, Math.max(0, deadline - now) + 5);
    }
  }
  tracers.forEach((fn) => fn({ key: e.key, gap, inField, result }));
}

function onCustom(e: Event) {
  const code = (e as CustomEvent<{ code?: unknown }>).detail?.code;
  if (typeof code === 'string') emit(code, 'native');
}

function start() {
  detector = new WedgeDetector();
  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('konveko:scan', onCustom);
  window.konvekoScan = (code: string) => emit(String(code), 'native');
}

function stop() {
  window.removeEventListener('keydown', onKeyDown, true);
  window.removeEventListener('konveko:scan', onCustom);
  delete window.konvekoScan;
  clearTimeout(idleTimer);
  detector = null;
}

function active() {
  return listeners.length > 0 || tracers.size > 0;
}

export function subscribe(fn: Listener): () => void {
  if (!active()) start();
  listeners.push(fn);
  return () => {
    const i = listeners.lastIndexOf(fn);
    if (i >= 0) listeners.splice(i, 1);
    if (!active()) stop();
  };
}

/** Raw key log for the device test screen. */
export function subscribeTrace(fn: (t: KeyTrace) => void): () => void {
  if (!active()) start();
  tracers.add(fn);
  return () => {
    tracers.delete(fn);
    if (!active()) stop();
  };
}

/** Forget the last code, so the same label can be scanned again at once (after an undo). */
export function forgetLastScan() {
  last = null;
}

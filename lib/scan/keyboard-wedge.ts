/**
 * Keyboard-wedge detection: tells a hardware scanner apart from a person typing.
 *
 * Wedge scanners (SUNMI L2s/L2s Pro in keyboard output mode, Zebra DataWedge
 * keystroke output, Honeywell, USB and Bluetooth HID guns) "type" the code as
 * key events, usually followed by Enter. They type much faster than any person:
 * a few ms to a few tens of ms per key. We collect a run of fast keys and emit
 * it as one scan when Enter/Tab arrives, or after a short pause for scanners
 * configured without a suffix.
 *
 * Pure and framework-free so it can be unit-tested with plain node.
 */

export type WedgeOptions = {
  /** Max ms between two keys of one scan. People type at 80 ms+ per key. */
  maxGapMs: number;
  /** Shorter runs are ignored (stray keys, a fast double tap). */
  minLength: number;
  /** No suffix configured: emit after this many ms without a key. */
  idleMs: number;
};

export const WEDGE_DEFAULTS: WedgeOptions = { maxGapMs: 50, minLength: 4, idleMs: 120 };

export type WedgeKey = { key: string; time: number; ctrlKey?: boolean; altKey?: boolean; metaKey?: boolean };

export type WedgeResult =
  /** key was not part of a scan: let the page handle it */
  | { kind: 'pass' }
  /** key belongs to a scan in progress (or ends one with nothing to emit) */
  | { kind: 'buffered' }
  /** a full scan; the caller should preventDefault the key that ended it */
  | { kind: 'scan'; code: string; gaps: number[] };

const SUFFIX = new Set(['Enter', 'Tab']);
// keys a scanner may send between characters without meaning anything
const NEUTRAL = new Set(['Shift', 'CapsLock', 'Unidentified', 'Dead']);

export class WedgeDetector {
  private opts: WedgeOptions;
  private buf = '';
  private gaps: number[] = [];
  private last = 0;
  private lastEmit = -Infinity;

  constructor(opts: Partial<WedgeOptions> = {}) {
    this.opts = { ...WEDGE_DEFAULTS, ...opts };
  }

  feed(e: WedgeKey): WedgeResult {
    if (e.ctrlKey || e.altKey || e.metaKey) {
      this.reset();
      return { kind: 'pass' };
    }
    if (NEUTRAL.has(e.key)) return this.buf ? { kind: 'buffered' } : { kind: 'pass' };

    if (SUFFIX.has(e.key)) {
      const done = this.take(e.time);
      if (done) return done;
      // the suffix of a scan we already emitted on idle: swallow it so it does not
      // press a focused button ("Scan lagi") or submit a form a second time
      if (e.time - this.lastEmit < this.opts.idleMs * 3) return { kind: 'buffered' };
      return { kind: 'pass' };
    }

    if (e.key.length !== 1) {
      this.reset();
      return { kind: 'pass' };
    }

    if (this.buf && e.time - this.last > this.opts.maxGapMs) this.reset();
    if (this.buf) this.gaps.push(e.time - this.last);
    this.buf += e.key;
    this.last = e.time;
    // A single key could be a person; only claim it once the run is clearly fast.
    return this.buf.length >= 2 ? { kind: 'buffered' } : { kind: 'pass' };
  }

  /** Call when no key came for a while; emits a scan from a scanner without a suffix. */
  flushIdle(now: number): WedgeResult {
    if (!this.buf || now - this.last < this.opts.idleMs) return { kind: 'pass' };
    return this.take(now) ?? { kind: 'pass' };
  }

  /** ms after the last key at which flushIdle should run, or null when idle. */
  idleDeadline(): number | null {
    return this.buf ? this.last + this.opts.idleMs : null;
  }

  private take(now: number): WedgeResult | null {
    const code = this.buf;
    const gaps = this.gaps;
    this.reset();
    if (code.length < this.opts.minLength) return null;
    if (gaps.some((g) => g > this.opts.maxGapMs)) return null;
    this.lastEmit = now;
    return { kind: 'scan', code, gaps };
  }

  private reset() {
    this.buf = '';
    this.gaps = [];
  }
}

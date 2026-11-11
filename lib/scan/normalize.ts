/**
 * Turns whatever a scan source hands us into the code the server expects.
 * Pure, no imports: unit-tested with plain node (tests/unit).
 *
 * Hardware scanners can be set to add things around the data: an AIM symbology
 * identifier (`]Q1` for QR, `]C0` for Code128), a CR/LF/Tab suffix, or a
 * configured prefix. The server already accepts a QR token or a human code
 * (B-00231, P-0000123, rack A1, SJ-000001), so we only strip the wrapping.
 */

const AIM_ID = /^\][A-Za-z][0-9A-Za-z]/;
// C0 controls and DEL (CR, LF, Tab, GS separators, ...)
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/g;

export const CODE_MAX = 64;

export function normalizeScan(raw: string): string {
  let s = raw.replace(CONTROL, '').trim();
  if (AIM_ID.test(s)) s = s.slice(3).trim();
  // a URL-style QR (a future label format, or another system's label): keep the last path part
  if (/^https?:\/\//i.test(s)) {
    try {
      const parts = new URL(s).pathname.split('/').filter(Boolean);
      if (parts.length) s = decodeURIComponent(parts[parts.length - 1]);
    } catch {
      // not a valid URL after all; leave as is
    }
  }
  return s.slice(0, CODE_MAX);
}

export type CodeKind = 'token' | 'piece' | 'bundle' | 'batch' | 'outbound' | 'other';

/** Best guess from the format alone; `other` can be a rack code, a SKU, or junk. */
export function classifyCode(code: string): CodeKind {
  if (/^[0-9a-f]{32}$/i.test(code)) return 'token';
  if (/^P-\d+$/i.test(code)) return 'piece';
  if (/^B-\d+(-\d+)?$/i.test(code)) return 'bundle';
  if (/^BT-\d+$/i.test(code)) return 'batch';
  if (/^SJ-\d+$/i.test(code)) return 'outbound';
  return 'other';
}

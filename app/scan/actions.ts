'use server';

import { callRpc } from '@/lib/rpc';
import type { ActionResult, LookupResult, ScanResult } from '@/lib/types';

const CODE_MAX = 64;

function cleanCode(code: string) {
  return code.trim().slice(0, CODE_MAX);
}

function isInt(n: unknown, min = 0): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= min && n <= 100_000;
}

export async function lookupBundle(code: string): Promise<ActionResult<LookupResult>> {
  const c = cleanCode(code);
  if (!c) return { ok: false, message: 'Isi kode bundle.', code: 'qty_invalid' };
  return callRpc<LookupResult>('scan_lookup', { p_code: c });
}

export async function receiveBundle(input: {
  code: string;
  qtyReceived: number;
  reasonId: string | null;
  photoPath: string | null;
  version: number;
}): Promise<ActionResult<ScanResult>> {
  if (!isInt(input.qtyReceived)) return { ok: false, message: 'Qty diterima tidak valid.', code: 'qty_invalid' };
  return callRpc<ScanResult>('scan_receive', {
    p_code: cleanCode(input.code),
    p_qty_received: input.qtyReceived,
    p_reason_id: input.reasonId,
    p_photo_path: input.photoPath,
    p_expected_version: input.version,
  });
}

export async function finishBundle(input: {
  code: string;
  qtyGood: number;
  qtyReject: number;
  reasonId: string | null;
  version: number;
}): Promise<ActionResult<ScanResult>> {
  if (!isInt(input.qtyGood) || !isInt(input.qtyReject)) {
    return { ok: false, message: 'Qty tidak valid.', code: 'qty_invalid' };
  }
  return callRpc<ScanResult>('scan_finish', {
    p_code: cleanCode(input.code),
    p_qty_good: input.qtyGood,
    p_qty_reject: input.qtyReject,
    p_reason_id: input.reasonId,
    p_expected_version: input.version,
  });
}

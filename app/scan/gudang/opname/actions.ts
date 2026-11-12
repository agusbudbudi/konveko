'use server';

import { refresh } from 'next/cache';
import { callRpc } from '@/lib/rpc';
import type { ActionResult } from '@/lib/types';

const clean = (s: string) => s.trim().slice(0, 64);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** What the counter may see: how many were counted on this rack, never how many should be there. */
export type CountTally = { pieces: number; unlabeled: number; last: string[] };
export type CountScanResult = CountTally & { code: string; duplicate: boolean; warning: string | null; message: string };

const bad = (message: string): ActionResult<never> => ({ ok: false, message, code: 'invalid' });

export async function countScan(countId: string, rack: string, code: string): Promise<ActionResult<CountScanResult>> {
  if (!UUID.test(countId) || !clean(rack) || !clean(code)) return bad('Scan label pcs.');
  return callRpc<CountScanResult>('stock_count_scan', { p_count_id: countId, p_location: clean(rack), p_code: clean(code) });
}

export async function countUndo(countId: string, rack: string, code: string): Promise<ActionResult<CountTally & { message: string }>> {
  if (!UUID.test(countId)) return bad('Opname tidak valid.');
  const res = await callRpc<CountTally & { message: string }>('stock_count_undo', {
    p_count_id: countId, p_location: clean(rack), p_code: clean(code),
  });
  if (res.ok) refresh();
  return res;
}

export async function countUnlabeled(
  countId: string,
  rack: string,
  variantId: string,
  condition: 'baik' | 'rusak',
  qty: number,
): Promise<ActionResult<CountTally & { message: string }>> {
  if (!UUID.test(countId) || !UUID.test(variantId)) return bad('Pilih variant.');
  if (!Number.isInteger(qty) || qty < 0 || qty > 10000) return bad('Jumlah harus antara 0 dan 10000.');
  const res = await callRpc<CountTally & { message: string }>('stock_count_unlabeled', {
    p_count_id: countId, p_location: clean(rack), p_variant_id: variantId, p_condition: condition, p_qty: qty,
  });
  if (res.ok) refresh();
  return res;
}

export async function countCloseRack(countId: string, rack: string): Promise<ActionResult<{ message: string; racks_left: number }>> {
  if (!UUID.test(countId)) return bad('Opname tidak valid.');
  const res = await callRpc<{ message: string; racks_left: number }>('stock_count_close_location', {
    p_count_id: countId, p_location: clean(rack),
  });
  if (res.ok) refresh();
  return res;
}

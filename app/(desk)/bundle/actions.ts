'use server';

import { refresh } from 'next/cache';
import { scheduleDispatch } from '@/lib/notifications/server';
import { callRpc } from '@/lib/rpc';
import type { ActionResult } from '@/lib/types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const intOrNull = (n: number | null) => (n === null ? null : Number.isInteger(n) && n >= 0 && n <= 100_000 ? n : NaN);

export async function correctMovement(input: {
  movementId: string;
  note: string;
  isVoid: boolean;
  qtyReceived: number | null;
  qtyGood: number | null;
  qtyReject: number | null;
  reasonId: string | null;
}): Promise<ActionResult<{ message: string }>> {
  if (!UUID.test(input.movementId)) return { ok: false, message: 'Scan tidak valid.', code: 'not_correctable' };
  const note = input.note.trim().slice(0, 500);
  if (!note) return { ok: false, message: 'Alasan koreksi wajib diisi.', code: 'note_required' };
  const nums = [input.qtyReceived, input.qtyGood, input.qtyReject].map(intOrNull);
  if (nums.some((n) => Number.isNaN(n))) return { ok: false, message: 'Qty tidak valid.', code: 'qty_invalid' };
  if (input.reasonId && !UUID.test(input.reasonId)) return { ok: false, message: 'Alasan tidak valid.', code: 'reason_invalid' };

  const res = await callRpc<{ message: string }>('correct_movement', {
    p_movement_id: input.movementId,
    p_note: note,
    p_void: input.isVoid,
    p_qty_received: input.isVoid ? null : nums[0],
    p_qty_good: input.isVoid ? null : nums[1],
    p_qty_reject: input.isVoid ? null : nums[2],
    p_reason_id: input.isVoid ? null : input.reasonId,
  });
  if (res.ok) {
    scheduleDispatch(); // a correction can open a new selisih
    refresh();
  }
  return res;
}

export async function resolveDiscrepancy(id: string, note: string): Promise<ActionResult<null>> {
  if (!UUID.test(id)) return { ok: false, message: 'Flag tidak valid.', code: 'not_found' };
  const clean = note.trim().slice(0, 500);
  if (!clean) return { ok: false, message: 'Catatan wajib diisi.', code: 'note_required' };
  const res = await callRpc<null>('resolve_discrepancy', { p_discrepancy_id: id, p_note: clean });
  if (res.ok) refresh();
  return res;
}

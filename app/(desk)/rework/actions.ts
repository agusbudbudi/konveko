'use server';

import { refresh } from 'next/cache';
import { callRpc } from '@/lib/rpc';
import { CODE_MAX } from '@/lib/scan/normalize';
import type { ActionResult, ReworkSource, ReworkStep } from '@/lib/types';

export type ReworkCreated = {
  id: string;
  code: string;
  of_code: string;
  source: ReworkSource;
  start_step: ReworkStep;
  qty: number;
};
export type ReworkResult = { created: ReworkCreated[]; skipped: { code: string; reason: string }[]; message: string };

/** Send reject or damaged pcs to rework (supervisor, admin). The database groups them per origin bundle. */
export async function createRework(input: {
  codes: string[];
  startStep: ReworkStep;
  note: string;
}): Promise<ActionResult<ReworkResult>> {
  const codes = [...new Set(input.codes.map((c) => c.trim()).filter((c) => c && c.length <= CODE_MAX))].slice(0, 500);
  if (!codes.length) return { ok: false, message: 'Scan atau pilih minimal satu pcs.', code: 'codes_required' };
  if (input.startStep !== 'jahit' && input.startStep !== 'finishing') {
    return { ok: false, message: 'Pilih tujuan rework: jahit atau finishing.', code: 'step_required' };
  }
  const note = input.note.trim().slice(0, 500);
  if (!note) return { ok: false, message: 'Catatan rework wajib diisi.', code: 'note_required' };

  const res = await callRpc<ReworkResult>('create_rework', { p_codes: codes, p_start_step: input.startStep, p_note: note });
  if (res.ok) refresh();
  return res;
}

/** Undo a rework bundle that was never scanned; its pcs go back to their rack. */
export async function cancelRework(code: string, note: string): Promise<ActionResult<{ message: string }>> {
  const clean = note.trim().slice(0, 500);
  if (!clean) return { ok: false, message: 'Alasan pembatalan wajib diisi.', code: 'note_required' };
  const res = await callRpc<{ message: string }>('cancel_rework', { p_code: code.trim().slice(0, CODE_MAX), p_note: clean });
  if (res.ok) refresh();
  return res;
}

'use server';

import { refresh } from 'next/cache';
import { callRpc } from '@/lib/rpc';
import type { ActionResult } from '@/lib/types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bad = (message: string): ActionResult<never> => ({ ok: false, message, code: 'invalid' });
const rack = (s: string) => s.trim().toUpperCase().slice(0, 8);

export async function createCount(racks: string[], note: string): Promise<ActionResult<{ id: string; code: string; message: string }>> {
  const codes = [...new Set(racks.map(rack).filter(Boolean))].slice(0, 200);
  if (!codes.length) return bad('Pilih minimal satu rak.');
  const res = await callRpc<{ id: string; code: string; message: string }>('stock_count_create', {
    p_location_codes: codes,
    p_note: note.trim().slice(0, 500) || null,
  });
  if (res.ok) refresh();
  return res;
}

export async function reopenRack(countId: string, code: string): Promise<ActionResult<{ message: string }>> {
  if (!UUID.test(countId)) return bad('Opname tidak valid.');
  const res = await callRpc<{ message: string }>('stock_count_reopen_location', { p_count_id: countId, p_location: rack(code) });
  if (res.ok) refresh();
  return res;
}

/** Drop one scan (e.g. a pcs counted on two racks). */
export async function dropScan(countId: string, code: string, piece: string): Promise<ActionResult<{ message: string }>> {
  if (!UUID.test(countId)) return bad('Opname tidak valid.');
  const res = await callRpc<{ message: string }>('stock_count_undo', {
    p_count_id: countId, p_location: rack(code), p_code: piece.trim().slice(0, 64),
  });
  if (res.ok) refresh();
  return res;
}

export async function approveCount(countId: string): Promise<ActionResult<{ message: string }>> {
  if (!UUID.test(countId)) return bad('Opname tidak valid.');
  const res = await callRpc<{ message: string }>('stock_count_approve', { p_count_id: countId });
  if (res.ok) refresh();
  return res;
}

export async function cancelCount(countId: string, note: string): Promise<ActionResult<{ message: string }>> {
  if (!UUID.test(countId)) return bad('Opname tidak valid.');
  const clean = note.trim().slice(0, 500);
  if (!clean) return bad('Alasan pembatalan wajib diisi.');
  const res = await callRpc<{ message: string }>('stock_count_cancel', { p_count_id: countId, p_note: clean });
  if (res.ok) refresh();
  return res;
}

'use server';

import { refresh } from 'next/cache';
import { redirect } from 'next/navigation';
import { dbError, fail, str, UUID, type FormState } from '@/lib/master';
import {
  isOutboundType,
  type OutboundAddResult,
  type OutboundRemoveResult,
  type OutboundShipResult,
  type PieceReturnResult,
} from '@/lib/outbound';
import { callRpc } from '@/lib/rpc';
import { createClient } from '@/lib/supabase/server';
import type { ActionResult } from '@/lib/types';

// Every write goes through the database functions (app.outbound_*), which check roles
// and rules. These actions only shape input and refresh the page.

const code64 = (s: string) => s.trim().slice(0, 64);

export async function createOutbound(_: FormState, fd: FormData): Promise<FormState> {
  const type = str(fd, 'type', 20);
  if (!isOutboundType(type)) return fail('Pilih jenis dokumen.');
  const plan: { variant_id: string; qty: number }[] = [];
  for (const [k, v] of fd.entries()) {
    const m = /^plan\[(\d+)\]\[variant\]$/.exec(k);
    if (!m) continue;
    const variant = String(v);
    const qty = Number(fd.get(`plan[${m[1]}][qty]`));
    if (UUID.test(variant) && Number.isInteger(qty) && qty > 0 && qty <= 100000) plan.push({ variant_id: variant, qty });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('outbound_create', {
    p_type: type,
    p_destination: str(fd, 'destination', 120),
    p_ref_no: str(fd, 'ref_no', 60) || null,
    p_note: str(fd, 'note', 500) || null,
    p_plan: plan.length ? plan : null,
  });
  if (error) return fail(typeof error.details === 'string' && /^[a-z_]+$/.test(error.details) ? error.message : dbError(error));
  redirect(`/barang-keluar/${(data as { id: string }).id}`);
}

export async function addToOutbound(id: string, code: string): Promise<ActionResult<OutboundAddResult>> {
  if (!UUID.test(id) || !code64(code)) return { ok: false, message: 'Scan atau ketik kode pcs/bundle.', code: 'not_found' };
  const res = await callRpc<OutboundAddResult>('outbound_add', { p_outbound_id: id, p_code: code64(code) });
  if (res.ok) refresh();
  return res;
}

export async function removeFromOutbound(id: string, code: string): Promise<ActionResult<OutboundRemoveResult>> {
  if (!UUID.test(id)) return { ok: false, message: 'Dokumen tidak ditemukan.', code: 'not_found' };
  const res = await callRpc<OutboundRemoveResult>('outbound_remove', { p_outbound_id: id, p_code: code64(code) });
  if (res.ok) refresh();
  return res;
}

export async function shipOutbound(id: string): Promise<ActionResult<OutboundShipResult>> {
  if (!UUID.test(id)) return { ok: false, message: 'Dokumen tidak ditemukan.', code: 'not_found' };
  const res = await callRpc<OutboundShipResult>('outbound_ship', { p_outbound_id: id });
  if (res.ok) refresh();
  return res;
}

export async function cancelOutbound(id: string): Promise<ActionResult<{ code: string; message: string }>> {
  if (!UUID.test(id)) return { ok: false, message: 'Dokumen tidak ditemukan.', code: 'not_found' };
  const res = await callRpc<{ code: string; message: string }>('outbound_cancel', { p_outbound_id: id });
  if (res.ok) refresh();
  return res;
}

export async function returnPiece(code: string, condition: string, note: string): Promise<ActionResult<PieceReturnResult>> {
  if (condition !== 'baik' && condition !== 'rusak') return { ok: false, message: 'Pilih kondisi barang.', code: 'qty_invalid' };
  if (!note.trim()) return { ok: false, message: 'Alasan retur wajib diisi.', code: 'note_required' };
  const res = await callRpc<PieceReturnResult>('piece_return', {
    p_code: code64(code),
    p_condition: condition,
    p_note: note.trim().slice(0, 300),
  });
  if (res.ok) refresh();
  return res;
}

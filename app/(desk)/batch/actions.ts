'use server';

import { refresh } from 'next/cache';
import { redirect } from 'next/navigation';
import { callRpc } from '@/lib/rpc';
import type { ActionResult } from '@/lib/types';

type CreatedBatch = { batch_id: string; code: string; bundles: { id: string; code: string; qty: number }[] };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const okQty = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n > 0 && n <= 100_000;

export async function createBatch(input: {
  fabricRollId: string;
  items: { variantId: string; qty: number }[];
}): Promise<ActionResult<never>> {
  if (!UUID.test(input.fabricRollId)) return { ok: false, message: 'Pilih rol kain.', code: 'qty_invalid' };
  const items = input.items.filter((i) => i.variantId);
  if (items.length === 0) return { ok: false, message: 'Isi minimal satu variant hasil potong.', code: 'items_required' };
  if (items.some((i) => !UUID.test(i.variantId) || !okQty(i.qty))) {
    return { ok: false, message: 'Qty hasil potong harus angka lebih dari 0.', code: 'qty_invalid' };
  }

  const res = await callRpc<CreatedBatch>('create_batch', {
    p_fabric_roll_id: input.fabricRollId,
    p_items: items.map((i) => ({ variant_id: i.variantId, qty: i.qty })),
  });
  if (!res.ok) return res;
  redirect(`/batch/${res.data.batch_id}?baru=1`);
}

export async function splitBundle(code: string, qtys: number[]): Promise<ActionResult<{ children: { code: string; qty: number }[] }>> {
  if (qtys.length < 2 || !qtys.every(okQty)) {
    return { ok: false, message: 'Isi minimal dua qty, masing-masing lebih dari 0.', code: 'qty_invalid' };
  }
  const res = await callRpc<{ children: { code: string; qty: number }[] }>('split_bundle', {
    p_code: code.slice(0, 64),
    p_qtys: qtys,
  });
  if (res.ok) refresh();
  return res;
}

type BundleChange = { bundle_id: string; code: string; qty: number; message: string };

/** FR-10: change the qty and/or variant of a bundle while the batch is draft. */
export async function editBundle(input: { code: string; qty: number; variantId: string }): Promise<ActionResult<BundleChange>> {
  if (!okQty(input.qty)) return { ok: false, message: 'Qty hasil potong harus angka lebih dari 0.', code: 'qty_invalid' };
  if (!UUID.test(input.variantId)) return { ok: false, message: 'Pilih variant.', code: 'qty_invalid' };
  const res = await callRpc<BundleChange>('edit_bundle', {
    p_code: input.code.slice(0, 64),
    p_qty: input.qty,
    p_variant_id: input.variantId,
    p_note: null,
  });
  if (res.ok) refresh();
  return res;
}

/** FR-10: add a variant that was forgotten at cutting, while the batch is draft. */
export async function addBundleToBatch(input: { batchId: string; variantId: string; qty: number }): Promise<ActionResult<BundleChange>> {
  if (!UUID.test(input.batchId)) return { ok: false, message: 'Batch tidak ditemukan.', code: 'not_found' };
  if (!UUID.test(input.variantId)) return { ok: false, message: 'Pilih variant.', code: 'qty_invalid' };
  if (!okQty(input.qty)) return { ok: false, message: 'Qty hasil potong harus angka lebih dari 0.', code: 'qty_invalid' };
  const res = await callRpc<BundleChange>('add_bundle_to_batch', {
    p_batch_id: input.batchId,
    p_variant_id: input.variantId,
    p_qty: input.qty,
  });
  if (res.ok) refresh();
  return res;
}

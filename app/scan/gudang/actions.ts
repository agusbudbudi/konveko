'use server';

import { callRpc } from '@/lib/rpc';
import { withSkuHint } from '@/lib/scan/sku-hint';
import type { ActionResult, PutawayResult, WarehouseLookup } from '@/lib/types';

const clean = (s: string) => s.trim().slice(0, 64);

export async function warehouseLookup(code: string): Promise<ActionResult<WarehouseLookup>> {
  const c = clean(code);
  if (!c) return { ok: false, message: 'Isi kode.', code: 'qty_invalid' };
  return withSkuHint(await callRpc<WarehouseLookup>('warehouse_lookup', { p_code: c }), c);
}

export async function putaway(location: string, code: string): Promise<ActionResult<PutawayResult>> {
  const l = clean(location);
  const c = clean(code);
  if (!l || !c) return { ok: false, message: 'Scan rak lalu bundle atau pcs.', code: 'qty_invalid' };
  return callRpc<PutawayResult>('putaway', { p_location: l, p_code: c });
}

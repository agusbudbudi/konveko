'use server';

import { callRpc } from '@/lib/rpc';
import { UUID } from '@/lib/master';
import type { ActionResult } from '@/lib/types';

export async function markPrinted(ids: string[]): Promise<ActionResult<number>> {
  const clean = ids.filter((id) => UUID.test(id)).slice(0, 1000);
  if (clean.length === 0) return { ok: false, message: 'Tidak ada label untuk ditandai.', code: 'qty_invalid' };
  // No refresh(): the print page would re-render without these labels and
  // drop the success message. /label is dynamic and reloads on navigation.
  return callRpc<number>('mark_printed', { p_piece_ids: clean });
}

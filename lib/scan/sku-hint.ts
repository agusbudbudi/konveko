import 'server-only';
import { createClient } from '@/lib/supabase/server';
import type { ActionResult } from '@/lib/types';

/**
 * Piece labels carry a QR (tracking) and a Code128 SKU (for POS and marketplaces).
 * A hardware scanner reads both, so the person may hit the SKU by accident. When a
 * scan lookup finds nothing, check whether the code is a SKU and say so.
 */
export async function withSkuHint<T>(res: ActionResult<T>, code: string): Promise<ActionResult<T>> {
  if (res.ok || res.code !== 'not_found') return res;
  const supabase = await createClient();
  const { data } = await supabase
    .from('product_variant')
    .select('product_name, size, color')
    .eq('sku', code.trim())
    .maybeSingle();
  if (!data) return res;
  return {
    ok: false,
    message: `Itu barcode SKU (${data.product_name} ${data.size} ${data.color}), bukan QR. Scan QR di label.`,
    code: 'sku_scanned',
  };
}

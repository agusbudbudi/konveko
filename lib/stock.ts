import 'server-only';
import { createClient } from '@/lib/supabase/server';

/** One row of the stock_location view: active pieces per variant, grade, and rack (null = not on a rack). */
export type StockRow = {
  variant_id: string;
  sku: string;
  product_name: string;
  size: string;
  color: string;
  grade: 'baik' | 'reject';
  location_id: string | null;
  location_code: string | null;
  qty: number;
};

export async function loadStock(): Promise<StockRow[]> {
  const supabase = await createClient();
  const { data } = await supabase.from('stock_location').select('*');
  return (data ?? []) as StockRow[];
}

const SIZE_ORDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', '2XL', '3XL', '4XL', '5XL', 'ALL', 'FREE'];

/** Garment sizes in wearing order (S < M < L < XL), numbers ascending, anything else alphabetical. */
export function compareSize(a: string, b: string) {
  const ia = SIZE_ORDER.indexOf(a.toUpperCase());
  const ib = SIZE_ORDER.indexOf(b.toUpperCase());
  if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  const na = Number(a);
  const nb = Number(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
  return a.localeCompare(b, 'id');
}

/** Totals for a set of rows: good, good not yet on a rack, reject. */
export function totals(rows: StockRow[]) {
  let baik = 0;
  let belumRak = 0;
  let reject = 0;
  for (const r of rows) {
    if (r.grade === 'reject') reject += r.qty;
    else {
      baik += r.qty;
      if (!r.location_id) belumRak += r.qty;
    }
  }
  return { baik, belumRak, reject };
}

export const productHref = (name: string) => `/stok/produk/${encodeURIComponent(name)}`;

import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { SHEETS, type ExistingRow, type Table } from '@/lib/master-import';

const SELECT: Record<Table, string> = {
  product_variant: 'id, sku, product_name, size, color, is_active',
  fabric_roll: 'id, code, material, color, length_or_weight, unit, supplier',
  location: 'id, code, kind, note, is_active',
  holder: 'id, type, name, phone, is_active',
  reason: 'id, type, code, label, is_active',
};

/** Current rows of every importable table (inactive ones too), as the signed-in user. */
export async function loadExisting(): Promise<Record<Table, ExistingRow[]>> {
  const supabase = await createClient();
  const entries = await Promise.all(
    SHEETS.map(async (s) => {
      // PostgREST returns at most 1000 rows per request: page through
      const rows: ExistingRow[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase.from(s.table).select(SELECT[s.table]).order('id').range(from, from + 999);
        if (error) throw new Error(error.message);
        rows.push(...((data ?? []) as unknown as ExistingRow[]));
        if (!data || data.length < 1000) break;
      }
      return [s.table, rows] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<Table, ExistingRow[]>;
}

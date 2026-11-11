/**
 * Excel import/export of master data: sheet layout, row validation and the diff against the
 * database. Pure (no Excel library, no database): lib/master-excel.ts reads and writes the
 * workbook, the server action loads the current rows. Unit-tested with plain node.
 *
 * PRD: doc/PRD Import dan export master data.md
 */
import {
  holderKey,
  holderRule,
  locationRule,
  reasonRule,
  rollRule,
  variantRule,
  type RuleResult,
} from './master-rules.ts';

export const MAX_ROWS = 5000;
export const MAX_FILE_BYTES = 2 * 1024 * 1024;

export type Cell = string | number | boolean | null;
export type Table = 'product_variant' | 'fabric_roll' | 'location' | 'holder' | 'reason';

type Column = {
  header: string;
  field: string;
  required?: boolean;
  /** shown in the Petunjuk sheet */
  help: string;
  example: string;
  /** exported as text so Excel keeps leading zeros and long numbers */
  text?: boolean;
};

export type SheetSpec = {
  table: Table;
  sheet: string;
  columns: Column[];
  /** fields written to the database (the import_master whitelist) */
  fields: string[];
  hasActive: boolean;
  keyOf: (v: Record<string, unknown>) => string;
  keyLabel: (v: Record<string, unknown>) => string;
  /** validate one row; `ctx.names` = product names in use so far (variant only) */
  rule: (raw: Record<string, Cell>, ctx: { names: string[] }) => RuleResult<Record<string, unknown>>;
};

const ACTIVE: Column = { header: 'Aktif', field: 'is_active', help: 'Ya atau Tidak. Kosong berarti Ya.', example: 'Ya' };

export const SHEETS: SheetSpec[] = [
  {
    table: 'product_variant',
    sheet: 'Variant',
    columns: [
      { header: 'SKU', field: 'sku', required: true, text: true, help: 'Kunci. Huruf, angka, dan tanda minus, maks. 40.', example: 'KMJ-PTH-M' },
      { header: 'Nama produk', field: 'product_name', required: true, help: 'Nama yang sama (beda huruf besar/kecil) disatukan.', example: 'Kemeja' },
      { header: 'Ukuran', field: 'size', required: true, help: 'Maks. 20 karakter.', example: 'M' },
      { header: 'Warna', field: 'color', required: true, help: 'Maks. 40 karakter.', example: 'Putih' },
      ACTIVE,
    ],
    fields: ['sku', 'product_name', 'size', 'color', 'is_active'],
    hasActive: true,
    keyOf: (v) => String(v.sku),
    keyLabel: (v) => `SKU ${v.sku}`,
    rule: (r, ctx) => variantRule(r, ctx.names),
  },
  {
    table: 'fabric_roll',
    sheet: 'Rol kain',
    columns: [
      { header: 'Kode', field: 'code', required: true, text: true, help: 'Kunci. Maks. 40 karakter.', example: 'R-001' },
      { header: 'Bahan', field: 'material', required: true, help: '', example: 'Katun combed 30s' },
      { header: 'Warna', field: 'color', required: true, help: 'Maks. 40 karakter.', example: 'Putih' },
      { header: 'Panjang/berat', field: 'length_or_weight', help: 'Angka lebih dari 0. Boleh kosong.', example: '50' },
      { header: 'Satuan', field: 'unit', help: 'm atau kg. Wajib kalau panjang/berat diisi.', example: 'm' },
      { header: 'Supplier', field: 'supplier', help: 'Boleh kosong.', example: 'Toko Kain Jaya' },
    ],
    fields: ['code', 'material', 'color', 'length_or_weight', 'unit', 'supplier'],
    hasActive: false,
    keyOf: (v) => String(v.code),
    keyLabel: (v) => `kode ${v.code}`,
    rule: (r) => rollRule(r),
  },
  {
    table: 'location',
    sheet: 'Rak',
    columns: [
      { header: 'Kode', field: 'code', required: true, text: true, help: 'Kunci. Huruf dan angka, 1-8, tanpa spasi atau tanda minus.', example: 'A1' },
      { header: 'Jenis', field: 'kind', required: true, help: 'stok atau reject.', example: 'stok' },
      { header: 'Catatan', field: 'note', help: 'Boleh kosong. Maks. 120 karakter.', example: 'Lantai 1, dekat pintu' },
      ACTIVE,
    ],
    fields: ['code', 'kind', 'note', 'is_active'],
    hasActive: true,
    keyOf: (v) => String(v.code),
    keyLabel: (v) => `kode ${v.code}`,
    rule: (r) => locationRule(r),
  },
  {
    table: 'holder',
    sheet: 'Penjahit dan tim',
    columns: [
      { header: 'Jenis', field: 'type', required: true, help: 'Kunci (bersama Nama). penjahit, finishing, produksi, atau gudang.', example: 'penjahit' },
      { header: 'Nama', field: 'name', required: true, help: 'Kunci (bersama Jenis). Ganti nama lewat form.', example: 'Ani' },
      { header: 'No. HP', field: 'phone', text: true, help: 'Boleh kosong. 08... atau 628...', example: '081110000001' },
      ACTIVE,
    ],
    fields: ['type', 'name', 'phone', 'is_active'],
    hasActive: true,
    keyOf: (v) => holderKey(String(v.type), String(v.name)),
    keyLabel: (v) => `${v.name} (${v.type})`,
    rule: (r) => holderRule(r),
  },
  {
    table: 'reason',
    sheet: 'Alasan',
    columns: [
      { header: 'Jenis', field: 'type', required: true, help: 'Kunci (bersama Kode). selisih atau reject.', example: 'reject' },
      { header: 'Kode', field: 'code', required: true, text: true, help: 'Kunci (bersama Jenis). Spasi jadi _, maks. 30.', example: 'JAHITAN' },
      { header: 'Label', field: 'label', required: true, help: 'Ringkas: alasan reject dicetak di label pcs.', example: 'Jahitan rusak' },
      ACTIVE,
    ],
    fields: ['type', 'code', 'label', 'is_active'],
    hasActive: true,
    keyOf: (v) => `${v.type}|${v.code}`,
    keyLabel: (v) => `${v.code} (${v.type})`,
    rule: (r) => reasonRule(r),
  },
];

export const HELP_SHEET = 'Petunjuk';

// ---------------------------------------------------------------------------
// Reading

/** One sheet as read from the workbook: header row matched, data rows with their Excel row number. */
export type RawSheet = { name: string; headers: string[]; rows: { row: number; cells: Cell[] }[] };

const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLocaleLowerCase('id');

export function parseActive(v: Cell): boolean | null {
  if (v === null || v === '') return true;
  if (typeof v === 'boolean') return v;
  const s = norm(String(v));
  if (['ya', 'y', 'true', '1', 'aktif'].includes(s)) return true;
  if (['tidak', 't', 'n', 'no', 'false', '0', 'nonaktif'].includes(s)) return false;
  return null;
}

// ---------------------------------------------------------------------------
// Diff

export type ExistingRow = { id: string } & Record<string, unknown>;
export type Change = { field: string; header: string; from: unknown; to: unknown };
export type RowError = { row: number; message: string };

export type SheetPreview = {
  table: Table;
  sheet: string;
  found: boolean;
  added: { row: number; label: string; values: Record<string, unknown> }[];
  changed: { row: number; label: string; id: string; changes: Change[] }[];
  same: number;
  errors: RowError[];
};

export type ImportPlan = {
  sheets: SheetPreview[];
  /** what import_master receives: new rows (id null) and changed rows (with id) per table */
  payload: Record<string, ({ id: string | null; sheet: string; row: number } & Record<string, unknown>)[]>;
  errorCount: number;
  changeCount: number;
};

/** Values the database would store, for comparing: '' and null are the same, numbers by value. */
function same(a: unknown, b: unknown) {
  const x = a === '' || a === undefined ? null : a;
  const y = b === '' || b === undefined ? null : b;
  if (typeof x === 'number' || typeof y === 'number') return x !== null && y !== null && Number(x) === Number(y);
  return x === y;
}

export function planImport(raw: RawSheet[], existing: Record<Table, ExistingRow[]>): ImportPlan {
  const byName = new Map(raw.map((s) => [norm(s.name), s]));
  const plan: ImportPlan = { sheets: [], payload: {}, errorCount: 0, changeCount: 0 };
  // product names in use, growing with new names from the file so "kemeja" twice is one product
  const names = [...new Set(existing.product_variant.map((v) => String(v.product_name)))];

  for (const spec of SHEETS) {
    const preview: SheetPreview = { table: spec.table, sheet: spec.sheet, found: false, added: [], changed: [], same: 0, errors: [] };
    plan.sheets.push(preview);
    const sheet = byName.get(norm(spec.sheet));
    if (!sheet) continue;
    preview.found = true;

    // header -> column index; missing required columns stop this sheet
    const index = new Map(sheet.headers.map((h, i) => [norm(h), i]));
    const missing = spec.columns.filter((c) => c.required && !index.has(norm(c.header))).map((c) => c.header);
    if (missing.length && sheet.rows.length) {
      preview.errors.push({ row: 1, message: `Kolom wajib tidak ada: ${missing.join(', ')}.` });
      continue;
    }
    if (sheet.rows.length > MAX_ROWS) {
      preview.errors.push({ row: 1, message: `Maksimal ${MAX_ROWS} baris per sheet. Pecah filenya.` });
      continue;
    }

    const existingByKey = new Map<string, ExistingRow[]>();
    for (const e of existing[spec.table]) {
      const k = spec.keyOf(e);
      existingByKey.set(k, [...(existingByKey.get(k) ?? []), e]);
    }
    const seen = new Map<string, number>();

    for (const { row, cells } of sheet.rows) {
      const rawRow: Record<string, Cell> = {};
      for (const c of spec.columns) {
        const i = index.get(norm(c.header));
        rawRow[c.field] = i === undefined ? null : (cells[i] ?? null);
      }
      if (Object.values(rawRow).every((v) => v === null || String(v).trim() === '')) continue;

      const fail = (message: string) => preview.errors.push({ row, message });
      const r = spec.rule(rawRow, { names });
      if (!r.ok) {
        fail(r.error);
        continue;
      }
      const values: Record<string, unknown> = { ...r.value };
      if (spec.hasActive) {
        const active = index.has(norm(ACTIVE.header)) ? parseActive(rawRow.is_active) : true;
        if (active === null) {
          fail('Kolom Aktif isi Ya atau Tidak.');
          continue;
        }
        values.is_active = active;
      }

      const key = spec.keyOf(values);
      const first = seen.get(key);
      if (first !== undefined) {
        fail(`${spec.keyLabel(values)} sudah ada di baris ${first}. Satu data hanya boleh sekali.`);
        continue;
      }
      seen.set(key, row);

      const matches = existingByKey.get(key) ?? [];
      if (matches.length > 1) {
        fail(`Ada ${matches.length} data ${spec.keyLabel(values)} di sistem. Ubah lewat form.`);
        continue;
      }
      if (spec.table === 'product_variant' && !names.includes(String(values.product_name))) names.push(String(values.product_name));

      const payloadRow = (id: string | null) => ({ id, sheet: spec.sheet, row, ...Object.fromEntries(spec.fields.map((f) => [f, values[f] ?? null])) });
      const old = matches[0];
      if (!old) {
        preview.added.push({ row, label: spec.keyLabel(values), values });
        (plan.payload[spec.table] ??= []).push(payloadRow(null));
        continue;
      }
      const changes: Change[] = spec.fields
        .filter((f) => !same(old[f], values[f]))
        .map((f) => ({
          field: f,
          header: spec.columns.find((c) => c.field === f)?.header ?? f,
          from: old[f] ?? null,
          to: values[f] ?? null,
        }));
      if (changes.length === 0) {
        preview.same++;
        continue;
      }
      preview.changed.push({ row, label: spec.keyLabel(values), id: old.id, changes });
      (plan.payload[spec.table] ??= []).push(payloadRow(old.id));
    }
  }

  for (const s of plan.sheets) {
    plan.errorCount += s.errors.length;
    plan.changeCount += s.added.length + s.changed.length;
  }
  return plan;
}

// ---------------------------------------------------------------------------
// Export

/** Cell values for one exported row, in column order. */
export function exportRow(spec: SheetSpec, row: Record<string, unknown>): Cell[] {
  return spec.columns.map((c) => {
    const v = row[c.field];
    if (c.field === 'is_active') return v === false ? 'Tidak' : 'Ya';
    if (v === null || v === undefined) return null;
    if (typeof v === 'number') return v;
    return String(v);
  });
}

/** Rows in a stable order for export: by key. */
export function sortForExport(spec: SheetSpec, rows: ExistingRow[]): ExistingRow[] {
  return [...rows].sort((a, b) => spec.keyOf(a).localeCompare(spec.keyOf(b), 'id', { numeric: true }));
}

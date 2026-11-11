/**
 * Validation and cleanup rules for master data: one source for the forms
 * (app/(desk)/master/actions.ts) and the Excel import (lib/master-import.ts), so a value the
 * form rejects is rejected by the import too, with the same sentence.
 *
 * Pure (no server imports): unit-tested with plain node (tests/unit).
 */
import { canonicalProductName } from './master.ts';
import { normalizePhone } from './phone.ts';

export type RuleResult<T> = { ok: true; value: T } | { ok: false; error: string };

const ok = <T>(value: T): RuleResult<T> => ({ ok: true, value });
const err = (error: string): RuleResult<never> => ({ ok: false, error });

/** String, trimmed, inner runs of spaces collapsed; '' for empty. */
const clean = (v: unknown) => (v === null || v === undefined ? '' : String(v).replace(/\s+/g, ' ').trim());

function tooLong(label: string, s: string, max: number) {
  return s.length > max ? `${label} maksimal ${max} karakter.` : null;
}

export const HOLDER_TYPES = ['produksi', 'penjahit', 'finishing', 'gudang'] as const;
export const REASON_TYPES = ['selisih', 'reject'] as const;
export const LOCATION_KINDS = ['stok', 'reject'] as const;
export const ROLL_UNITS = ['m', 'kg'] as const;

// ---------------------------------------------------------------------------

export type VariantInput = { sku?: unknown; product_name?: unknown; size?: unknown; color?: unknown };
export type VariantValues = { sku: string; product_name: string; size: string; color: string };

/** `existingNames`: product names already in use, so "kemeja" reuses "Kemeja". */
export function variantRule(input: VariantInput, existingNames: string[]): RuleResult<VariantValues> {
  const sku = clean(input.sku).toUpperCase();
  const rawName = clean(input.product_name);
  const size = clean(input.size);
  const color = clean(input.color);
  if (!sku || !rawName || !size || !color) return err('Isi SKU, nama produk, ukuran, dan warna.');
  const long = tooLong('SKU', sku, 40) ?? tooLong('Nama produk', rawName, 120) ?? tooLong('Ukuran', size, 20) ?? tooLong('Warna', color, 40);
  if (long) return err(long);
  if (!/^[A-Z0-9][A-Z0-9-]*$/.test(sku)) return err('SKU hanya huruf, angka, dan tanda minus.');
  return ok({ sku, product_name: canonicalProductName(rawName, existingNames), size, color });
}

// ---------------------------------------------------------------------------

export type RollInput = {
  code?: unknown;
  material?: unknown;
  color?: unknown;
  length_or_weight?: unknown;
  unit?: unknown;
  supplier?: unknown;
};
export type RollValues = {
  code: string;
  material: string;
  color: string;
  length_or_weight: number | null;
  unit: 'm' | 'kg' | null;
  supplier: string | null;
};

export function rollRule(input: RollInput): RuleResult<RollValues> {
  const code = clean(input.code).toUpperCase();
  const material = clean(input.material);
  const color = clean(input.color);
  const unit = clean(input.unit).toLowerCase();
  const amountRaw = typeof input.length_or_weight === 'number' ? String(input.length_or_weight) : clean(input.length_or_weight).replace(',', '.');
  const supplier = clean(input.supplier) || null;
  if (!code || !material || !color) return err('Isi kode rol, bahan, dan warna.');
  const long = tooLong('Kode rol', code, 40) ?? tooLong('Bahan', material, 120) ?? tooLong('Warna', color, 40) ?? tooLong('Supplier', supplier ?? '', 120);
  if (long) return err(long);
  const amount = amountRaw === '' ? null : Number(amountRaw);
  if (amount !== null && !(amount > 0 && amount < 100000)) return err('Panjang atau berat harus angka lebih dari 0.');
  if (amount !== null && !(ROLL_UNITS as readonly string[]).includes(unit)) return err('Pilih satuan m atau kg.');
  return ok({
    code,
    material,
    color,
    length_or_weight: amount === null ? null : Math.round(amount * 100) / 100,
    unit: amount === null ? null : (unit as 'm' | 'kg'),
    supplier,
  });
}

// ---------------------------------------------------------------------------

export type HolderInput = { type?: unknown; name?: unknown; phone?: unknown };
export type HolderValues = { type: (typeof HOLDER_TYPES)[number]; name: string; phone: string | null };

export function holderRule(input: HolderInput): RuleResult<HolderValues> {
  const type = clean(input.type).toLowerCase();
  const name = clean(input.name);
  const phoneRaw = clean(input.phone);
  if (!(HOLDER_TYPES as readonly string[]).includes(type)) return err('Pilih jenis.');
  if (!name) return err('Isi nama.');
  const long = tooLong('Nama', name, 120) ?? tooLong('Nomor HP', phoneRaw, 20);
  if (long) return err(long);
  const phone = phoneRaw ? normalizePhone(phoneRaw) : null;
  if (phoneRaw && !phone) return err('Nomor HP tidak valid.');
  return ok({ type: type as HolderValues['type'], name, phone });
}

/** Holders have no code: type + name (ignoring case and extra spaces) identifies one. */
export const holderKey = (type: string, name: string) => `${type}|${clean(name).toLocaleLowerCase('id')}`;

// ---------------------------------------------------------------------------

export type ReasonInput = { type?: unknown; code?: unknown; label?: unknown };
export type ReasonValues = { type: (typeof REASON_TYPES)[number]; code: string; label: string };

export function reasonRule(input: ReasonInput): RuleResult<ReasonValues> {
  const type = clean(input.type).toLowerCase();
  const code = clean(input.code).toUpperCase().replace(/\s+/g, '_');
  const label = clean(input.label);
  if (!(REASON_TYPES as readonly string[]).includes(type)) return err('Pilih jenis alasan.');
  if (!code || !label) return err('Isi kode dan label.');
  const long = tooLong('Kode', code, 30) ?? tooLong('Label', label, 120);
  if (long) return err(long);
  return ok({ type: type as ReasonValues['type'], code, label });
}

// ---------------------------------------------------------------------------

export type LocationInput = { code?: unknown; kind?: unknown; note?: unknown };
export type LocationValues = { code: string; kind: (typeof LOCATION_KINDS)[number]; note: string | null };

export function locationRule(input: LocationInput): RuleResult<LocationValues> {
  const code = clean(input.code).toUpperCase().replace(/\s+/g, '');
  const kind = clean(input.kind).toLowerCase();
  const note = clean(input.note) || null;
  if (!code) return err('Isi kode rak.');
  if (!/^[A-Z0-9]{1,8}$/.test(code)) return err('Kode rak hanya huruf dan angka, maksimal 8, tanpa spasi atau tanda minus. Contoh: A1.');
  if (!(LOCATION_KINDS as readonly string[]).includes(kind)) return err('Pilih jenis rak.');
  const long = tooLong('Catatan', note ?? '', 120);
  if (long) return err(long);
  return ok({ code, kind: kind as LocationValues['kind'], note });
}

import type { PostgrestError } from '@supabase/supabase-js';

export type FormState = { ok: boolean; error: string | null; at: number };
export const initialForm: FormState = { ok: false, error: null, at: 0 };

export const fail = (error: string): FormState => ({ ok: false, error, at: Date.now() });
export const done = (): FormState => ({ ok: true, error: null, at: Date.now() });

/** Turn a Postgres/PostgREST error into one plain Indonesian sentence. */
export function dbError(e: PostgrestError, what = 'Kode'): string {
  if (e.code === '23505') return `${what} sudah dipakai. Gunakan yang lain.`;
  if (e.code === '42501' || /row-level security/i.test(e.message)) return 'Hanya admin yang bisa mengubah master data.';
  if (e.code === '23514') return 'Isian tidak valid.';
  return 'Gagal menyimpan. Coba lagi.';
}

export function str(fd: FormData, key: string, max = 120): string {
  return String(fd.get(key) ?? '').trim().slice(0, max);
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Product names group stock on "Per produk", so spelling variants must not split a product.
 * Collapses spaces; reuses an existing name that matches ignoring case ("kemeja" -> "Kemeja");
 * a new name gets a capital first letter.
 */
export function canonicalProductName(raw: string, existing: string[]): string {
  const name = raw.replace(/\s+/g, ' ').trim();
  const key = name.toLocaleLowerCase('id');
  const match = existing.find((e) => e.replace(/\s+/g, ' ').trim().toLocaleLowerCase('id') === key);
  if (match) return match;
  return name.charAt(0).toLocaleUpperCase('id') + name.slice(1);
}

'use server';

import { createHash } from 'node:crypto';
import { refresh } from 'next/cache';
import { callRpc } from '@/lib/rpc';
import { loadExisting } from '@/lib/master-existing';
import { MAX_FILE_BYTES, planImport, type ImportPlan, type SheetPreview, type Table } from '@/lib/master-import';
import { readWorkbook } from '@/lib/master-xlsx';
import { getCurrentAppUser } from '@/lib/supabase/server';
import type { ActionResult } from '@/lib/types';

/** Rows of each list sent to the browser; counts are always complete. */
const SHOW_ROWS = 200;

/** A sheet preview with its lists cut to SHOW_ROWS; `counts` are the full numbers. */
export type PreviewSheet = SheetPreview & { counts: { added: number; changed: number; errors: number } };
export type Preview = { file: string; hash: string; sheets: PreviewSheet[]; errorCount: number; changeCount: number };
export type Applied = Record<Table, { added: number; changed: number }>;

const bad = (message: string, code = 'import_invalid'): { ok: false; message: string; code: string } => ({ ok: false, message, code });

async function plan(fd: FormData): Promise<ActionResult<{ file: string; plan: ImportPlan; hash: string }>> {
  const me = await getCurrentAppUser();
  if (!me?.roles.includes('admin')) return bad('Hanya admin yang bisa import master data.', 'forbidden_role');

  const file = fd.get('file');
  if (!(file instanceof File) || file.size === 0) return bad('Pilih file Excel (.xlsx).');
  if (!/\.xlsx$/i.test(file.name)) return bad('File harus Excel .xlsx. CSV dan .xls lama tidak didukung.');
  if (file.size > MAX_FILE_BYTES) return bad('File maksimal 2 MB. Pecah filenya.');

  let sheets;
  try {
    sheets = await readWorkbook(await file.arrayBuffer());
  } catch {
    return bad('File tidak bisa dibaca. Simpan ulang sebagai Excel Workbook (.xlsx) lalu coba lagi.');
  }
  const p = planImport(sheets, await loadExisting());
  if (!p.sheets.some((s) => s.found)) {
    return bad('Tidak ada sheet yang dikenali. Pakai template: Variant, Rol kain, Rak, Penjahit dan tim, Alasan.');
  }
  // the hash pins what the preview showed: saving recomputes it and refuses if anything moved
  const hash = createHash('sha256').update(JSON.stringify(p.payload)).digest('hex');
  return { ok: true, data: { file: file.name.slice(0, 120), plan: p, hash } };
}

export async function previewImport(fd: FormData): Promise<ActionResult<Preview>> {
  const res = await plan(fd);
  if (!res.ok) return res;
  const { file, plan: p, hash } = res.data;
  return {
    ok: true,
    data: {
      file,
      hash,
      errorCount: p.errorCount,
      changeCount: p.changeCount,
      sheets: p.sheets.map((s) => ({
        ...s,
        added: s.added.slice(0, SHOW_ROWS),
        changed: s.changed.slice(0, SHOW_ROWS),
        errors: s.errors.slice(0, SHOW_ROWS),
        counts: { added: s.added.length, changed: s.changed.length, errors: s.errors.length },
      })),
    },
  };
}

export async function applyImport(fd: FormData): Promise<ActionResult<Applied>> {
  const res = await plan(fd);
  if (!res.ok) return res;
  const { file, plan: p, hash } = res.data;
  if (p.errorCount > 0) return bad('Masih ada baris error. Perbaiki file lalu upload ulang.');
  if (p.changeCount === 0) return bad('Tidak ada perubahan untuk disimpan.', 'no_change');
  if (hash !== String(fd.get('hash') ?? '')) {
    return bad('Data di sistem atau file berubah sejak preview. Periksa ulang sebelum menyimpan.', 'import_stale');
  }
  const saved = await callRpc<Applied>('import_master', { p_payload: { file, tables: p.payload } });
  if (saved.ok) refresh();
  return saved;
}

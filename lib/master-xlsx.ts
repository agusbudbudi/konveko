/**
 * Reading and writing the master-data workbook (exceljs). No database access, so the
 * export -> import round trip is unit-tested with plain node. Server code only: exceljs is large.
 */
import ExcelJS from 'exceljs';
import {
  exportRow,
  HELP_SHEET,
  SAMPLE_PREFIX,
  SHEETS,
  sortForExport,
  type Cell,
  type ExistingRow,
  type RawSheet,
  type SheetPreview,
  type Table,
} from './master-import.ts';

/** One cell as a plain value: rich text, formulas, hyperlinks and dates flattened. */
function cellValue(v: ExcelJS.CellValue): Cell {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if ('richText' in v) return v.richText.map((t) => t.text).join('');
    // a formula: its cached result; none saved (e.g. some Google Sheets exports) = empty
    if ('formula' in v || 'sharedFormula' in v) return 'result' in v ? cellValue((v.result ?? null) as ExcelJS.CellValue) : null;
    if ('result' in v) return cellValue((v.result ?? null) as ExcelJS.CellValue);
    // a hyperlink: its text, which can itself be rich text
    if ('text' in v) return cellValue(v.text as ExcelJS.CellValue);
    if ('error' in v) return null;
    return null;
  }
  return String(v);
}

/** Every sheet except Petunjuk: row 1 = headers, data from row 2 with Excel row numbers. */
export async function readWorkbook(data: ArrayBuffer): Promise<RawSheet[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data);
  const out: RawSheet[] = [];
  wb.eachSheet((ws) => {
    if (ws.name.trim().toLowerCase() === HELP_SHEET.toLowerCase()) return;
    const headerRow = ws.getRow(1);
    const width = Math.max(headerRow.cellCount, ws.columnCount);
    const headers = Array.from({ length: width }, (_, i) => String(cellValue(headerRow.getCell(i + 1).value) ?? ''));
    const rows: RawSheet['rows'] = [];
    ws.eachRow({ includeEmpty: false }, (row, n) => {
      if (n === 1) return;
      rows.push({ row: n, cells: Array.from({ length: width }, (_, i) => cellValue(row.getCell(i + 1).value)) });
    });
    out.push({ name: ws.name, headers, rows });
  });
  return out;
}

/** A sheet's columns as the template has them; the error file uses the same, so it imports back. */
function sheetColumns(spec: (typeof SHEETS)[number]): Partial<ExcelJS.Column>[] {
  return spec.columns.map((c) => ({
    header: c.header,
    key: c.field,
    width: Math.max(12, c.header.length + 4, c.example.length + 4),
    // text format so Excel keeps leading zeros and long numbers in codes and phones
    style: c.text ? { numFmt: '@' } : {},
  }));
}

/** The export (with data) or the template (without): one sheet per master plus Petunjuk. */
export async function buildWorkbook(existing: Record<Table, ExistingRow[]> | null): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Konveko';
  wb.created = new Date();

  for (const spec of SHEETS) {
    const ws = wb.addWorksheet(spec.sheet, { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = sheetColumns(spec);
    ws.getRow(1).font = { bold: true };
    if (existing) {
      for (const row of sortForExport(spec, existing[spec.table])) ws.addRow(exportRow(spec, row));
    } else {
      // template: two example rows, grey italic; their CONTOH key makes the import skip them
      for (const sample of spec.samples) ws.addRow(sample).font = { italic: true, color: { argb: 'FF8A8A85' } };
    }
  }

  const help = wb.addWorksheet(HELP_SHEET);
  help.columns = [
    { header: 'Sheet', key: 'sheet', width: 20 },
    { header: 'Kolom', key: 'column', width: 18 },
    { header: 'Wajib', key: 'required', width: 8 },
    { header: 'Keterangan', key: 'help', width: 70 },
    { header: 'Contoh', key: 'example', width: 24 },
  ];
  help.getRow(1).font = { bold: true };
  help.addRow({ sheet: 'Cara pakai', help: 'Ubah atau tambah baris, lalu import. Baris yang dihapus dari file tidak dihapus dari sistem; isi Aktif = Tidak untuk mematikan. Kunci (SKU, kode) tidak bisa diganti lewat import. Sheet ini diabaikan saat import.' });
  help.addRow({
    sheet: 'Baris contoh',
    help: `Baris abu-abu yang kodenya (atau nama, untuk Penjahit dan tim) diawali ${SAMPLE_PREFIX} hanya contoh dan selalu dilewati saat import. Boleh dihapus atau dibiarkan.`,
  });
  for (const spec of SHEETS) {
    for (const c of spec.columns) {
      help.addRow({ sheet: spec.sheet, column: c.header, required: c.required ? 'Ya' : '', help: c.help, example: c.example });
    }
  }
  help.getColumn('help').alignment = { wrapText: true, vertical: 'top' };

  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Extra columns of the error file. The import does not know these headers, so it ignores them. */
export const ERROR_ROW_HEADER = 'Baris asal';
export const ERROR_REASON_HEADER = 'Alasan';

/**
 * Only the rows that failed, per sheet, as they were typed, with the reason in the last column.
 * The user fixes the cells and imports this same file again. A sheet-level problem (missing
 * column) becomes one row with only the reason, which the import skips as an empty row.
 */
export async function buildErrorWorkbook(sheets: SheetPreview[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Konveko';
  wb.created = new Date();
  for (const preview of sheets) {
    if (preview.errors.length === 0) continue;
    const spec = SHEETS.find((s) => s.table === preview.table)!;
    const ws = wb.addWorksheet(spec.sheet, { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = [
      ...sheetColumns(spec),
      { header: ERROR_ROW_HEADER, key: '_row', width: 11 },
      { header: ERROR_REASON_HEADER, key: '_reason', width: 60 },
    ];
    ws.getRow(1).font = { bold: true };
    ws.getCell(1, spec.columns.length + 2).font = { bold: true, color: { argb: 'FFB42318' } };
    for (const e of preview.errors) {
      const row = ws.addRow([...spec.columns.map((c) => e.values?.[c.field] ?? null), e.row, e.message]);
      const reason = row.getCell(spec.columns.length + 2);
      reason.font = { color: { argb: 'FFB42318' } };
      reason.alignment = { wrapText: true, vertical: 'top' };
    }
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

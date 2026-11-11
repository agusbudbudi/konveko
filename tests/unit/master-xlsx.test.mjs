import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWorkbook, readWorkbook } from '../../lib/master-xlsx.ts';
import { isSampleRow, planImport, SHEETS } from '../../lib/master-import.ts';

const existing = () => ({
  product_variant: [
    { id: 'v1', sku: 'KMJ-PTH-M', product_name: 'Kemeja', size: 'M', color: 'Putih', is_active: true },
    { id: 'v2', sku: '0012', product_name: 'Kaos', size: 'S', color: 'Hitam', is_active: false },
  ],
  fabric_roll: [{ id: 'r1', code: 'R-001', material: 'Katun', color: 'Putih', length_or_weight: 50.5, unit: 'm', supplier: null }],
  location: [{ id: 'l1', code: 'A1', kind: 'stok', note: null, is_active: true }],
  holder: [{ id: 'h1', type: 'penjahit', name: 'Ani', phone: '628111000001', is_active: true }],
  reason: [{ id: 'x1', type: 'reject', code: 'JAHITAN', label: 'Jahitan rusak', is_active: true }],
});

test('export then import unchanged: everything is "same", nothing to save', async () => {
  const data = existing();
  const buf = await buildWorkbook(data);
  const sheets = await readWorkbook(buf);
  assert.deepEqual(sheets.map((s) => s.name), ['Variant', 'Rol kain', 'Rak', 'Penjahit dan tim', 'Alasan']);
  // the SKU "0012" stays text, not the number 12
  assert.equal(sheets[0].rows.find((r) => r.cells.includes('0012')) !== undefined, true);
  const plan = planImport(sheets, data);
  assert.equal(plan.errorCount, 0);
  assert.equal(plan.changeCount, 0);
  assert.deepEqual(plan.sheets.map((s) => s.same), [2, 1, 1, 1, 1]);
});

test('the template has two example rows per sheet; they are valid and skipped on import', async () => {
  const sheets = await readWorkbook(await buildWorkbook(null));
  assert.ok(sheets.every((s) => s.rows.length === 2));
  assert.deepEqual(sheets[0].headers, ['SKU', 'Nama produk', 'Ukuran', 'Warna', 'Aktif']);
  const plan = planImport(sheets, existing());
  assert.equal(plan.changeCount + plan.errorCount, 0);
  assert.deepEqual(plan.sheets.map((s) => s.samples), [2, 2, 2, 2, 2]);
});

test('example rows would pass validation if they were real (so they show a correct format)', () => {
  for (const spec of SHEETS) {
    for (const sample of spec.samples) {
      const raw = Object.fromEntries(spec.columns.map((c, i) => [c.field, sample[i] ?? null]));
      const r = spec.rule(raw, { names: [] });
      assert.ok(r.ok, `${spec.sheet}: ${r.error}`);
      assert.ok(isSampleRow(spec, raw), `${spec.sheet}: example key must start with CONTOH`);
    }
  }
});

test('error file: only failed rows, reason last; fixed and re-imported it passes', async () => {
  const { buildErrorWorkbook } = await import('../../lib/master-xlsx.ts');
  const ExcelJS = (await import('exceljs')).default;
  const data = existing();
  const rack = (code, kind) => [code, kind, null, 'Ya'];
  const input = planImport(
    [{ name: 'Rak', headers: ['Kode', 'Jenis', 'Catatan', 'Aktif'], rows: [rack('D1', 'stok'), rack('A-5', 'stok'), rack('D2', 'gudang')].map((cells, i) => ({ row: i + 2, cells })) }],
    data,
  );
  assert.equal(input.errorCount, 2);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await buildErrorWorkbook(input.sheets));
  assert.deepEqual(wb.worksheets.map((w) => w.name), ['Rak']);
  const ws = wb.getWorksheet('Rak');
  const cells = (n) => Array.from({ length: 6 }, (_, i) => ws.getRow(n).getCell(i + 1).value);
  assert.deepEqual(cells(1), ['Kode', 'Jenis', 'Catatan', 'Aktif', 'Baris asal', 'Alasan']);
  assert.deepEqual(cells(2), ['A-5', 'stok', null, 'Ya', 3, input.sheets[2].errors[0].message]);
  assert.equal(ws.rowCount, 3);

  // as downloaded: the same two errors (the extra columns are ignored)
  let again = planImport(await readWorkbook(await wb.xlsx.writeBuffer()), data);
  assert.equal(again.errorCount, 2);
  // fixed in Excel: both rows pass
  ws.getCell('A2').value = 'A5';
  ws.getCell('B3').value = 'reject';
  again = planImport(await readWorkbook(await wb.xlsx.writeBuffer()), data);
  assert.equal(again.errorCount, 0);
  assert.deepEqual(again.sheets[2].added.map((a) => a.values.code), ['A5', 'D2']);
});

test('cells: formula without a cached result is empty, hyperlink text is read', async () => {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Rak');
  ws.addRow(['Kode', 'Jenis', 'Catatan', 'Aktif']);
  ws.addRow(['E1', 'stok', null, 'Ya']);
  ws.getCell('C2').value = { formula: 'CONCAT("a","b")' }; // no result saved
  ws.addRow(['E2', 'stok', null, 'Ya']);
  ws.getCell('C3').value = { text: { richText: [{ text: 'Lihat ' }, { text: 'denah' }] }, hyperlink: 'https://example.com' };
  const [rak] = await readWorkbook(await wb.xlsx.writeBuffer());
  assert.equal(rak.rows[0].cells[2], null);
  assert.equal(rak.rows[1].cells[2], 'Lihat denah');
});

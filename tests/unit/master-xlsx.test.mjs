import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWorkbook, readWorkbook } from '../../lib/master-xlsx.ts';
import { planImport } from '../../lib/master-import.ts';

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

test('the template has headers only and imports as nothing', async () => {
  const sheets = await readWorkbook(await buildWorkbook(null));
  assert.ok(sheets.every((s) => s.rows.length === 0));
  assert.deepEqual(sheets[0].headers, ['SKU', 'Nama produk', 'Ukuran', 'Warna', 'Aktif']);
  const plan = planImport(sheets, existing());
  assert.equal(plan.changeCount + plan.errorCount, 0);
});

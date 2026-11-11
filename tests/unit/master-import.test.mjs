import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exportRow, parseActive, planImport, SHEETS } from '../../lib/master-import.ts';

const empty = () => ({ product_variant: [], fabric_roll: [], location: [], holder: [], reason: [] });
const sheet = (name, headers, ...rows) => ({ name, headers, rows: rows.map((cells, i) => ({ row: i + 2, cells })) });

test('new, changed, same and error rows per sheet; payload holds only new and changed', () => {
  const existing = empty();
  existing.product_variant = [
    { id: 'v1', sku: 'KMJ-PTH-M', product_name: 'Kemeja', size: 'M', color: 'Putih', is_active: true },
    { id: 'v2', sku: 'KMJ-PTH-L', product_name: 'Kemeja', size: 'L', color: 'Putih', is_active: true },
  ];
  const plan = planImport(
    [
      // headers in another order and case; an unknown column is ignored
      sheet(
        'variant',
        ['nama produk', 'SKU', 'Ukuran', 'Warna', 'Aktif', 'Catatan internal'],
        ['kemeja', 'KMJ-PTH-M', 'M', 'Putih', 'Ya', 'x'], // same (name canonicalised to "Kemeja")
        ['Kemeja', 'KMJ-PTH-L', 'L', 'Putih', 'Tidak', null], // changed: is_active
        ['kaos', 'kos-htm-s', 'S', 'Hitam', null, null], // new, active by default
        ['Kaos', 'KOS-HTM-S', 'M', 'Hitam', 'Ya', null], // duplicate SKU in the file
        ['Kaos', 'KOS HTM', 'M', 'Hitam', 'Ya', null], // invalid SKU
        [null, null, null, null, null, null], // blank row: skipped
        ['Kaos', 'KOS-HTM-L', 'L', 'Hitam', 'mungkin', null], // bad Aktif
      ),
    ],
    existing,
  );
  const v = plan.sheets.find((s) => s.table === 'product_variant');
  assert.equal(v.found, true);
  assert.equal(v.same, 1);
  assert.deepEqual(v.changed.map((c) => [c.id, c.changes.map((x) => [x.header, x.from, x.to])]), [['v2', [['Aktif', true, false]]]]);
  assert.deepEqual(v.added.map((a) => [a.label, a.values.product_name, a.values.is_active]), [['SKU KOS-HTM-S', 'Kaos', true]]);
  assert.deepEqual(v.errors, [
    { row: 5, message: 'SKU KOS-HTM-S sudah ada di baris 4. Satu data hanya boleh sekali.' },
    { row: 6, message: 'SKU hanya huruf, angka, dan tanda minus.' },
    { row: 8, message: 'Kolom Aktif isi Ya atau Tidak.' },
  ]);
  assert.equal(plan.errorCount, 3);
  assert.equal(plan.changeCount, 2);
  assert.deepEqual(plan.payload.product_variant, [
    { id: 'v2', sheet: 'Variant', row: 3, sku: 'KMJ-PTH-L', product_name: 'Kemeja', size: 'L', color: 'Putih', is_active: false },
    { id: null, sheet: 'Variant', row: 4, sku: 'KOS-HTM-S', product_name: 'Kaos', size: 'S', color: 'Hitam', is_active: true },
  ]);
  // sheets not in the file are reported as not found, not as errors
  assert.equal(plan.sheets.find((s) => s.table === 'location').found, false);
});

test('missing required column stops the sheet', () => {
  const plan = planImport([sheet('Rak', ['Kode', 'Catatan'], ['A1', 'x'])], empty());
  assert.deepEqual(plan.sheets.find((s) => s.table === 'location').errors, [{ row: 1, message: 'Kolom wajib tidak ada: Jenis.' }]);
});

test('numbers compare by value, empty equals null, phone from a number cell', () => {
  const existing = empty();
  existing.fabric_roll = [{ id: 'r1', code: 'R-001', material: 'Katun', color: 'Putih', length_or_weight: 50, unit: 'm', supplier: null }];
  existing.holder = [
    { id: 'h1', type: 'penjahit', name: 'Ani', phone: '628111000001', is_active: true },
    { id: 'h2', type: 'penjahit', name: 'Budi', phone: null, is_active: true },
    { id: 'h3', type: 'penjahit', name: 'budi', phone: null, is_active: true },
  ];
  const plan = planImport(
    [
      sheet('Rol kain', ['Kode', 'Bahan', 'Warna', 'Panjang/berat', 'Satuan', 'Supplier'], ['R-001', 'Katun', 'Putih', 50.0, 'm', '']),
      sheet(
        'Penjahit dan tim',
        ['Jenis', 'Nama', 'No. HP', 'Aktif'],
        ['penjahit', 'ani', 8111000001, 'Ya'], // Excel dropped the leading 0; still the same number
        ['penjahit', 'Budi', null, 'Ya'], // two holders match: ambiguous
      ),
    ],
    existing,
  );
  assert.equal(plan.sheets.find((s) => s.table === 'fabric_roll').same, 1);
  const h = plan.sheets.find((s) => s.table === 'holder');
  // name casing from the file is a change; the phone is not
  assert.deepEqual(h.changed.map((c) => c.changes.map((x) => x.field)), [['name']]);
  assert.deepEqual(h.errors, [{ row: 3, message: 'Ada 2 data Budi (penjahit) di sistem. Ubah lewat form.' }]);
});

test('parseActive and exportRow', () => {
  assert.equal(parseActive(null), true);
  assert.equal(parseActive('TIDAK'), false);
  assert.equal(parseActive(false), false);
  assert.equal(parseActive(1), true);
  assert.equal(parseActive('?'), null);
  const variant = SHEETS.find((s) => s.table === 'product_variant');
  assert.deepEqual(exportRow(variant, { sku: 'A', product_name: 'B', size: 'M', color: 'C', is_active: false }), ['A', 'B', 'M', 'C', 'Tidak']);
});

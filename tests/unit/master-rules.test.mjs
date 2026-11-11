import { test } from 'node:test';
import assert from 'node:assert/strict';
import { holderKey, holderRule, locationRule, reasonRule, rollRule, variantRule } from '../../lib/master-rules.ts';

const value = (r) => (assert.ok(r.ok, r.error), r.value);
const error = (r) => (assert.ok(!r.ok, 'expected an error'), r.error);

test('variant: cleans, upper-cases SKU, reuses an existing product name', () => {
  assert.deepEqual(value(variantRule({ sku: ' kmj-pth-m ', product_name: 'kemeja  ', size: 'M', color: 'Putih' }, ['Kemeja'])), {
    sku: 'KMJ-PTH-M',
    product_name: 'Kemeja',
    size: 'M',
    color: 'Putih',
  });
  assert.equal(value(variantRule({ sku: 'X1', product_name: 'kaos polo', size: 'L', color: 'Hitam' }, [])).product_name, 'Kaos polo');
  assert.equal(error(variantRule({ sku: 'KMJ PTH', product_name: 'a', size: 'M', color: 'b' }, [])), 'SKU hanya huruf, angka, dan tanda minus.');
  assert.equal(error(variantRule({ sku: 'X', product_name: '', size: 'M', color: 'b' }, [])), 'Isi SKU, nama produk, ukuran, dan warna.');
  assert.equal(error(variantRule({ sku: 'X'.repeat(41), product_name: 'a', size: 'M', color: 'b' }, [])), 'SKU maksimal 40 karakter.');
});

test('roll: amount with comma, unit required with amount, numbers from Excel', () => {
  assert.deepEqual(value(rollRule({ code: 'r-001', material: 'Katun', color: 'Putih', length_or_weight: '50,5', unit: 'M', supplier: '' })), {
    code: 'R-001',
    material: 'Katun',
    color: 'Putih',
    length_or_weight: 50.5,
    unit: 'm',
    supplier: null,
  });
  assert.equal(value(rollRule({ code: 'R2', material: 'a', color: 'b', length_or_weight: 12.345, unit: 'kg' })).length_or_weight, 12.35);
  assert.deepEqual(value(rollRule({ code: 'R3', material: 'a', color: 'b', length_or_weight: '', unit: 'kg' })).unit, null);
  assert.equal(error(rollRule({ code: 'R4', material: 'a', color: 'b', length_or_weight: '10', unit: '' })), 'Pilih satuan m atau kg.');
  assert.equal(error(rollRule({ code: 'R5', material: 'a', color: 'b', length_or_weight: '-1', unit: 'm' })), 'Panjang atau berat harus angka lebih dari 0.');
});

test('holder: type, phone normalised, key ignores case and spaces', () => {
  assert.deepEqual(value(holderRule({ type: 'Penjahit', name: ' Ani ', phone: '0811-1000-001' })), { type: 'penjahit', name: 'Ani', phone: '628111000001' });
  assert.equal(error(holderRule({ type: 'tukang', name: 'Ani' })), 'Pilih jenis.');
  assert.equal(error(holderRule({ type: 'penjahit', name: 'Ani', phone: '123' })), 'Nomor HP tidak valid.');
  assert.equal(holderKey('penjahit', '  ANI  '), holderKey('penjahit', 'ani'));
});

test('reason and location', () => {
  assert.deepEqual(value(reasonRule({ type: 'reject', code: 'jahitan rusak', label: 'Jahitan rusak' })), { type: 'reject', code: 'JAHITAN_RUSAK', label: 'Jahitan rusak' });
  assert.equal(error(reasonRule({ type: 'lain', code: 'A', label: 'b' })), 'Pilih jenis alasan.');
  assert.deepEqual(value(locationRule({ code: ' a 1 ', kind: 'Stok', note: '' })), { code: 'A1', kind: 'stok', note: null });
  assert.match(error(locationRule({ code: 'A-1', kind: 'stok' })), /tanpa spasi atau tanda minus/);
  assert.equal(error(locationRule({ code: 'A1', kind: 'gudang' })), 'Pilih jenis rak.');
});

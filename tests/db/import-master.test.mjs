// Excel import of master data: the database side (import_master).
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, seedFixture, rpc, one, all, actAs } from './harness.mjs';

let db;
let ids;

const run = (who, tables, file = 'master.xlsx') => rpc(db, who, 'import_master', { p_payload: JSON.stringify({ file, tables }) });

async function rejects(promise, detail) {
  await assert.rejects(promise, (e) => e.detail === detail || assert.fail(`expected ${detail}, got ${e.detail}: ${e.message}`));
}

beforeEach(async () => {
  db = await createDb();
  ids = await seedFixture(db);
});

describe('import_master', () => {
  it('inserts new rows and updates changed ones, with audit log', async () => {
    const res = await run(ids.admin, {
      product_variant: [
        { id: null, sheet: 'Variant', row: 2, sku: 'KOS-HTM-S', product_name: 'Kaos', size: 'S', color: 'Hitam', is_active: true },
        { id: ids.kemejaM, sheet: 'Variant', row: 3, sku: 'KMJ-PTH-M', product_name: 'Kemeja', size: 'M', color: 'Putih Tulang', is_active: false },
      ],
      location: [{ id: null, sheet: 'Rak', row: 2, code: 'B7', kind: 'stok', note: null, is_active: true }],
      fabric_roll: [{ id: ids.roll, sheet: 'Rol kain', row: 2, code: 'R-001', material: 'Katun', color: 'Putih', length_or_weight: 50.5, unit: 'm', supplier: 'Toko Kain' }],
    });
    assert.deepEqual(res, {
      product_variant: { added: 1, changed: 1 },
      location: { added: 1, changed: 0 },
      fabric_roll: { added: 0, changed: 1 },
    });

    await actAs(db, null);
    const m = await one(db, `select color, is_active from public.product_variant where id = $1`, [ids.kemejaM]);
    assert.deepEqual(m, { color: 'Putih Tulang', is_active: false });
    const rack = await one(db, `select kind, length(qr_token) as qr from public.location where code = 'B7'`);
    assert.deepEqual(rack, { kind: 'stok', qr: 32 });

    const log = await all(db, `select entity, field, old_value, new_value, reason from public.audit_log order by entity, field`);
    assert.deepEqual(
      log.map((l) => [l.entity, l.field, l.old_value, l.new_value]),
      [
        ['fabric_roll', 'length_or_weight', '50.00', '50.50'],
        ['location', 'created', null, 'B7'],
        ['product_variant', 'color', 'Putih', 'Putih Tulang'],
        ['product_variant', 'created', null, 'KOS-HTM-S'],
        ['product_variant', 'is_active', 'true', 'false'],
      ],
    );
    assert.ok(log.every((l) => l.reason === 'Import Excel master.xlsx'));
  });

  it('an unchanged row (same value, other numeric scale) is not counted or logged', async () => {
    const res = await run(ids.admin, {
      fabric_roll: [{ id: ids.roll, sheet: 'Rol kain', row: 2, code: 'R-001', material: 'Katun', color: 'Putih', length_or_weight: 50.0, unit: 'm', supplier: 'Toko Kain' }],
    });
    assert.deepEqual(res, { fabric_roll: { added: 0, changed: 0 } });
    await actAs(db, null);
    assert.equal((await one(db, `select count(*)::int as n from public.audit_log`)).n, 0);
  });

  it('all or nothing: a duplicate key rolls back the rows before it', async () => {
    await rejects(
      run(ids.admin, {
        location: [
          { id: null, sheet: 'Rak', row: 2, code: 'C1', kind: 'stok', note: null, is_active: true },
          { id: null, sheet: 'Rak', row: 3, code: 'A1', kind: 'stok', note: null, is_active: true }, // A1 exists
        ],
      }),
      'import_duplicate',
    );
    await actAs(db, null);
    assert.equal((await one(db, `select count(*)::int as n from public.location where code = 'C1'`)).n, 0);
    assert.equal((await one(db, `select count(*)::int as n from public.audit_log`)).n, 0);
  });

  it('only admin; only whitelisted tables; stale ids are refused', async () => {
    await rejects(run(ids.produksi, { reason: [] }), 'forbidden_role');
    await rejects(run(ids.admin, { app_user: [] }), 'import_table');
    await rejects(
      run(ids.admin, { reason: [{ id: '00000000-0000-0000-0000-000000000000', sheet: 'Alasan', row: 2, type: 'reject', code: 'X', label: 'x', is_active: true }] }),
      'import_stale',
    );
  });
});

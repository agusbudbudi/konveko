// End to end without the browser: export the database to a workbook, edit it like an admin
// would in Excel, read it back, plan, and apply with import_master.
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { createDb, seedFixture, rpc, one, all, actAs } from './harness.mjs';
import { buildWorkbook, readWorkbook } from '../../lib/master-xlsx.ts';
import { planImport, SHEETS } from '../../lib/master-import.ts';

let db;
let ids;

const SELECT = {
  product_variant: 'id, sku, product_name, size, color, is_active',
  fabric_roll: 'id, code, material, color, length_or_weight::float8 as length_or_weight, unit, supplier',
  location: 'id, code, kind, note, is_active',
  holder: 'id, type, name, phone, is_active',
  reason: 'id, type, code, label, is_active',
};

async function existing() {
  await actAs(db, null);
  const out = {};
  for (const s of SHEETS) out[s.table] = await all(db, `select ${SELECT[s.table]} from public.${s.table}`);
  return out;
}

beforeEach(async () => {
  db = await createDb();
  ids = await seedFixture(db);
});

describe('export -> edit -> import', () => {
  it('applies exactly the edits made in Excel', async () => {
    const buf = await buildWorkbook(await existing());

    // the admin edits the file
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const variant = wb.getWorksheet('Variant');
    variant.eachRow((row, n) => {
      if (n > 1 && row.getCell(1).value === 'KMJ-PTH-L') row.getCell(5).value = 'Tidak';
    });
    variant.addRow(['KOS-HTM-S', 'kaos', 'S', 'Hitam', null]);
    wb.getWorksheet('Rak').addRow(['B7', 'reject', 'Rak BS', 'Ya']);
    const edited = await wb.xlsx.writeBuffer();

    const plan = planImport(await readWorkbook(edited), await existing());
    assert.equal(plan.errorCount, 0);
    assert.equal(plan.changeCount, 3);

    const res = await rpc(db, ids.admin, 'import_master', { p_payload: JSON.stringify({ file: 'edit.xlsx', tables: plan.payload }) });
    assert.deepEqual(res, { product_variant: { added: 1, changed: 1 }, location: { added: 1, changed: 0 } });

    await actAs(db, null);
    assert.equal((await one(db, `select is_active from public.product_variant where sku = 'KMJ-PTH-L'`)).is_active, false);
    assert.deepEqual(await one(db, `select product_name, is_active from public.product_variant where sku = 'KOS-HTM-S'`), { product_name: 'Kaos', is_active: true });
    assert.deepEqual(await one(db, `select kind, note from public.location where code = 'B7'`), { kind: 'reject', note: 'Rak BS' });

    // exporting again and importing it unchanged is a no-op
    const again = planImport(await readWorkbook(await buildWorkbook(await existing())), await existing());
    assert.equal(again.changeCount + again.errorCount, 0);
  });
});

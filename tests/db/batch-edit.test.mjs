// FR-10: edit a batch while it is draft.
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, seedFixture, rpc, one, all, actAs, checkInvariants } from './harness.mjs';

let db;
let ids;

async function assertInvariants() {
  const problems = await checkInvariants(db);
  assert.deepEqual(problems, [], problems.join('\n'));
}

async function newBatch(items) {
  return rpc(db, ids.produksi, 'create_batch', {
    p_fabric_roll_id: ids.roll,
    p_items: JSON.stringify(items.map(([variant, qty]) => ({ variant_id: ids[variant], qty }))),
  });
}

const edit = (code, qty, variant = null, who = ids.produksi) =>
  rpc(db, who, 'edit_bundle', { p_code: code, p_qty: qty, p_variant_id: variant, p_note: null });

async function rejects(promise, detail) {
  await assert.rejects(promise, (e) => e.detail === detail || assert.fail(`expected ${detail}, got ${e.detail}: ${e.message}`));
}

async function bundle(code) {
  await actAs(db, null);
  return one(db, `select b.target_qty, b.current_qty, b.variant_id, r.wip_menunggu, r.ref_qty, r.status
                  from public.bundle b join public.bundle_reconciliation r on r.bundle_id = b.id where b.code = $1`, [code]);
}

beforeEach(async () => {
  db = await createDb();
  ids = await seedFixture(db);
});

describe('edit_bundle', () => {
  it('changes the qty of a draft bundle, keeps reconciliation and history', async () => {
    const batch = await newBatch([['kemejaM', 20]]);
    const code = batch.bundles[0].code;

    const res = await edit(code, 18);
    assert.equal(res.qty, 18);
    assert.match(res.message, /Cetak ulang/);

    const b = await bundle(code);
    assert.deepEqual([b.target_qty, b.current_qty, b.wip_menunggu, b.ref_qty, b.status], [18, 18, 18, 18, 'siap_jahit']);

    // history: the cut is corrected, the effective cut qty follows
    await actAs(db, null);
    const eff = await one(db, `select em.qty_sent from public.effective_movement em join public.bundle b on b.id = em.bundle_id
                               where b.code = $1 and em.type = 'cut'`, [code]);
    assert.equal(eff.qty_sent, 18);
    const log = await all(db, `select field, old_value, new_value from public.audit_log where entity = 'bundle'`);
    assert.deepEqual(log, [{ field: 'target_qty', old_value: '20', new_value: '18' }]);

    // still draft, and the receive scan uses the new qty
    assert.equal((await one(db, `select status from public.production_batch where id = $1`, [batch.batch_id])).status, 'draft');
    const recv = await rpc(db, ids.ani, 'scan_receive', { p_code: code, p_qty_received: 18 });
    assert.match(recv.message, /18 pcs/);
    await assertInvariants();
  });

  it('changes the variant, but not to one already in the batch', async () => {
    const batch = await newBatch([['kemejaM', 20], ['kemejaL', 10]]);
    const [m, l] = batch.bundles.map((x) => x.code);

    await rejects(edit(l, null, ids.kemejaM), 'duplicate_variant');
    await edit(l, null, ids.kemejaXL);
    assert.equal((await bundle(l)).variant_id, ids.kemejaXL);
    // the old variant is free again
    await edit(m, 12, ids.kemejaL);
    const b = await bundle(m);
    assert.deepEqual([b.variant_id, b.target_qty], [ids.kemejaL, 12]);
    await assertInvariants();
  });

  it('refuses once any bundle of the batch was received', async () => {
    const batch = await newBatch([['kemejaM', 20], ['kemejaL', 10]]);
    const [m, l] = batch.bundles.map((x) => x.code);
    await rpc(db, ids.ani, 'scan_receive', { p_code: m, p_qty_received: 20 });
    await rejects(edit(l, 9), 'batch_not_draft');
    await rejects(
      rpc(db, ids.produksi, 'add_bundle_to_batch', { p_batch_id: batch.batch_id, p_variant_id: ids.kemejaXL, p_qty: 5 }),
      'batch_not_draft',
    );
  });

  it('refuses split bundles, no-ops, bad qty and other roles', async () => {
    const batch = await newBatch([['kemejaM', 20]]);
    const code = batch.bundles[0].code;
    await rejects(edit(code, 20), 'no_change');
    await rejects(edit(code, 0), 'qty_invalid');
    await rejects(edit(code, 15, null, ids.ani), 'forbidden_role');

    const split = await rpc(db, ids.produksi, 'split_bundle', { p_code: code, p_qtys: [10, 10] });
    await rejects(edit(code, 18), 'bundle_split');
    await rejects(edit(split.children[0].code, 9), 'bundle_split');
    await assertInvariants();
  });
});

describe('add_bundle_to_batch', () => {
  it('adds a forgotten variant to a draft batch', async () => {
    const batch = await newBatch([['kemejaM', 20]]);
    const res = await rpc(db, ids.produksi, 'add_bundle_to_batch', { p_batch_id: batch.batch_id, p_variant_id: ids.kemejaL, p_qty: 7 });
    assert.match(res.code, /^B-\d{5}$/);

    const b = await bundle(res.code);
    assert.deepEqual([b.target_qty, b.status, b.wip_menunggu], [7, 'siap_jahit', 7]);
    await actAs(db, null);
    const total = await one(db, `select target from public.batch_reconciliation where batch_id = $1`, [batch.batch_id]);
    assert.equal(total.target, 27);

    await rejects(
      rpc(db, ids.produksi, 'add_bundle_to_batch', { p_batch_id: batch.batch_id, p_variant_id: ids.kemejaM, p_qty: 3 }),
      'duplicate_variant',
    );
    await assertInvariants();
  });
});

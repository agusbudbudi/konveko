import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, seedFixture, rpc, one } from './harness.mjs';

let db;
let ids;
let today;

async function rejects(promise, detail) {
  await assert.rejects(promise, (e) => e.detail === detail);
}

const report = (from = today, to = today, user = ids.spv) =>
  rpc(db, user, 'production_report', { p_from: from, p_to: to });

beforeEach(async () => {
  db = await createDb();
  ids = await seedFixture(db);
  today = (await one(db, `select to_char((now() at time zone 'Asia/Jakarta')::date, 'YYYY-MM-DD') as d`)).d;

  // PRD example: 20 cut, sewing receives 19 (selisih 1), sews 18 + 1 reject,
  // finishing receives 18, QC 17 + 1 reject.
  const batch = await rpc(db, ids.produksi, 'create_batch', {
    p_fabric_roll_id: ids.roll,
    p_items: JSON.stringify([{ variant_id: ids.kemejaM, qty: 20 }, { variant_id: ids.kemejaL, qty: 5 }]),
  });
  const code = batch.bundles[0].code;
  await rpc(db, ids.ani, 'scan_receive', { p_code: code, p_qty_received: 19, p_reason_id: ids.rSelisih });
  await rpc(db, ids.ani, 'scan_finish', { p_code: code, p_qty_good: 18, p_qty_reject: 1, p_reason_id: ids.rReject });
  await rpc(db, ids.finishing, 'scan_receive', { p_code: code, p_qty_received: 18 });
  await rpc(db, ids.finishing, 'scan_finish', { p_code: code, p_qty_good: 17, p_qty_reject: 1, p_reason_id: ids.rReject });
});

describe('production_report', () => {
  it('sums the period from the effective scans', async () => {
    const r = await report();
    assert.equal(r.days, 1);
    const t = r.totals;
    assert.deepEqual(
      [t.cut, t.batches, t.sew_in, t.sew_good, t.sew_reject, t.qc_in, t.ready, t.qc_reject, t.selisih, t.selisih_events, t.flags_open, t.shelved],
      [25, 1, 19, 18, 1, 18, 17, 1, 1, 1, 1, 0],
    );
    assert.equal(r.lead_time.bundles, 1);
    assert.equal(r.daily.length, 1);
    assert.deepEqual(r.daily[0], { day: today, cut: 25, ready: 17, reject: 2, selisih: 1 });

    assert.equal(r.tailors.length, 1);
    assert.deepEqual([r.tailors[0].name, r.tailors[0].received, r.tailors[0].good, r.tailors[0].reject], ['Ani', 19, 18, 1]);

    const m = r.variants.find((v) => v.sku === 'KMJ-PTH-M');
    assert.deepEqual([m.cut, m.ready, m.reject], [20, 17, 2]);
    assert.deepEqual(r.reject_reasons.map((x) => [x.stage, x.qty]).sort(), [['jahit', 1], ['qc', 1]]);
    assert.deepEqual(r.selisih_reasons.map((x) => [x.step, x.qty]), [['produksi ke jahit', 1]]);
  });

  it('applies supervisor corrections', async () => {
    const ff = await one(db, `select id from public.movement where type = 'finish_finishing'`);
    await rpc(db, ids.spv, 'correct_movement', {
      p_movement_id: ff.id, p_note: 'Hitung ulang', p_qty_good: 15, p_qty_reject: 3, p_reason_id: ids.rReject,
    });
    const r = await report();
    assert.deepEqual([r.totals.ready, r.totals.qc_reject], [15, 3]);
  });

  it('a range without scans is all zero, with one row per day', async () => {
    const r = await report('2020-01-01', '2020-01-07');
    assert.equal(r.days, 7);
    assert.equal(r.daily.length, 7);
    assert.equal(r.totals.cut, 0);
    assert.equal(r.lead_time.bundles, 0);
    assert.deepEqual([r.tailors, r.variants, r.reject_reasons], [[], [], []]);
  });

  it('checks role and range', async () => {
    await rejects(report(today, today, ids.ani), 'forbidden_role');
    await rejects(report(today, '2000-01-01'), 'range_invalid');
    await rejects(report('2024-01-01', '2025-06-01'), 'range_too_long');
    assert.ok(await report(today, today, ids.produksi));
  });
});

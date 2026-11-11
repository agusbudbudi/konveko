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

async function recon(code) {
  await actAs(db, null);
  return one(db, `select * from public.bundle_reconciliation where code = $1`, [code]);
}

async function batchStatus(batchId) {
  return (await one(db, `select status from public.production_batch where id = $1`, [batchId])).status;
}

async function rejects(promise, detailOrRegex) {
  await assert.rejects(promise, (e) => {
    if (detailOrRegex instanceof RegExp) return detailOrRegex.test(e.message);
    return e.detail === detailOrRegex;
  });
}

beforeEach(async () => {
  db = await createDb();
  ids = await seedFixture(db);
});

describe('PRD example: Kemeja M 20', () => {
  it('reconciles 17 + 2 + 0 + 1 = 20 and closes the batch', async () => {
    const batch = await newBatch([['kemejaM', 20]]);
    const code = batch.bundles[0].code;
    assert.match(code, /^B-\d{5}$/);
    assert.equal(await batchStatus(batch.batch_id), 'draft');

    let r = await recon(code);
    assert.equal(r.status, 'siap_jahit');
    assert.equal(r.wip_menunggu, 20);
    await assertInvariants();

    // Jahit menerima 19 (selisih 1)
    const recv = await rpc(db, ids.ani, 'scan_receive', { p_code: code, p_qty_received: 19, p_reason_id: ids.rSelisih });
    assert.equal(recv.message, `Bundle ${code} diterima. 19 dari 20 pcs, selisih 1.`);
    assert.equal(await batchStatus(batch.batch_id), 'berjalan');
    const flag = await one(db, `select qty, from_step, to_step, status from public.discrepancy`);
    assert.deepEqual(flag, { qty: 1, from_step: 'produksi', to_step: 'jahit', status: 'terbuka' });
    r = await recon(code);
    assert.equal(r.wip_dikerjakan, 19);
    assert.equal(r.selisih, 1);
    await assertInvariants();

    // Jahit selesai 18, reject 1
    await rpc(db, ids.ani, 'scan_finish', { p_code: code, p_qty_good: 18, p_qty_reject: 1, p_reason_id: ids.rReject });
    r = await recon(code);
    // mid-process example from the PRD: 0 + 1 + 18 + 1 = 20
    assert.deepEqual(
      [r.status, r.ready, r.reject, r.wip_menunggu, r.wip_dikerjakan, r.selisih],
      ['siap_finishing', 0, 1, 18, 0, 1],
    );
    await assertInvariants();

    // Finishing menerima 18, lolos QC 17 reject 1
    await rpc(db, ids.finishing, 'scan_receive', { p_code: code, p_qty_received: 18 });
    await rpc(db, ids.finishing, 'scan_finish', { p_code: code, p_qty_good: 17, p_qty_reject: 1, p_reason_id: ids.rReject });

    r = await recon(code);
    assert.deepEqual(
      [r.status, r.ready, r.reject, r.wip_menunggu + r.wip_dikerjakan, r.selisih],
      ['ready_stock', 17, 2, 0, 1],
    );
    const stock = await one(db, `select qty from public.stock_ready where sku = 'KMJ-PTH-M'`);
    assert.equal(stock.qty, 17);
    assert.equal(await batchStatus(batch.batch_id), 'selesai');

    const br = await one(db, `select * from public.batch_reconciliation where batch_id = $1`, [batch.batch_id]);
    assert.deepEqual([br.target, br.ready, br.reject, br.wip, br.selisih, br.open_discrepancies], [20, 17, 2, 0, 1, 1]);
    await assertInvariants();
  });

  it('accepts manual code input, case-insensitive, and the QR token', async () => {
    const batch = await newBatch([['kemejaM', 5]]);
    const { code } = batch.bundles[0];
    const { qr_token } = await one(db, `select qr_token from public.bundle where code = $1`, [code]);
    assert.match(qr_token, /^[0-9a-f]{32}$/);
    const byToken = await rpc(db, ids.ani, 'scan_lookup', { p_code: qr_token });
    const byCode = await rpc(db, ids.ani, 'scan_lookup', { p_code: ` ${code.toLowerCase()} ` });
    assert.equal(byToken.code, code);
    assert.equal(byCode.code, code);
    assert.equal(byCode.next_action, 'terima');
    assert.equal(byCode.allowed, true);
    assert.equal(byCode.ref_qty, 5);
  });
});

describe('scan validation (FR-13, FR-14, FR-17)', () => {
  let code;
  beforeEach(async () => {
    code = (await newBatch([['kemejaM', 20]])).bundles[0].code;
  });

  it('blocks receiving more than sent', async () => {
    await rejects(rpc(db, ids.ani, 'scan_receive', { p_code: code, p_qty_received: 21 }), 'qty_over');
  });

  it('requires a reason when receiving less', async () => {
    await rejects(rpc(db, ids.ani, 'scan_receive', { p_code: code, p_qty_received: 19 }), 'reason_required');
  });

  it('rejects a reject-type reason for selisih', async () => {
    await rejects(rpc(db, ids.ani, 'scan_receive', { p_code: code, p_qty_received: 19, p_reason_id: ids.rReject }), 'reason_invalid');
  });

  it('rejects the wrong role', async () => {
    await rejects(rpc(db, ids.finishing, 'scan_receive', { p_code: code, p_qty_received: 20 }), 'forbidden_role');
    await rejects(rpc(db, ids.ani, 'create_batch', { p_fabric_roll_id: ids.roll, p_items: '[]' }), 'forbidden_role');
  });

  it('rejects scans out of order with a plain sentence', async () => {
    await rejects(rpc(db, ids.ani, 'scan_finish', { p_code: code, p_qty_good: 20, p_qty_reject: 0 }), /belum di-scan terima/);
    await rpc(db, ids.ani, 'scan_receive', { p_code: code, p_qty_received: 20 });
    await rejects(rpc(db, ids.ani, 'scan_receive', { p_code: code, p_qty_received: 20 }), /Gunakan scan selesai/);
  });

  it('only the holder can finish', async () => {
    await rpc(db, ids.ani, 'scan_receive', { p_code: code, p_qty_received: 20 });
    await rejects(rpc(db, ids.budi, 'scan_finish', { p_code: code, p_qty_good: 20, p_qty_reject: 0 }), 'wrong_holder');
    const look = await rpc(db, ids.budi, 'scan_lookup', { p_code: code });
    assert.equal(look.allowed, false);
    assert.match(look.message, /dipegang Ani/);
  });

  it('requires jadi + reject = diterima', async () => {
    await rpc(db, ids.ani, 'scan_receive', { p_code: code, p_qty_received: 20 });
    await rejects(rpc(db, ids.ani, 'scan_finish', { p_code: code, p_qty_good: 18, p_qty_reject: 1, p_reason_id: ids.rReject }), 'qty_mismatch');
    await rejects(rpc(db, ids.ani, 'scan_finish', { p_code: code, p_qty_good: 19, p_qty_reject: 1 }), 'reason_required');
  });

  it('rejects a stale version (second device)', async () => {
    const look = await rpc(db, ids.ani, 'scan_lookup', { p_code: code });
    await rpc(db, ids.ani, 'scan_receive', { p_code: code, p_qty_received: 20, p_expected_version: look.version });
    await rejects(
      rpc(db, ids.finishing, 'scan_receive', { p_code: code, p_qty_received: 20, p_expected_version: look.version }),
      'version_conflict',
    );
  });

  it('re-scan of a finished bundle is info only (FR-18)', async () => {
    await rpc(db, ids.ani, 'scan_receive', { p_code: code, p_qty_received: 20 });
    await rpc(db, ids.ani, 'scan_finish', { p_code: code, p_qty_good: 20, p_qty_reject: 0 });
    await rpc(db, ids.finishing, 'scan_receive', { p_code: code, p_qty_received: 20 });
    await rpc(db, ids.finishing, 'scan_finish', { p_code: code, p_qty_good: 20, p_qty_reject: 0 });
    const before = (await one(db, `select count(*)::int as n from public.movement`)).n;
    const look = await rpc(db, ids.finishing, 'scan_lookup', { p_code: code });
    assert.equal(look.allowed, false);
    assert.equal(look.next_action, null);
    assert.equal(look.message, `Bundle ${code} sudah selesai finishing (Ready stock), belum masuk rak. Langkah berikutnya: gudang cetak label pcs lalu simpan ke rak.`);
    await rejects(rpc(db, ids.finishing, 'scan_receive', { p_code: code, p_qty_received: 20 }), 'wrong_status');
    assert.equal((await one(db, `select count(*)::int as n from public.movement`)).n, before);

    // Labels printed, 5 pcs shelved: 15 still waiting for the rack.
    await db.query(`update public.piece set printed_at = now() where bundle_id = (select id from public.bundle where code = $1)`, [code]);
    await db.query(`update public.piece set location_id = $2
                    where id in (select id from public.piece where bundle_id = (select id from public.bundle where code = $1) limit 5)`, [code, ids.rakA1]);
    let msg = (await rpc(db, ids.finishing, 'scan_lookup', { p_code: code })).message;
    assert.equal(msg, `Bundle ${code} sudah selesai finishing (Ready stock), 15 pcs belum masuk rak. Langkah berikutnya: gudang simpan ke rak.`);

    await db.query(`update public.piece set location_id = $2 where bundle_id = (select id from public.bundle where code = $1)`, [code, ids.rakA1]);
    msg = (await rpc(db, ids.finishing, 'scan_lookup', { p_code: code })).message;
    assert.equal(msg, `Bundle ${code} sudah selesai dan semua pcs sudah masuk gudang.`);
  });

  it('rejects unknown codes', async () => {
    await rejects(rpc(db, ids.ani, 'scan_lookup', { p_code: 'B-99999' }), 'not_found');
  });
});

describe('split (FR-07)', () => {
  it('splits 20 into 10 + 10, parent becomes dipecah, batch target unchanged', async () => {
    const batch = await newBatch([['kemejaM', 20], ['kemejaL', 30]]);
    const parent = batch.bundles[0].code;
    await rejects(rpc(db, ids.produksi, 'split_bundle', { p_code: parent, p_qtys: [10, 9] }), 'qty_mismatch');
    const res = await rpc(db, ids.produksi, 'split_bundle', { p_code: parent, p_qtys: [10, 10] });
    assert.equal(res.children.length, 2);

    const look = await rpc(db, ids.ani, 'scan_lookup', { p_code: parent });
    assert.equal(look.status, 'dipecah');
    assert.match(look.message, /dipecah menjadi B-\d{5}, B-\d{5}/);
    await rejects(rpc(db, ids.ani, 'scan_receive', { p_code: parent, p_qty_received: 20 }), 'wrong_status');

    // children go to different tailors
    await rpc(db, ids.ani, 'scan_receive', { p_code: res.children[0].code, p_qty_received: 10 });
    await rpc(db, ids.budi, 'scan_receive', { p_code: res.children[1].code, p_qty_received: 9, p_reason_id: ids.rSelisih });

    const br = await one(db, `select target, wip, selisih from public.batch_reconciliation where batch_id = $1`, [batch.batch_id]);
    assert.deepEqual(br, { target: 50, wip: 49, selisih: 1 });
    await assertInvariants();
  });

  it('cannot split after receive', async () => {
    const code = (await newBatch([['kemejaM', 20]])).bundles[0].code;
    await rpc(db, ids.ani, 'scan_receive', { p_code: code, p_qty_received: 20 });
    await rejects(rpc(db, ids.produksi, 'split_bundle', { p_code: code, p_qtys: [10, 10] }), 'wrong_status');
  });
});

describe('supervisor correction (FR-24) and flags (FR-22a)', () => {
  let code;
  let batchId;
  beforeEach(async () => {
    const b = await newBatch([['kemejaM', 20]]);
    code = b.bundles[0].code;
    batchId = b.batch_id;
  });

  const lastMovement = async (type) =>
    (await one(db, `select m.id from public.movement m join public.bundle b on b.id = m.bundle_id
                    where b.code = $1 and m.type = $2 order by m.seq desc limit 1`, [code, type])).id;

  it('corrects a receive 19 -> 20, closes the flag, writes audit log', async () => {
    await rpc(db, ids.ani, 'scan_receive', { p_code: code, p_qty_received: 19, p_reason_id: ids.rSelisih });
    const mid = await lastMovement('receive_sew');

    await rejects(rpc(db, ids.ani, 'correct_movement', { p_movement_id: mid, p_note: 'x', p_qty_received: 20 }), 'forbidden_role');
    await rejects(rpc(db, ids.spv, 'correct_movement', { p_movement_id: mid, p_note: ' ', p_qty_received: 20 }), 'note_required');

    await rpc(db, ids.spv, 'correct_movement', { p_movement_id: mid, p_note: 'Salah hitung, fisik 20', p_qty_received: 20 });
    const r = await recon(code);
    assert.deepEqual([r.selisih, r.wip_dikerjakan], [0, 20]);
    const flag = await one(db, `select qty, status from public.discrepancy`);
    assert.deepEqual(flag, { qty: 0, status: 'selesai' });
    const audit = await all(db, `select field, old_value, new_value from public.audit_log order by field`);
    assert.deepEqual(audit, [{ field: 'qty_received', old_value: '19', new_value: '20' }, { field: 'reason_id', old_value: ids.rSelisih, new_value: null }]);
    // original movement untouched
    const orig = await one(db, `select qty_received from public.movement where id = $1`, [mid]);
    assert.equal(orig.qty_received, 19);
    await assertInvariants();
  });

  it('only the latest scan can be corrected; void steps back', async () => {
    await rpc(db, ids.ani, 'scan_receive', { p_code: code, p_qty_received: 20 });
    await rpc(db, ids.ani, 'scan_finish', { p_code: code, p_qty_good: 20, p_qty_reject: 0 });
    const recvId = await lastMovement('receive_sew');
    const finId = await lastMovement('finish_sew');

    await rejects(rpc(db, ids.spv, 'correct_movement', { p_movement_id: recvId, p_note: 'x', p_qty_received: 19 }), 'not_latest');

    await rpc(db, ids.spv, 'correct_movement', { p_movement_id: finId, p_note: 'Belum selesai, salah scan', p_void: true });
    assert.equal((await recon(code)).status, 'proses_jahit');
    await rejects(rpc(db, ids.spv, 'correct_movement', { p_movement_id: finId, p_note: 'lagi', p_void: true }), 'already_void');

    await rpc(db, ids.spv, 'correct_movement', { p_movement_id: recvId, p_note: 'Bundle salah ambil', p_void: true });
    const r = await recon(code);
    assert.deepEqual([r.status, r.wip_menunggu], ['siap_jahit', 20]);
    assert.equal(await batchStatus(batchId), 'draft');

    // Budi can now receive it fresh
    await rpc(db, ids.budi, 'scan_receive', { p_code: code, p_qty_received: 20 });
    assert.equal((await one(db, `select h.name from public.bundle b join public.holder h on h.id = b.current_holder_id where b.code = $1`, [code])).name, 'Budi');
    await assertInvariants();
  });

  it('correcting finishing result adjusts stock with a ledger entry', async () => {
    await rpc(db, ids.ani, 'scan_receive', { p_code: code, p_qty_received: 20 });
    await rpc(db, ids.ani, 'scan_finish', { p_code: code, p_qty_good: 20, p_qty_reject: 0 });
    await rpc(db, ids.finishing, 'scan_receive', { p_code: code, p_qty_received: 20 });
    await rpc(db, ids.finishing, 'scan_finish', { p_code: code, p_qty_good: 20, p_qty_reject: 0 });
    assert.equal(await batchStatus(batchId), 'selesai');

    const ffId = await lastMovement('finish_finishing');
    await rpc(db, ids.spv, 'correct_movement', {
      p_movement_id: ffId, p_note: 'Dua pcs ternyata noda', p_qty_good: 18, p_qty_reject: 2, p_reason_id: ids.rReject,
    });
    assert.equal((await one(db, `select qty from public.stock_ready where sku = 'KMJ-PTH-M'`)).qty, 18);
    assert.deepEqual(
      await all(db, `select qty, ref_type from public.stock_ledger order by created_at, qty desc`),
      [{ qty: 20, ref_type: 'movement' }, { qty: -2, ref_type: 'correction' }],
    );

    await rpc(db, ids.spv, 'correct_movement', { p_movement_id: ffId, p_note: 'QC belum selesai', p_void: true });
    assert.equal((await one(db, `select qty from public.stock_ready where sku = 'KMJ-PTH-M'`)).qty, 0);
    assert.equal(await batchStatus(batchId), 'berjalan');
    await assertInvariants();
  });

  it('resolving a flag does not change numbers', async () => {
    await rpc(db, ids.ani, 'scan_receive', { p_code: code, p_qty_received: 18, p_reason_id: ids.rSelisih });
    const d = await one(db, `select id from public.discrepancy`);
    await rejects(rpc(db, ids.ani, 'resolve_discrepancy', { p_discrepancy_id: d.id, p_note: 'ok' }), 'forbidden_role');
    await rpc(db, ids.spv, 'resolve_discrepancy', { p_discrepancy_id: d.id, p_note: 'Dicek, memang kurang dari potong' });
    assert.equal((await one(db, `select status from public.discrepancy`)).status, 'selesai');
    assert.equal((await recon(code)).selisih, 2);
    await rejects(rpc(db, ids.spv, 'resolve_discrepancy', { p_discrepancy_id: d.id, p_note: 'lagi' }), 'not_found');
  });
});

describe('access control', () => {
  it('blocks direct writes and anon reads', async () => {
    const code = (await newBatch([['kemejaM', 20]])).bundles[0].code;
    const bundleId = (await one(db, `select id from public.bundle where code = $1`, [code])).id;

    await actAs(db, ids.ani);
    await db.exec(`set role authenticated`);
    try {
      const rows = await all(db, `select code from public.bundle`);
      assert.equal(rows.length, 1);
      await assert.rejects(
        db.query(`insert into public.movement (bundle_id, type, qty_sent, scanned_by) values ($1, 'cut', 1, $2)`, [bundleId, ids.ani]),
        /permission denied/,
      );
      await assert.rejects(db.query(`update public.bundle set current_qty = 99`), /permission denied/);
      // penjahit sees no audit rows (RLS: admin/supervisor only)
      await db.query(`reset role`);
      await db.query(`insert into public.audit_log (entity, entity_id, field, reason, changed_by)
                      values ('test', gen_random_uuid(), 'x', 'x', $1)`, [ids.spv]);
      await db.query(`set role authenticated`);
      assert.equal((await all(db, `select * from public.audit_log`)).length, 0);
      // non-admin cannot write master data
      await assert.rejects(
        db.query(`insert into public.product_variant (sku, product_name, size, color) values ('X', 'X', 'S', 'X')`),
        /row-level security/,
      );
      // RPC still works through the definer function
      const r = await db.query(`select public.scan_receive(p_code => $1, p_qty_received => 20) as r`, [code]);
      assert.equal(r.rows[0].r.selisih, 0);
    } finally {
      await db.exec(`reset role`);
    }

    await actAs(db, null);
    await db.exec(`set role anon`);
    try {
      await assert.rejects(db.query(`select * from public.bundle`), /permission denied/);
      await assert.rejects(db.query(`select public.scan_lookup('x')`), /permission denied/);
    } finally {
      await db.exec(`reset role`);
    }
  });

  it('inactive users are locked out', async () => {
    await db.query(`update public.app_user set is_active = false where id = $1`, [ids.ani]);
    const code = (await newBatch([['kemejaM', 20]])).bundles[0].code;
    await rejects(rpc(db, ids.ani, 'scan_receive', { p_code: code, p_qty_received: 20 }), 'unauthenticated');
  });
});

describe('random operations keep the reconciliation invariant', () => {
  it('holds after 400 random scans, corrections, and splits', async () => {
    // deterministic PRNG (mulberry32) so failures are reproducible
    let seed = 20261108;
    const rand = () => {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const pick = (arr) => arr[Math.floor(rand() * arr.length)];
    const int = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));

    await newBatch([['kemejaM', 20], ['kemejaL', 15], ['kemejaXL', 12]]);
    await newBatch([['kemejaM', 8], ['kemejaL', 25]]);
    const tailors = [ids.ani, ids.budi];
    let ok = 0;
    const rejected = {};

    for (let i = 0; i < 400; i++) {
      await actAs(db, null);
      const everything = await all(db, `select id, code, current_status, current_qty, current_holder_id from public.bundle order by code`);
      const active = everything.filter((x) => !['ready_stock', 'dipecah'].includes(x.current_status));
      if (active.length < 3) {
        await newBatch([['kemejaM', int(1, 30)], ['kemejaL', int(1, 30)]]);
        continue;
      }
      const b = pick(rand() < 0.9 ? active : everything);
      const holderUser = b.current_holder_id === ids.hAni ? ids.ani : b.current_holder_id === ids.hBudi ? ids.budi : ids.finishing;
      // usually the op that fits the status, sometimes a random (likely invalid) one
      const fitting = {
        siap_jahit: 'receive', siap_finishing: 'receive', proses_jahit: 'finish', proses_finishing: 'finish',
      }[b.current_status];
      const op = rand() < 0.15 ? 'correct'
        : rand() < 0.75 && fitting ? fitting
        : pick(['receive', 'finish', 'split', 'correct']);
      try {
        if (op === 'split' || (op === 'receive' && b.current_status === 'siap_jahit' && b.current_qty >= 2 && rand() < 0.1)) {
          const a = int(1, Math.max(1, b.current_qty - 1));
          await rpc(db, ids.produksi, 'split_bundle', { p_code: b.code, p_qtys: [a, b.current_qty - a] });
        } else if (op === 'receive') {
          const user = b.current_status === 'siap_finishing' ? ids.finishing : pick(tailors);
          const qty = rand() < 0.7 ? b.current_qty : int(0, b.current_qty + 1); // sometimes invalid
          await rpc(db, user, 'scan_receive', { p_code: b.code, p_qty_received: qty, p_reason_id: rand() < 0.9 ? ids.rSelisih : null });
        } else if (op === 'finish') {
          const reject = rand() < 0.6 ? 0 : int(0, b.current_qty);
          const good = rand() < 0.9 ? b.current_qty - reject : int(0, b.current_qty);
          await rpc(db, rand() < 0.9 ? holderUser : pick(tailors), 'scan_finish', {
            p_code: b.code, p_qty_good: good, p_qty_reject: reject, p_reason_id: ids.rReject,
          });
        } else {
          const last = await one(db, `select id, type, qty_sent, qty_received from public.effective_movement
                                      where bundle_id = $1 order by seq desc limit 1`, [b.id]);
          if (!last) continue;
          const isVoid = rand() < 0.5;
          const args = { p_movement_id: last.id, p_note: `fuzz ${i}`, p_void: isVoid };
          if (!isVoid && last.type.startsWith('receive')) {
            args.p_qty_received = int(0, last.qty_sent);
            args.p_reason_id = ids.rSelisih;
          } else if (!isVoid && last.type.startsWith('finish')) {
            const rej = int(0, last.qty_received);
            Object.assign(args, { p_qty_good: last.qty_received - rej, p_qty_reject: rej, p_reason_id: ids.rReject });
          }
          await rpc(db, ids.spv, 'correct_movement', args);
        }
        ok++;
      } catch (e) {
        // business rule rejections are expected; anything else is a bug
        assert.ok(e.detail, `unexpected error at step ${i}: ${e.message}`);
        rejected[e.detail] = (rejected[e.detail] ?? 0) + 1;
      }
      const problems = await checkInvariants(db);
      assert.deepEqual(problems, [], `step ${i}:\n${problems.join('\n')}`);
    }
    const statuses = await all(db, `select current_status, count(*)::int as n from public.bundle group by 1 order by 1`);
    console.log('fuzz', { ok, rejected, statuses });
    assert.ok(ok > 200, `too few successful operations (${ok})`);
    // every kind of operation must have succeeded at least once
    const kinds = await one(db, `select
      count(*) filter (where type = 'split')::int as split,
      count(*) filter (where type = 'correction' and is_void)::int as void,
      count(*) filter (where type = 'correction' and not is_void)::int as fix,
      count(*) filter (where type = 'finish_finishing')::int as ff
      from public.movement`);
    for (const [k, v] of Object.entries(kinds)) assert.ok(v > 0, `no successful ${k}`);
  });
});

describe('PIN login rate limit', () => {
  it('locks a phone after 5 failures, success resets, only service_role can call', async () => {
    const keys = ['phone:628123', 'ip:10.0.0.1'];
    await db.exec(`set role service_role`);
    try {
      for (let i = 0; i < 4; i++) {
        const r = await one(db, `select public.pin_login_record($1, false) as locked`, [keys]);
        assert.equal(r.locked, null, `locked too early at failure ${i + 1}`);
      }
      const fifth = await one(db, `select public.pin_login_record($1, false) as locked`, [keys]);
      assert.ok(fifth.locked instanceof Date);
      assert.ok((await one(db, `select public.pin_login_check($1) as locked`, [keys])).locked);
      // other phone on the same IP is still allowed (IP limit is 20)
      assert.equal((await one(db, `select public.pin_login_check($1) as locked`, [['phone:628999', 'ip:10.0.0.1']])).locked, null);
      // success clears the phone counter but the lock row is gone too
      await one(db, `select public.pin_login_record($1, true) as locked`, [keys]);
      assert.equal((await one(db, `select public.pin_login_check($1) as locked`, [['phone:628123']])).locked, null);
    } finally {
      await db.exec(`reset role`);
    }
    await db.exec(`set role authenticated`);
    try {
      await assert.rejects(db.query(`select public.pin_login_check($1)`, [keys]), /permission denied/);
    } finally {
      await db.exec(`reset role`);
    }
  });
});

describe('staff_names (FR-23)', () => {
  it('returns only id + name to active staff, nothing to anon', async () => {
    await actAs(db, ids.ani);
    await db.exec(`set role authenticated`);
    try {
      const rows = await all(db, `select * from public.staff_names($1)`, [[ids.spv, ids.budi]]);
      assert.deepEqual(rows.map((r) => r.name).sort(), ['Budi', 'Supervisor']);
      assert.deepEqual(Object.keys(rows[0]).sort(), ['id', 'name']);
      // the table itself still hides other users from a penjahit
      assert.equal((await all(db, `select * from public.app_user where id = $1`, [ids.spv])).length, 0);
    } finally {
      await db.exec(`reset role`);
    }
    await actAs(db, null);
    await db.exec(`set role anon`);
    try {
      await assert.rejects(db.query(`select * from public.staff_names($1)`, [[ids.spv]]), /permission denied/);
    } finally {
      await db.exec(`reset role`);
    }
  });
});

describe('day counts follow the Jakarta calendar', () => {
  // midnight today in Jakarta, plus an offset in minutes, as timestamptz
  const jakarta = (minutes) =>
    `((date_trunc('day', now() at time zone 'Asia/Jakarta') + interval '${minutes} minutes') at time zone 'Asia/Jakarta')`;

  it('wip_list: yesterday 23:59 is 1 day ago, today 00:01 is 0', async () => {
    const res = await newBatch([['kemejaM', 10], ['kemejaL', 10]]);
    await actAs(db, null);
    const [late, early] = await all(db, `select id from public.bundle where batch_id = $1 order by code`, [res.batch_id]);
    await db.query(`update public.bundle set last_movement_at = ${jakarta(-1)} where id = $1`, [late.id]);
    await db.query(`update public.bundle set last_movement_at = ${jakarta(1)} where id = $1`, [early.id]);
    const days = Object.fromEntries(
      (await all(db, `select bundle_id, days_since_last_scan from public.wip_list where batch_id = $1`, [res.batch_id])).map((r) => [
        r.bundle_id,
        r.days_since_last_scan,
      ]),
    );
    assert.equal(days[late.id], 1);
    assert.equal(days[early.id], 0);
  });
});

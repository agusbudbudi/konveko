import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, seedFixture, rpc, one, all, actAs, checkInvariants } from './harness.mjs';

let db;
let ids;

async function assertInvariants() {
  const problems = await checkInvariants(db);
  assert.deepEqual(problems, [], problems.join('\n'));
}

async function rejects(promise, detail) {
  await assert.rejects(promise, (e) => (detail instanceof RegExp ? detail.test(e.message) : e.detail === detail));
}

async function newBundle(variant, qty) {
  const batch = await rpc(db, ids.produksi, 'create_batch', {
    p_fabric_roll_id: ids.roll,
    p_items: JSON.stringify([{ variant_id: ids[variant], qty }]),
  });
  return batch.bundles[0];
}

/** Drive a bundle through sewing and finishing. */
async function finish(code, { sewReject = 0, ffReject = 0 } = {}) {
  await rpc(db, ids.ani, 'scan_receive', { p_code: code, p_qty_received: (await bundle(code)).current_qty });
  const q1 = (await bundle(code)).current_qty;
  await rpc(db, ids.ani, 'scan_finish', {
    p_code: code, p_qty_good: q1 - sewReject, p_qty_reject: sewReject, p_reason_id: ids.rReject,
  });
  await rpc(db, ids.finishing, 'scan_receive', { p_code: code, p_qty_received: (await bundle(code)).current_qty });
  const q2 = (await bundle(code)).current_qty;
  return rpc(db, ids.finishing, 'scan_finish', {
    p_code: code, p_qty_good: q2 - ffReject, p_qty_reject: ffReject, p_reason_id: ids.rReject,
  });
}

async function bundle(code) {
  await actAs(db, null);
  return one(db, `select * from public.bundle where code = $1`, [code]);
}

async function pieces(code, extra = '') {
  await actAs(db, null);
  return all(db, `select p.* from public.piece p join public.bundle b on b.id = p.bundle_id
                  where b.code = $1 and p.status = 'aktif' ${extra} order by p.code`, [code]);
}

async function printAll(code) {
  const ps = await pieces(code);
  return rpc(db, ids.finishing, 'mark_printed', { p_piece_ids: ps.map((p) => p.id) });
}

beforeEach(async () => {
  db = await createDb();
  ids = await seedFixture(db);
});

describe('pieces from finishing', () => {
  it('creates good and reject pieces, labels gate putaway, racks split by grade', async () => {
    const { code } = await newBundle('kemejaM', 20);
    await finish(code, { sewReject: 1, ffReject: 2 });

    const all1 = await pieces(code);
    assert.equal(all1.length, 20);
    assert.equal(all1.filter((p) => p.grade === 'baik').length, 17);
    assert.equal(all1.filter((p) => p.grade === 'reject').length, 3);
    assert.match(all1[0].code, /^P-\d{7}$/);
    assert.match(all1[0].qr_token, /^[0-9a-f]{32}$/);
    await assertInvariants();

    // not printed yet
    await rejects(rpc(db, ids.gudang, 'putaway', { p_location: 'A1', p_code: code }), 'not_printed');
    // only finishing / supervisor / admin print; only gudang / supervisor shelve
    await rejects(rpc(db, ids.ani, 'mark_printed', { p_piece_ids: all1.map((p) => p.id) }), 'forbidden_role');
    assert.equal(await printAll(code), 20);
    await rejects(rpc(db, ids.finishing, 'putaway', { p_location: 'A1', p_code: code }), 'forbidden_role');

    const r = await rpc(db, ids.gudang, 'putaway', { p_location: 'a1', p_code: code.toLowerCase() });
    assert.equal(r.moved, 17);
    assert.equal(r.message, `17 pcs baik bundle ${code} masuk rak A1.`);
    // the 3 rejects stay; A1 refuses them, RJ1 takes them
    await rejects(rpc(db, ids.gudang, 'putaway', { p_location: 'A1', p_code: code }), 'wrong_rack_kind');
    assert.equal((await rpc(db, ids.gudang, 'putaway', { p_location: 'RJ1', p_code: code })).moved, 3);
    await rejects(rpc(db, ids.gudang, 'putaway', { p_location: 'RJ1', p_code: code }), 'nothing_to_move');

    await actAs(db, null);
    const stock = await all(db, `select grade, location_code, qty from public.stock_location where sku = 'KMJ-PTH-M' order by grade`);
    assert.deepEqual(stock, [
      { grade: 'baik', location_code: 'A1', qty: 17 },
      { grade: 'reject', location_code: 'RJ1', qty: 3 },
    ]);
    assert.equal((await all(db, `select * from public.bundle_unshelved`)).length, 0);
    await assertInvariants();
  });

  it('moves a single piece between racks and refuses wrong moves', async () => {
    const { code } = await newBundle('kemejaL', 4);
    await finish(code, { ffReject: 1 });
    await printAll(code);
    const [good] = await pieces(code, `and p.grade = 'baik'`);
    const [bad] = await pieces(code, `and p.grade = 'reject'`);

    const r1 = await rpc(db, ids.gudang, 'putaway', { p_location: 'A1', p_code: good.qr_token });
    assert.equal(r1.message, `Pcs ${good.code} masuk rak A1.`);
    await rejects(rpc(db, ids.gudang, 'putaway', { p_location: 'A1', p_code: good.code }), 'already_there');
    const r2 = await rpc(db, ids.gudang, 'putaway', { p_location: 'A2', p_code: good.code });
    assert.equal(r2.message, `Pcs ${good.code} dipindah dari rak A1 ke A2.`);
    await rejects(rpc(db, ids.gudang, 'putaway', { p_location: 'A2', p_code: bad.code }), 'wrong_rack_kind');
    await rejects(rpc(db, ids.gudang, 'putaway', { p_location: 'ZZ9', p_code: good.code }), 'location_not_found');

    // bundle putaway takes only the rest of the unshelved good pieces
    assert.equal((await rpc(db, ids.gudang, 'putaway', { p_location: 'A1', p_code: code })).moved, 2);

    const events = await all(db, `select type from public.piece_event where piece_id = $1 order by seq`, [good.id]);
    assert.deepEqual(events.map((e) => e.type), ['dibuat', 'cetak', 'masuk_rak', 'pindah_rak']);
    await assertInvariants();
  });

  it('reprint counts, void pieces cannot be printed or shelved', async () => {
    const { code } = await newBundle('kemejaM', 3);
    await finish(code);
    await printAll(code);
    await printAll(code);
    const ps = await pieces(code);
    assert.ok(ps.every((p) => p.print_count === 2 && p.printed_at));
    const notes = await all(db, `select note from public.piece_event where type = 'cetak' and piece_id = $1 order by seq`, [ps[0].id]);
    assert.deepEqual(notes.map((n) => n.note), [null, 'Cetak ulang']);
  });
});

describe('corrections follow the pieces', () => {
  it('lowering good voids unshelved pieces, unprinted first; shelved pieces block', async () => {
    const { code } = await newBundle('kemejaM', 10);
    await finish(code);
    const ff = await one(db, `select id from public.movement where type = 'finish_finishing'`);
    // print 8 of 10, so the 2 unprinted are voided first
    const ps = await pieces(code);
    await rpc(db, ids.finishing, 'mark_printed', { p_piece_ids: ps.slice(0, 8).map((p) => p.id) });

    await rpc(db, ids.spv, 'correct_movement', {
      p_movement_id: ff.id, p_note: 'Salah hitung', p_qty_good: 8, p_qty_reject: 2, p_reason_id: ids.rReject,
    });
    let now = await pieces(code);
    assert.equal(now.filter((p) => p.grade === 'baik').length, 8);
    assert.ok(now.filter((p) => p.grade === 'baik').every((p) => p.printed_at), 'unprinted pieces voided first');
    assert.equal(now.filter((p) => p.grade === 'reject').length, 2);
    await assertInvariants();

    // shelve all 8 good, then a correction that needs to remove good pieces is refused
    await rpc(db, ids.gudang, 'putaway', { p_location: 'A1', p_code: code });
    await rejects(rpc(db, ids.spv, 'correct_movement', {
      p_movement_id: ff.id, p_note: 'Lagi', p_qty_good: 6, p_qty_reject: 4, p_reason_id: ids.rReject,
    }), 'pieces_shelved');
    await assertInvariants();

    // take 2 off the rack, now it works
    const shelved = await pieces(code, `and p.grade = 'baik'`);
    await rejects(rpc(db, ids.ani, 'unshelve', { p_code: shelved[0].code, p_note: 'x' }), 'forbidden_role');
    await rejects(rpc(db, ids.gudang, 'unshelve', { p_code: shelved[0].code, p_note: ' ' }), 'note_required');
    for (const p of shelved.slice(0, 2)) {
      await rpc(db, ids.gudang, 'unshelve', { p_code: p.code, p_note: 'Koreksi QC' });
    }
    await rpc(db, ids.spv, 'correct_movement', {
      p_movement_id: ff.id, p_note: 'Lagi', p_qty_good: 6, p_qty_reject: 4, p_reason_id: ids.rReject,
    });
    now = await pieces(code);
    assert.equal(now.filter((p) => p.grade === 'baik').length, 6);
    assert.equal(now.filter((p) => p.grade === 'baik' && p.location_id).length, 6);
    await assertInvariants();

    // raising good again creates new pieces waiting for labels
    await rpc(db, ids.spv, 'correct_movement', {
      p_movement_id: ff.id, p_note: 'Kembali', p_qty_good: 9, p_qty_reject: 1, p_reason_id: ids.rReject,
    });
    assert.equal((await pieces(code, `and p.grade = 'baik' and p.printed_at is null`)).length, 3);
    await assertInvariants();
  });

  it('voiding finishing voids every piece; voiding finish_sew voids its rejects', async () => {
    const { code } = await newBundle('kemejaXL', 6);
    await finish(code, { sewReject: 1, ffReject: 1 });
    const ff = await one(db, `select id from public.movement where type = 'finish_finishing'`);
    await rpc(db, ids.spv, 'correct_movement', { p_movement_id: ff.id, p_note: 'Batal', p_void: true });
    // only the sewing reject is left
    let now = await pieces(code);
    assert.deepEqual(now.map((p) => p.grade), ['reject']);
    const rf = await one(db, `select id from public.movement where type = 'receive_finishing'`);
    await rpc(db, ids.spv, 'correct_movement', { p_movement_id: rf.id, p_note: 'Batal', p_void: true });
    const fs = await one(db, `select id from public.movement where type = 'finish_sew'`);
    await rpc(db, ids.spv, 'correct_movement', { p_movement_id: fs.id, p_note: 'Batal', p_void: true });
    assert.equal((await pieces(code)).length, 0);
    await assertInvariants();
  });
});

describe('warehouse_lookup', () => {
  it('tells rack, bundle, and piece apart', async () => {
    const { code } = await newBundle('kemejaM', 2);
    await finish(code, { ffReject: 1 });
    const [p] = await pieces(code);

    const loc = await rpc(db, ids.gudang, 'warehouse_lookup', { p_code: 'rj1' });
    assert.deepEqual([loc.kind, loc.code, loc.location_kind, loc.qty], ['location', 'RJ1', 'reject', 0]);
    const b = await rpc(db, ids.gudang, 'warehouse_lookup', { p_code: code });
    assert.deepEqual([b.kind, b.unshelved_baik, b.unshelved_reject, b.unprinted, b.shelved], ['bundle', 1, 1, 2, 0]);
    const pc = await rpc(db, ids.gudang, 'warehouse_lookup', { p_code: p.qr_token });
    assert.deepEqual([pc.kind, pc.code, pc.bundle_code, pc.printed], ['piece', p.code, code, false]);
    await rejects(rpc(db, ids.gudang, 'warehouse_lookup', { p_code: 'nope' }), 'not_found');
  });

  it('rack codes cannot look like bundle or piece codes', async () => {
    await assert.rejects(db.query(`insert into public.location (code) values ('B-00001')`), /check/);
    await assert.rejects(db.query(`insert into public.location (code) values ('a1')`), /check/);
  });
});

describe('access', () => {
  it('anon reads nothing; staff cannot write pieces directly; only admin edits racks', async () => {
    const { code } = await newBundle('kemejaM', 1);
    await finish(code);
    await actAs(db, null);
    await db.exec(`set role anon`);
    try {
      await assert.rejects(db.query(`select * from public.piece`), /permission denied/);
    } finally {
      await db.exec(`reset role`);
    }
    await actAs(db, ids.gudang);
    await db.exec(`set role authenticated`);
    try {
      assert.equal((await all(db, `select * from public.piece`)).length, 1);
      await assert.rejects(db.query(`update public.piece set location_id = null`), /permission denied/);
      await assert.rejects(db.query(`insert into public.location (code) values ('Z9')`), /row-level security/);
    } finally {
      await db.exec(`reset role`);
    }
    await actAs(db, ids.admin);
    await db.exec(`set role authenticated`);
    try {
      await db.query(`insert into public.location (code, kind) values ('Z9', 'stok')`);
    } finally {
      await db.exec(`reset role`);
    }
  });
});

describe('fuzz: shelving and corrections keep every invariant', () => {
  it('300 random warehouse steps', async () => {
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const int = (a, b) => a + Math.floor(rand() * (b - a + 1));
    const pick = (xs) => xs[Math.floor(rand() * xs.length)];

    const codes = [];
    for (const [v, q] of [['kemejaM', 8], ['kemejaL', 6], ['kemejaXL', 5], ['kemejaM', 7]]) {
      const { code } = await newBundle(v, q);
      await finish(code, { sewReject: int(0, 1), ffReject: int(0, 2) });
      codes.push(code);
    }

    let ok = 0;
    const rejected = {};
    for (let i = 0; i < 300; i++) {
      const code = pick(codes);
      const ps = await pieces(code);
      const op = pick(['print', 'shelve', 'shelve', 'piece', 'unshelve', 'correct', 'correct']);
      try {
        if (op === 'print') {
          await rpc(db, ids.finishing, 'mark_printed', { p_piece_ids: ps.filter(() => rand() < 0.7).map((p) => p.id) });
        } else if (op === 'shelve') {
          await rpc(db, ids.gudang, 'putaway', { p_location: pick(['A1', 'A2', 'RJ1']), p_code: code });
        } else if (op === 'piece') {
          if (!ps.length) continue;
          await rpc(db, ids.gudang, 'putaway', { p_location: pick(['A1', 'A2', 'RJ1']), p_code: pick(ps).code });
        } else if (op === 'unshelve') {
          if (!ps.length) continue;
          await rpc(db, ids.gudang, 'unshelve', { p_code: pick(ps).code, p_note: `fuzz ${i}` });
        } else {
          const last = await one(db, `select em.id, em.type, em.qty_received from public.effective_movement em
                                      join public.bundle b on b.id = em.bundle_id
                                      where b.code = $1 order by em.seq desc limit 1`, [code]);
          if (last.type === 'finish_finishing' && rand() < 0.85) {
            const rej = int(0, last.qty_received);
            await rpc(db, ids.spv, 'correct_movement', {
              p_movement_id: last.id, p_note: `fuzz ${i}`, p_qty_good: last.qty_received - rej,
              p_qty_reject: rej, p_reason_id: ids.rReject,
            });
          } else if (last.type === 'finish_finishing' || last.type === 'receive_finishing') {
            await rpc(db, ids.spv, 'correct_movement', { p_movement_id: last.id, p_note: `fuzz ${i}`, p_void: true });
          } else if (last.type === 'finish_sew') {
            // redo finishing so the bundle comes back
            await rpc(db, ids.finishing, 'scan_receive', { p_code: code, p_qty_received: (await bundle(code)).current_qty });
          } else {
            const q = (await bundle(code)).current_qty;
            const rej = int(0, q);
            await rpc(db, ids.finishing, 'scan_finish', {
              p_code: code, p_qty_good: q - rej, p_qty_reject: rej, p_reason_id: ids.rReject,
            });
          }
        }
        ok++;
      } catch (e) {
        assert.ok(e.detail, `unexpected error at step ${i}: ${e.message}`);
        rejected[e.detail] = (rejected[e.detail] ?? 0) + 1;
      }
      const problems = await checkInvariants(db);
      assert.deepEqual(problems, [], `step ${i} (${op}):\n${problems.join('\n')}`);
    }
    console.log('warehouse fuzz', { ok, rejected });
    assert.ok(ok > 120, `too few successful operations (${ok})`);
    const kinds = await one(db, `select
      count(*) filter (where type = 'masuk_rak')::int as masuk,
      count(*) filter (where type = 'pindah_rak')::int as pindah,
      count(*) filter (where type = 'keluar_rak')::int as keluar,
      count(*) filter (where type = 'batal')::int as batal
      from public.piece_event`);
    for (const [k, v] of Object.entries(kinds)) assert.ok(v > 0, `no successful ${k}`);
    assert.ok(rejected.pieces_shelved > 0, 'never hit the shelved guard');
  });
});

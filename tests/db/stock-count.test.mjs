import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, seedFixture, rpc, one, all, actAs, checkInvariants } from './harness.mjs';

// Fase 2c: stok opname (doc/PRD Fase 2c - Stok opname.md).

let db;
let ids;

async function assertInvariants() {
  const problems = await checkInvariants(db);
  assert.deepEqual(problems, [], problems.join('\n'));
}

async function rejects(promise, detail) {
  await assert.rejects(promise, (e) => (detail instanceof RegExp ? detail.test(e.message) : e.detail === detail));
}

async function pieces(code, extra = '') {
  await actAs(db, null);
  return all(db, `select p.* from public.piece p join public.bundle b on b.id = p.bundle_id
                  where b.code = $1 and p.status <> 'batal' ${extra} order by p.code`, [code]);
}

async function piece(code) {
  await actAs(db, null);
  return one(db, `select p.*, l.code as rack from public.piece p left join public.location l on l.id = p.location_id
                  where p.code = $1`, [code]);
}

/** A finished bundle with printed labels; good pcs on `rack` (or not shelved), rejects on RJ1. */
async function stocked(variant, qty, { ffReject = 0, rack = 'A1' } = {}) {
  const batch = await rpc(db, ids.produksi, 'create_batch', {
    p_fabric_roll_id: ids.roll,
    p_items: JSON.stringify([{ variant_id: ids[variant], qty }]),
  });
  const { code } = batch.bundles[0];
  await rpc(db, ids.ani, 'scan_receive', { p_code: code, p_qty_received: qty });
  await rpc(db, ids.ani, 'scan_finish', { p_code: code, p_qty_good: qty, p_qty_reject: 0, p_reason_id: null });
  await rpc(db, ids.finishing, 'scan_receive', { p_code: code, p_qty_received: qty });
  await rpc(db, ids.finishing, 'scan_finish', {
    p_code: code, p_qty_good: qty - ffReject, p_qty_reject: ffReject, p_reason_id: ffReject ? ids.rReject : null,
  });
  const ps = await pieces(code);
  await rpc(db, ids.finishing, 'mark_printed', { p_piece_ids: ps.map((p) => p.id) });
  if (rack) await rpc(db, ids.gudang, 'putaway', { p_location: rack, p_code: code });
  if (ffReject) await rpc(db, ids.gudang, 'putaway', { p_location: 'RJ1', p_code: code });
  return code;
}

const create = (user, racks, note = null) =>
  rpc(db, ids[user], 'stock_count_create', { p_location_codes: racks, p_note: note });
const scan = (user, count, rack, code) =>
  rpc(db, ids[user], 'stock_count_scan', { p_count_id: count, p_location: rack, p_code: code });
const close = (user, count, rack) => rpc(db, ids[user], 'stock_count_close_location', { p_count_id: count, p_location: rack });
const unlabeled = (user, count, rack, variant, condition, qty) =>
  rpc(db, ids[user], 'stock_count_unlabeled', {
    p_count_id: count, p_location: rack, p_variant_id: ids[variant], p_condition: condition, p_qty: qty,
  });

beforeEach(async () => {
  db = await createDb();
  ids = await seedFixture(db);
});

describe('stock count: full flow', () => {
  it('locks racks, counts blind, and applies every kind of difference on approval', async () => {
    const a = await stocked('kemejaM', 10, { ffReject: 2, rack: 'A1' }); // 8 good on A1, 2 reject on RJ1
    const b = await stocked('kemejaL', 4, { rack: 'A2' });
    const c = await stocked('kemejaXL', 2, { rack: null }); // printed, not on a rack
    const good = await pieces(a, `and p.grade = 'baik'`);
    const rej = await pieces(a, `and p.grade = 'reject'`);
    const onA2 = await pieces(b);
    const loose = await pieces(c);

    await rejects(create('ani', ['A1']), 'forbidden_role');
    await rejects(create('gudang', []), 'racks_required');
    const op = await create('gudang', ['A1', 'A2', 'RJ1'], 'Opname akhir bulan');
    assert.match(op.code, /^OP-\d{6}$/);
    await rejects(create('spv', ['A2']), 'rack_busy');

    // racks are locked for every move
    await rejects(rpc(db, ids.gudang, 'putaway', { p_location: 'A1', p_code: c }), 'rack_locked');
    await rejects(rpc(db, ids.gudang, 'unshelve', { p_code: onA2[0].code, p_note: 'cek' }), 'rack_locked');
    const doc = await rpc(db, ids.gudang, 'outbound_create', {
      p_type: 'jual', p_destination: 'Toko', p_ref_no: null, p_note: null, p_plan: null,
    });
    await rpc(db, ids.gudang, 'outbound_add', { p_outbound_id: doc.id, p_code: good[7].code }); // reserving is fine
    await rejects(rpc(db, ids.gudang, 'outbound_ship', { p_outbound_id: doc.id }), 'rack_locked');
    await assertInvariants();

    // A1: 6 of 8 good (good[6], good[7] missing), one from A2, one loose, one reject
    for (const p of good.slice(0, 6)) await scan('gudang', op.id, 'A1', p.code);
    const r = await scan('gudang', op.id, 'A1', onA2[0].qr_token);
    assert.equal(r.duplicate, false);
    assert.equal(r.pieces, 7);
    assert.ok(!('expected' in r) && !('missing' in r), 'blind count: nothing about what should be there');
    assert.equal((await scan('gudang', op.id, 'A1', onA2[0].code)).duplicate, true);
    await scan('gudang', op.id, 'A1', loose[0].code);
    await scan('gudang', op.id, 'A1', rej[0].code);
    await rejects(scan('gudang', op.id, 'A1', a), 'bundle_label');
    await rejects(scan('gudang', op.id, 'A1', 'A2'), 'rack_label');
    await rejects(scan('gudang', op.id, 'A1', 'P-9999999'), 'not_found');
    await rejects(scan('gudang', op.id, 'A9', good[0].code), 'location_not_found');

    // goods without a label: 3 good Kemeja M on A1; damaged ones only on a reject rack
    await rejects(unlabeled('gudang', op.id, 'A1', 'kemejaM', 'rusak', 1), 'wrong_rack_kind');
    await unlabeled('gudang', op.id, 'A1', 'kemejaM', 'baik', 5);
    const u = await unlabeled('gudang', op.id, 'A1', 'kemejaM', 'baik', 3);
    assert.equal(u.unlabeled, 3);
    await unlabeled('gudang', op.id, 'RJ1', 'kemejaL', 'rusak', 1);

    for (const p of onA2.slice(1)) await scan('gudang', op.id, 'A2', p.code);
    await scan('gudang', op.id, 'RJ1', rej[1].code);

    await close('gudang', op.id, 'A1');
    await rejects(scan('gudang', op.id, 'A1', good[0].code), 'rack_closed');
    await close('gudang', op.id, 'A2');
    await rejects(rpc(db, ids.spv, 'stock_count_approve', { p_count_id: op.id }), 'wrong_status');
    const last = await close('gudang', op.id, 'RJ1');
    assert.equal(last.racks_left, 0);

    // review shows the differences
    await rejects(rpc(db, ids.gudang, 'stock_count_review', { p_count_id: op.id }), 'forbidden_role');
    const rev = await rpc(db, ids.spv, 'stock_count_review', { p_count_id: op.id });
    assert.equal(rev.status, 'review');
    const kinds = {};
    for (const l of rev.lines) kinds[l.kind] = (kinds[l.kind] ?? 0) + 1;
    assert.deepEqual(kinds, { cocok: 10, hilang: 2, pindah: 1, belum_di_rak: 1, jenis_salah: 1 });
    assert.equal(rev.lines.find((l) => l.kind === 'pindah').from_code, 'A2');
    assert.equal(rev.unlabeled.length, 2);

    await rejects(rpc(db, ids.gudang, 'stock_count_approve', { p_count_id: op.id }), 'forbidden_role');
    const res = await rpc(db, ids.spv, 'stock_count_approve', { p_count_id: op.id });
    assert.equal(res.missing, 2);
    assert.equal(res.created, 4);
    assert.match(res.outbound_code, /^SJ-/);

    // hilang: shipped out on the adjustment document; the reserved one left its draft first
    await actAs(db, null);
    const adj = await one(db, `select * from public.outbound where code = $1`, [res.outbound_code]);
    assert.equal(adj.type, 'penyesuaian');
    assert.equal(adj.status, 'dikirim');
    for (const p of [good[6], good[7]]) {
      const x = await piece(p.code);
      assert.equal(x.status, 'keluar');
      assert.equal(x.outbound_id, adj.id);
    }
    assert.equal((await one(db, `select count(*)::int as n from public.outbound_item where outbound_id = $1 and returned_at is null`, [doc.id])).n, 0);

    assert.equal((await piece(onA2[0].code)).rack, 'A1');
    assert.equal((await piece(loose[0].code)).rack, 'A1');
    assert.equal((await piece(rej[0].code)).rack, null, 'reject found on a stock rack is taken off for putaway');
    assert.equal((await piece(rej[1].code)).rack, 'RJ1');

    const awal = await all(db, `select p.*, l.code as rack from public.piece p join public.location l on l.id = p.location_id
                                where p.origin = 'stok_awal' order by p.code`);
    assert.equal(awal.length, 4);
    assert.deepEqual(awal.map((p) => `${p.rack}:${p.condition}`).sort(), ['A1:baik', 'A1:baik', 'A1:baik', 'RJ1:rusak']);
    assert.ok(awal.every((p) => p.printed_at === null && p.bundle_id === null && p.stock_count_id === op.id));

    const stats = await all(db, `select l.code, cl.expected, cl.matched, cl.missing, cl.moved_in, cl.wrong_kind, cl.unlabeled, cl.is_open
                                 from public.stock_count_location cl join public.location l on l.id = cl.location_id
                                 where cl.count_id = $1 order by l.code`, [op.id]);
    assert.deepEqual(stats.map((s) => [s.code, s.expected, s.matched, s.missing, s.moved_in, s.wrong_kind, s.unlabeled, s.is_open]), [
      ['A1', 8, 6, 2, 2, 1, 3, false],
      ['A2', 4, 3, 0, 0, 0, 0, false],
      ['RJ1', 2, 1, 0, 0, 0, 1, false],
    ]);

    // lines are kept after approval
    const after = await rpc(db, ids.spv, 'stock_count_review', { p_count_id: op.id });
    assert.equal(after.lines.length, rev.lines.length);

    // unlocked: normal work again, stok awal pieces print and sell like any other
    await rpc(db, ids.gudang, 'putaway', { p_location: 'RJ1', p_code: rej[0].code });
    await rpc(db, ids.gudang, 'mark_printed', { p_piece_ids: awal.map((p) => p.id) }); // gudang labels stok awal
    const sale = await rpc(db, ids.gudang, 'outbound_create', {
      p_type: 'jual', p_destination: 'Toko', p_ref_no: null, p_note: null, p_plan: null,
    });
    await rpc(db, ids.gudang, 'outbound_add', { p_outbound_id: sale.id, p_code: awal.find((p) => p.condition === 'baik').code });
    await rpc(db, ids.gudang, 'outbound_ship', { p_outbound_id: sale.id });
    await rejects(rpc(db, ids.spv, 'stock_count_approve', { p_count_id: op.id }), 'wrong_status');
    await assertInvariants();
  });
});

describe('stock count: review tools', () => {
  it('refuses approval while a pcs is counted on two racks, until one scan is removed', async () => {
    const a = await stocked('kemejaM', 3, { rack: 'A1' });
    const ps = await pieces(a);
    const op = await create('spv', ['A1', 'A2']);
    for (const p of ps) await scan('gudang', op.id, 'A1', p.code);
    await scan('gudang', op.id, 'A2', ps[0].code);
    await close('gudang', op.id, 'A1');
    await close('gudang', op.id, 'A2');

    const rev = await rpc(db, ids.spv, 'stock_count_review', { p_count_id: op.id });
    assert.equal(rev.lines.filter((l) => l.kind === 'ganda').length, 2);
    await rejects(rpc(db, ids.spv, 'stock_count_approve', { p_count_id: op.id }), 'duplicates');
    await rejects(rpc(db, ids.gudang, 'stock_count_undo', { p_count_id: op.id, p_location: 'A2', p_code: ps[0].code }), 'rack_closed');
    await rpc(db, ids.spv, 'stock_count_undo', { p_count_id: op.id, p_location: 'A2', p_code: ps[0].code });
    await rpc(db, ids.spv, 'stock_count_approve', { p_count_id: op.id });
    assert.equal((await piece(ps[0].code)).rack, 'A1');
    await assertInvariants();
  });

  it('reopens one rack for a recount, and cancels without changing anything', async () => {
    const a = await stocked('kemejaM', 3, { rack: 'A1' });
    const ps = await pieces(a);
    const op = await create('gudang', ['A1']);
    await scan('gudang', op.id, 'A1', ps[0].code);
    await unlabeled('gudang', op.id, 'A1', 'kemejaL', 'baik', 2);
    await close('gudang', op.id, 'A1');
    await actAs(db, null);
    assert.equal((await one(db, `select status from public.stock_count where id = $1`, [op.id])).status, 'review');

    await rejects(rpc(db, ids.gudang, 'stock_count_reopen_location', { p_count_id: op.id, p_location: 'A1' }), 'forbidden_role');
    await rpc(db, ids.spv, 'stock_count_reopen_location', { p_count_id: op.id, p_location: 'A1' });
    await actAs(db, null);
    assert.equal((await one(db, `select status from public.stock_count where id = $1`, [op.id])).status, 'menghitung');
    assert.equal((await one(db, `select count(*)::int as n from public.stock_count_scan where count_id = $1`, [op.id])).n, 0);

    await rejects(rpc(db, ids.spv, 'stock_count_cancel', { p_count_id: op.id, p_note: ' ' }), 'note_required');
    await rpc(db, ids.spv, 'stock_count_cancel', { p_count_id: op.id, p_note: 'Diulang minggu depan' });
    for (const p of ps) assert.equal((await piece(p.code)).rack, 'A1');
    await rpc(db, ids.gudang, 'unshelve', { p_code: ps[0].code, p_note: 'cek' }); // unlocked
    const again = await create('gudang', ['A1']); // the rack can be counted again
    assert.ok(again.id);
    await assertInvariants();
  });

  it('reports a shipped pcs found on the rack and a void label as findings, without changes', async () => {
    const a = await stocked('kemejaM', 3, { rack: 'A1' });
    const ps = await pieces(a);
    const doc = await rpc(db, ids.gudang, 'outbound_create', {
      p_type: 'jual', p_destination: 'Toko', p_ref_no: null, p_note: null, p_plan: null,
    });
    await rpc(db, ids.gudang, 'outbound_add', { p_outbound_id: doc.id, p_code: ps[0].code });
    await rpc(db, ids.gudang, 'outbound_ship', { p_outbound_id: doc.id });

    const op = await create('gudang', ['A1']);
    const r = await scan('gudang', op.id, 'A1', ps[0].code);
    assert.match(r.warning, /sudah keluar/);
    await scan('gudang', op.id, 'A1', ps[1].code);
    await scan('gudang', op.id, 'A1', ps[2].code);
    await close('gudang', op.id, 'A1');
    const rev = await rpc(db, ids.spv, 'stock_count_review', { p_count_id: op.id });
    assert.deepEqual(rev.lines.map((l) => l.kind).sort(), ['cocok', 'cocok', 'keluar']);
    await rpc(db, ids.spv, 'stock_count_approve', { p_count_id: op.id });
    assert.equal((await piece(ps[0].code)).status, 'keluar');
    await assertInvariants();
  });
});

describe('fuzz: warehouse work and stock counts keep every invariant', () => {
  it('200 random steps', async () => {
    let seed = 23;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const int = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
    const pick = (xs) => xs[Math.floor(rand() * xs.length)];
    const racks = ['A1', 'A2', 'RJ1'];

    for (const [v, q, rack] of [['kemejaM', 6, 'A1'], ['kemejaL', 5, 'A2'], ['kemejaXL', 4, null]]) {
      await stocked(v, q, { ffReject: int(0, 2), rack });
    }

    let ok = 0;
    const rejected = {};
    const done = { approved: 0, cancelled: 0 };
    for (let i = 0; i < 200; i++) {
      await actAs(db, null);
      const ps = await all(db, `select code, status from public.piece where status <> 'batal'`);
      const open = await one(db, `select id, status from public.stock_count where status in ('menghitung', 'review') order by created_at limit 1`);
      const opRacks = open
        ? (await all(db, `select l.code, cl.status from public.stock_count_location cl join public.location l on l.id = cl.location_id
                          where cl.count_id = $1`, [open.id]))
        : [];
      const op = pick(['putaway', 'unshelve', 'create', 'scan', 'scan', 'scan', 'unlabeled', 'close', 'close', 'undo', 'reopen', 'approve', 'approve', 'cancel']);
      try {
        if (op === 'putaway') {
          await rpc(db, ids.gudang, 'putaway', { p_location: pick(racks), p_code: pick(ps).code });
        } else if (op === 'unshelve') {
          await rpc(db, ids.gudang, 'unshelve', { p_code: pick(ps).code, p_note: `fuzz ${i}` });
        } else if (op === 'create') {
          const chosen = racks.filter(() => rand() < 0.6);
          await create('gudang', chosen.length ? chosen : [pick(racks)]);
        } else if (!open) {
          continue;
        } else if (op === 'scan') {
          const r = pick(opRacks.filter((x) => x.status === 'menghitung').map((x) => x.code));
          if (!r) continue;
          await scan('gudang', open.id, r, pick(ps).code);
        } else if (op === 'unlabeled') {
          const r = pick(opRacks.filter((x) => x.status === 'menghitung').map((x) => x.code));
          if (!r) continue;
          await unlabeled('gudang', open.id, r, pick(['kemejaM', 'kemejaL']), r === 'RJ1' ? 'rusak' : 'baik', int(0, 2));
        } else if (op === 'close') {
          await close('gudang', open.id, pick(opRacks).code);
        } else if (op === 'undo') {
          await rpc(db, ids.spv, 'stock_count_undo', { p_count_id: open.id, p_location: pick(opRacks).code, p_code: pick(ps).code });
        } else if (op === 'reopen') {
          if (rand() < 0.5) continue;
          await rpc(db, ids.spv, 'stock_count_reopen_location', { p_count_id: open.id, p_location: pick(opRacks).code });
        } else if (op === 'approve') {
          await rpc(db, ids.spv, 'stock_count_approve', { p_count_id: open.id });
          done.approved++;
        } else {
          if (rand() < 0.7) continue;
          await rpc(db, ids.spv, 'stock_count_cancel', { p_count_id: open.id, p_note: `fuzz ${i}` });
          done.cancelled++;
        }
        ok++;
      } catch (e) {
        assert.ok(e.detail, `unexpected error at step ${i} (${op}): ${e.message}`);
        rejected[e.detail] = (rejected[e.detail] ?? 0) + 1;
      }
      const problems = await checkInvariants(db);
      assert.deepEqual(problems, [], `step ${i} (${op}):\n${problems.join('\n')}`);
    }
    console.log('stock count fuzz', { ok, rejected, ...done });
    assert.ok(done.approved >= 2, `too few approvals: ${JSON.stringify(done)}`);
    assert.ok((rejected.rack_locked ?? 0) > 0, 'the lock was never exercised');
  });
});

describe('stock count meets rework', () => {
  it('skips a damaged stok awal pcs in create_rework, and locks a rack against rework moves', async () => {
    const a = await stocked('kemejaM', 4, { ffReject: 1, rack: 'A1' });
    const op = await create('gudang', ['RJ1']);
    // a reject on a locked rack cannot be taken into rework
    const rej = await pieces(a, `and p.grade = 'reject'`);
    await rejects(rpc(db, ids.spv, 'create_rework', { p_codes: [rej[0].code], p_start_step: 'jahit', p_note: 'x' }), 'rack_locked');
    await scan('gudang', op.id, 'RJ1', rej[0].code);
    await unlabeled('gudang', op.id, 'RJ1', 'kemejaL', 'rusak', 1);
    await close('gudang', op.id, 'RJ1');
    await rpc(db, ids.spv, 'stock_count_approve', { p_count_id: op.id });

    await actAs(db, null);
    const awal = await one(db, `select code from public.piece where origin = 'stok_awal'`);
    await rejects(rpc(db, ids.spv, 'create_rework', { p_codes: [awal.code], p_start_step: 'jahit', p_note: 'x' }), /stok awal/);
    const res = await rpc(db, ids.spv, 'create_rework', { p_codes: [awal.code, rej[0].code], p_start_step: 'jahit', p_note: 'x' });
    assert.equal(res.created.length, 1);
    assert.equal(res.skipped[0].code, awal.code);
    await assertInvariants();
  });
});

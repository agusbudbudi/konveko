import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, seedFixture, rpc, one, all, actAs, checkInvariants } from './harness.mjs';

// Fase 2: reject and rework (doc/PRD Fase 2 - Reject dan rework.md).

let db;
let ids;

async function assertInvariants() {
  const problems = await checkInvariants(db);
  assert.deepEqual(problems, [], problems.join('\n'));
}

async function rejects(promise, detail) {
  await assert.rejects(promise, (e) => (detail instanceof RegExp ? detail.test(e.message) : e.detail === detail));
}

async function bundle(code) {
  await actAs(db, null);
  return one(db, `select * from public.bundle where code = $1`, [code]);
}

async function recon(code) {
  await actAs(db, null);
  return one(db, `select * from public.bundle_reconciliation where code = $1`, [code]);
}

async function batchOf(code) {
  await actAs(db, null);
  return one(db, `select br.* from public.batch_reconciliation br join public.bundle b on b.batch_id = br.batch_id
                  where b.code = $1`, [code]);
}

async function pieces(code, extra = '') {
  await actAs(db, null);
  return all(db, `select p.* from public.piece p join public.bundle b on b.id = p.bundle_id
                  where b.code = $1 and p.status <> 'batal' ${extra} order by p.code`, [code]);
}

async function newBundle(variant, qty) {
  const batch = await rpc(db, ids.produksi, 'create_batch', {
    p_fabric_roll_id: ids.roll,
    p_items: JSON.stringify([{ variant_id: ids[variant], qty }]),
  });
  return batch.bundles[0].code;
}

async function sew(code, user, qty, reject) {
  await rpc(db, ids[user], 'scan_receive', { p_code: code, p_qty_received: qty });
  return rpc(db, ids[user], 'scan_finish', {
    p_code: code, p_qty_good: qty - reject, p_qty_reject: reject, p_reason_id: reject ? ids.rReject : null,
  });
}

async function finish(code, qty, reject) {
  await rpc(db, ids.finishing, 'scan_receive', { p_code: code, p_qty_received: qty });
  return rpc(db, ids.finishing, 'scan_finish', {
    p_code: code, p_qty_good: qty - reject, p_qty_reject: reject, p_reason_id: reject ? ids.rReject : null,
  });
}

/** Print every unprinted active piece of a bundle and put it on A1 (good) / RJ1 (reject). */
async function shelve(code) {
  const ps = await pieces(code, `and p.status = 'aktif' and p.location_id is null`);
  if (!ps.length) return;
  const unprinted = ps.filter((p) => !p.printed_at).map((p) => p.id);
  if (unprinted.length) await rpc(db, ids.finishing, 'mark_printed', { p_piece_ids: unprinted });
  if (ps.some((p) => p.grade === 'baik' && p.condition === 'baik')) {
    await rpc(db, ids.gudang, 'putaway', { p_location: 'A1', p_code: code });
  }
  if (ps.some((p) => p.grade === 'reject' || p.condition === 'rusak')) {
    await rpc(db, ids.gudang, 'putaway', { p_location: 'RJ1', p_code: code });
  }
}

async function rework(user, codes, step, note = 'Jahitan lepas di bahu') {
  return rpc(db, ids[user], 'create_rework', { p_codes: codes, p_start_step: step, p_note: note });
}

beforeEach(async () => {
  db = await createDb();
  ids = await seedFixture(db);
});

describe('rework from a sewing reject', () => {
  it('goes back to jahit, comes out as new pieces, and the batch reconciles', async () => {
    const code = await newBundle('kemejaM', 20);
    await sew(code, 'ani', 20, 2);
    await finish(code, 18, 0);
    await shelve(code);
    assert.equal((await batchOf(code)).status, 'selesai');

    const rej = await pieces(code, `and p.grade = 'reject'`);
    assert.equal(rej.length, 2);
    assert.ok(rej.every((p) => p.location_id === ids.rakRJ));

    // reject notification for the sew scan is unread for the supervisor
    await actAs(db, null);
    const sewMove = await one(db, `select m.id from public.movement m join public.bundle b on b.id = m.bundle_id
                                   where b.code = $1 and m.type = 'finish_sew'`, [code]);
    const unread = async () => (await one(db,
      `select count(*)::int as n from public.notification where entity_id = $1 and read_at is null`, [sewMove.id])).n;
    assert.ok((await unread()) > 0);

    // finishing asked, but a sewing reject always goes back to jahit
    const res = await rework('spv', rej.map((p) => p.code), 'finishing');
    assert.equal(res.created.length, 1);
    const rw = res.created[0];
    assert.equal(rw.source, 'jahit');
    assert.equal(rw.start_step, 'jahit');
    assert.equal(rw.qty, 2);
    assert.equal(rw.of_code, code);
    assert.match(res.message, /2 pcs dikirim ke rework/);

    const child = await bundle(rw.code);
    assert.equal(child.current_status, 'siap_jahit');
    assert.equal(child.current_qty, 2);
    assert.equal(child.rework_of_bundle_id, (await bundle(code)).id);

    // old pieces left the reject rack and are in rework
    const old = await pieces(code, `and p.grade = 'reject'`);
    assert.ok(old.every((p) => p.status === 'rework' && p.location_id === null));

    // origin: net reject 0, reject_awal 2, reworked 2; batch back to berjalan
    const r0 = await recon(code);
    assert.deepEqual([r0.reject, r0.reject_awal, r0.reworked], [0, 2, 2]);
    const b0 = await batchOf(code);
    assert.equal(b0.status, 'berjalan');
    assert.deepEqual([b0.target, b0.ready, b0.reject, b0.wip, b0.reworked], [20, 18, 0, 2, 2]);
    assert.equal(await unread(), 0, 'reject notification settled');
    await assertInvariants();

    // the scan app sees a rework bundle
    const look = await rpc(db, ids.budi, 'scan_lookup', { p_code: child.qr_token });
    assert.equal(look.allowed, true);
    assert.equal(look.next_action, 'terima');
    assert.deepEqual(look.rework, { of_code: code, source: 'jahit', start_step: 'jahit', note: 'Jahitan lepas di bahu' });

    // another tailor repairs it; one is fixed, one stays reject
    await sew(rw.code, 'budi', 2, 0);
    await finish(rw.code, 2, 1);
    await shelve(rw.code);

    const b1 = await batchOf(code);
    assert.equal(b1.status, 'selesai');
    assert.deepEqual([b1.target, b1.ready, b1.reject, b1.wip, b1.selisih], [20, 19, 1, 0, 0]);
    assert.equal(b1.reject_awal, 3);
    const fresh = await pieces(rw.code);
    assert.deepEqual(fresh.map((p) => p.grade).sort(), ['baik', 'reject']);
    await actAs(db, null);
    const stock = await one(db, `select qty from public.stock_ready where sku = 'KMJ-PTH-M'`);
    assert.equal(stock.qty, 19);
    await assertInvariants();
  });
});

describe('rework from a finishing reject and a damaged return', () => {
  it('starts at finishing when asked, without a sewing scan', async () => {
    const code = await newBundle('kemejaL', 10);
    await sew(code, 'ani', 10, 0);
    await finish(code, 10, 3);
    await shelve(code);
    const rej = await pieces(code, `and p.grade = 'reject'`);

    const res = await rework('admin', [rej[0].qr_token, rej[1].code], 'finishing', 'Noda, cuci ulang');
    const rw = res.created[0];
    assert.equal(rw.source, 'finishing');
    assert.equal(rw.start_step, 'finishing');
    const child = await bundle(rw.code);
    assert.equal(child.current_status, 'siap_finishing');
    assert.equal(child.current_qty, 2);
    await assertInvariants();

    // penjahit has nothing to do; finishing receives the 2 pcs
    const look = await rpc(db, ids.ani, 'scan_lookup', { p_code: rw.code });
    assert.equal(look.allowed, false);
    await finish(rw.code, 2, 0);
    const b = await batchOf(code);
    assert.deepEqual([b.target, b.ready, b.reject, b.wip], [10, 9, 1, 0]);
    assert.equal(b.status, 'selesai');
    await assertInvariants();
  });

  it('repairs a damaged return without counting it as new production', async () => {
    const code = await newBundle('kemejaXL', 4);
    await sew(code, 'ani', 4, 0);
    await finish(code, 4, 0);
    await shelve(code);
    const [p] = await pieces(code);

    const doc = await rpc(db, ids.gudang, 'outbound_create', {
      p_type: 'jual', p_destination: 'Toko Sinar Jaya', p_ref_no: null, p_note: null, p_plan: null,
    });
    await rpc(db, ids.gudang, 'outbound_add', { p_outbound_id: doc.id, p_code: p.code });
    await rpc(db, ids.gudang, 'outbound_ship', { p_outbound_id: doc.id });
    await rpc(db, ids.gudang, 'piece_return', { p_code: p.code, p_condition: 'rusak', p_note: 'Sobek' });
    await shelve(code);
    const before = await batchOf(code);
    assert.equal(before.status, 'selesai');
    await actAs(db, null);
    const ledgerBefore = (await one(db, `select qty from public.stock_ready where sku = 'KMJ-PTH-XL'`)).qty;

    const res = await rework('spv', [p.code], 'jahit');
    const rw = res.created[0];
    assert.equal(rw.source, 'retur');
    assert.equal((await batchOf(code)).status, 'selesai', 'a return repair does not reopen the batch');
    assert.deepEqual(await batchOf(code), before, "batch numbers unchanged");

    await sew(rw.code, 'budi', 1, 0);
    await finish(rw.code, 1, 0);
    await actAs(db, null);
    assert.equal((await one(db, `select qty from public.stock_ready where sku = 'KMJ-PTH-XL'`)).qty, ledgerBefore);
    const fixed = await pieces(rw.code);
    assert.equal(fixed.length, 1);
    assert.equal(fixed[0].grade, 'baik');
    assert.equal(fixed[0].condition, 'baik');
    assert.equal((await batchOf(code)).ready, 4);
    await assertInvariants();

    // report: ready is production only; the repair shows as rework_good
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
    const rep = await rpc(db, ids.spv, 'production_report', { p_from: today, p_to: today });
    assert.equal(rep.totals.ready, 4);
    assert.equal(rep.totals.rework_good, 1);
    assert.equal(rep.totals.reworked, 1);
  });
});

describe('rework rules', () => {
  it('checks role, note, and which pieces can go', async () => {
    const code = await newBundle('kemejaM', 6);
    await sew(code, 'ani', 6, 1);
    await finish(code, 5, 1);
    await shelve(code);
    const good = await pieces(code, `and p.grade = 'baik'`);
    const rej = await pieces(code, `and p.grade = 'reject'`);

    await rejects(rework('ani', [rej[0].code], 'jahit'), 'forbidden_role');
    await rejects(rework('gudang', [rej[0].code], 'jahit'), 'forbidden_role');
    await rejects(rework('spv', [rej[0].code], 'jahit', '  '), 'note_required');
    await rejects(rework('spv', [], 'jahit'), 'codes_required');
    await rejects(rework('spv', [good[0].code, 'P-9999999'], 'jahit'), 'nothing_to_rework');

    // reserved on a BS document: skipped
    const doc = await rpc(db, ids.gudang, 'outbound_create', {
      p_type: 'jual_bs', p_destination: 'Pasar', p_ref_no: null, p_note: null, p_plan: null,
    });
    await rpc(db, ids.gudang, 'outbound_add', { p_outbound_id: doc.id, p_code: rej[1].code });

    const res = await rework('spv', [rej[0].code, rej[0].code, good[0].code, rej[1].code], 'finishing');
    assert.equal(res.created.length, 1);
    assert.equal(res.created[0].qty, 1);
    assert.deepEqual(res.skipped.map((s) => s.code).sort(), [good[0].code, rej[1].code].sort());
    await rejects(rework('spv', [rej[0].code], 'jahit'), /Sudah di rework/);
    await assertInvariants();
  });

  it('makes one rework bundle per origin bundle and source', async () => {
    const a = await newBundle('kemejaM', 5);
    const b = await newBundle('kemejaL', 5);
    await sew(a, 'ani', 5, 1);
    await finish(a, 4, 1);
    await sew(b, 'budi', 5, 1);
    await finish(b, 4, 0);
    const codes = [...await pieces(a, `and p.grade = 'reject'`), ...await pieces(b, `and p.grade = 'reject'`)].map((p) => p.code);
    assert.equal(codes.length, 3);

    const res = await rework('spv', codes, 'finishing');
    const got = res.created.map((c) => `${c.of_code}:${c.source}:${c.start_step}:${c.qty}`).sort();
    assert.deepEqual(got, [`${a}:finishing:finishing:1`, `${a}:jahit:jahit:1`, `${b}:jahit:jahit:1`].sort());
    await assertInvariants();
  });

  it('refuses a correction that would undo reworked pieces, and a split of a rework bundle', async () => {
    const code = await newBundle('kemejaM', 5);
    await sew(code, 'ani', 5, 0);
    const fin = await finish(code, 5, 2);
    const rej = await pieces(code, `and p.grade = 'reject'`);
    const res = await rework('spv', [rej[0].code], 'finishing');

    await rejects(rpc(db, ids.spv, 'correct_movement', {
      p_movement_id: fin.movement_id, p_note: 'Salah hitung', p_qty_good: 5, p_qty_reject: 0,
    }), 'pieces_in_rework');
    await rejects(rpc(db, ids.spv, 'correct_movement', {
      p_movement_id: fin.movement_id, p_note: 'Batal', p_void: true,
    }), 'pieces_in_rework');
    // the one reject not in rework can still be corrected away
    await rpc(db, ids.spv, 'correct_movement', {
      p_movement_id: fin.movement_id, p_note: 'Ternyata baik', p_qty_good: 4, p_qty_reject: 1,
    });
    await assertInvariants();

    // rework bundles start at finishing here; split only happens at siap_jahit, so use a jahit one
    const code2 = await newBundle('kemejaL', 4);
    await sew(code2, 'ani', 4, 2);
    const r2 = await rework('spv', (await pieces(code2, `and p.grade = 'reject'`)).map((p) => p.code), 'jahit');
    await rejects(rpc(db, ids.produksi, 'split_bundle', { p_code: r2.created[0].code, p_qtys: [1, 1] }), 'rework_bundle');
    assert.ok(res.created.length === 1);
  });

  it('cancels an unscanned rework and puts the pieces back on their rack', async () => {
    const code = await newBundle('kemejaM', 5);
    await sew(code, 'ani', 5, 0);
    await finish(code, 5, 2);
    await shelve(code);
    const rej = await pieces(code, `and p.grade = 'reject'`);
    const res = await rework('spv', rej.map((p) => p.code), 'finishing');
    const rw = res.created[0].code;
    assert.equal((await batchOf(code)).status, 'berjalan');

    await rejects(rpc(db, ids.finishing, 'cancel_rework', { p_code: rw, p_note: 'x' }), 'forbidden_role');
    await rejects(rpc(db, ids.spv, 'cancel_rework', { p_code: code, p_note: 'x' }), 'not_rework');
    await rejects(rpc(db, ids.spv, 'cancel_rework', { p_code: rw, p_note: ' ' }), 'note_required');

    const out = await rpc(db, ids.admin, 'cancel_rework', { p_code: rw, p_note: 'Tidak jadi, dijual BS' });
    assert.equal(out.pieces, 2);
    const back = await pieces(code, `and p.grade = 'reject'`);
    assert.ok(back.every((p) => p.status === 'aktif' && p.location_id === ids.rakRJ));
    assert.equal((await bundle(rw)).current_status, 'batal');
    const r = await recon(code);
    assert.deepEqual([r.reject, r.reworked], [2, 0]);
    assert.equal((await batchOf(code)).status, 'selesai');
    await rejects(rpc(db, ids.spv, 'cancel_rework', { p_code: rw, p_note: 'lagi' }), 'already_cancelled');

    const look = await rpc(db, ids.finishing, 'scan_lookup', { p_code: rw });
    assert.equal(look.allowed, false);
    assert.match(look.message, /dibatalkan/);
    await assertInvariants();

    // once scanned it cannot be cancelled
    const again = await rework('spv', [back[0].code], 'finishing');
    await rpc(db, ids.finishing, 'scan_receive', { p_code: again.created[0].code, p_qty_received: 1 });
    await rejects(rpc(db, ids.spv, 'cancel_rework', { p_code: again.created[0].code, p_note: 'x' }), 'already_scanned');
    await assertInvariants();
  });

  it('allows rework of a rework reject, and receiving short on a rework bundle', async () => {
    const code = await newBundle('kemejaM', 10);
    await sew(code, 'ani', 10, 3);
    const r1 = (await rework('spv', (await pieces(code, `and p.grade = 'reject'`)).map((p) => p.code), 'jahit')).created[0].code;

    // 3 sent, 2 arrive (selisih 1), 1 still reject
    await rpc(db, ids.budi, 'scan_receive', { p_code: r1, p_qty_received: 2, p_reason_id: ids.rSelisih });
    await rpc(db, ids.budi, 'scan_finish', { p_code: r1, p_qty_good: 1, p_qty_reject: 1, p_reason_id: ids.rReject });
    const r2 = (await rework('spv', (await pieces(r1, `and p.grade = 'reject'`)).map((p) => p.code), 'jahit')).created[0];
    assert.equal(r2.of_code, r1);
    await sew(r2.code, 'ani', 1, 0);
    await finish(code, 7, 0);
    await finish(r1, 1, 0);
    await finish(r2.code, 1, 0);

    const b = await batchOf(code);
    assert.deepEqual([b.target, b.ready, b.reject, b.wip, b.selisih], [10, 9, 0, 0, 1]);
    assert.equal(b.reworked, 4);
    await assertInvariants();
  });
});

describe('fuzz: rework, scans, corrections and cancels keep every invariant', () => {
  it('250 random steps', async () => {
    let seed = 11;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const int = (a, b) => a + Math.floor(rand() * (b - a + 1));
    const pick = (xs) => xs[Math.floor(rand() * xs.length)];


    let ok = 0;
    const rejected = {};
    for (let i = 0; i < 250; i++) {
      await actAs(db, null);
      let bundles = await all(db, `select code, current_status, current_qty, rework_of_bundle_id from public.bundle
                                   where current_status not in ('dipecah', 'batal') order by code`);
      // keep work flowing: fresh production whenever little is left in progress
      if (bundles.filter((x) => x.current_status !== 'ready_stock').length < 2) {
        await newBundle(pick(['kemejaM', 'kemejaL', 'kemejaXL']), int(3, 8));
        await actAs(db, null);
        bundles = await all(db, `select code, current_status, current_qty, rework_of_bundle_id from public.bundle
                                 where current_status not in ('dipecah', 'batal') order by code`);
      }
      const op = pick(['advance', 'advance', 'advance', 'rework', 'rework', 'cancel', 'correct', 'shelve']);
      try {
        if (op === 'advance') {
          const b = pick(bundles.filter((x) => x.current_status !== 'ready_stock'));
          if (!b) continue;
          const q = b.current_qty;
          const who = b.current_status.endsWith('jahit') ? ids.ani : ids.finishing;
          if (b.current_status.startsWith('siap')) {
            const got = rand() < 0.2 ? int(0, q) : q;
            await rpc(db, who, 'scan_receive', { p_code: b.code, p_qty_received: got, p_reason_id: ids.rSelisih });
          } else {
            const rej = rand() < 0.6 && q > 0 ? int(1, Math.min(q, 3)) : 0;
            await rpc(db, who, 'scan_finish', { p_code: b.code, p_qty_good: q - rej, p_qty_reject: rej, p_reason_id: ids.rReject });
          }
        } else if (op === 'rework') {
          const free = await all(db, `select code from public.piece where status = 'aktif' and grade = 'reject' and outbound_id is null`);
          if (!free.length) continue;
          const codes = Array.from({ length: int(1, 3) }, () => pick(free).code);
          await rework(pick(['spv', 'admin']), codes, pick(['jahit', 'finishing']), `fuzz ${i}`);
        } else if (op === 'cancel') {
          const kids = bundles.filter((x) => x.rework_of_bundle_id);
          if (!kids.length) continue;
          await rpc(db, ids.spv, 'cancel_rework', { p_code: pick(kids).code, p_note: `fuzz ${i}` });
        } else if (op === 'correct') {
          const b = pick(bundles);
          const last = await one(db, `select em.id, em.type, em.qty_sent, em.qty_received from public.effective_movement em
                                      join public.bundle b on b.id = em.bundle_id
                                      where b.code = $1 order by em.seq desc limit 1`, [b.code]);
          if (!last || ['cut', 'split', 'rework'].includes(last.type)) continue;
          if (rand() < 0.4) {
            await rpc(db, ids.spv, 'correct_movement', { p_movement_id: last.id, p_note: `fuzz ${i}`, p_void: true });
          } else if (last.type.startsWith('finish')) {
            const rej = int(0, last.qty_received);
            await rpc(db, ids.spv, 'correct_movement', {
              p_movement_id: last.id, p_note: `fuzz ${i}`, p_qty_good: last.qty_received - rej,
              p_qty_reject: rej, p_reason_id: ids.rReject,
            });
          } else {
            await rpc(db, ids.spv, 'correct_movement', {
              p_movement_id: last.id, p_note: `fuzz ${i}`, p_qty_received: int(0, last.qty_sent), p_reason_id: ids.rSelisih,
            });
          }
        } else {
          const b = pick(bundles);
          await shelve(b.code);
        }
        ok++;
      } catch (e) {
        assert.ok(e.detail, `unexpected error at step ${i} (${op}): ${e.message}`);
        rejected[e.detail] = (rejected[e.detail] ?? 0) + 1;
      }
      const problems = await checkInvariants(db);
      assert.deepEqual(problems, [], `step ${i} (${op}):\n${problems.join('\n')}`);
    }
    await actAs(db, null);
    const made = await one(db, `select count(*) filter (where rework_of_bundle_id is not null)::int as rework,
                                       count(*) filter (where cancelled_at is not null)::int as cancelled
                                from public.bundle`);
    console.log('rework fuzz', { ok, rejected, ...made });
    assert.ok(ok > 100, `too few successful operations (${ok})`);
    assert.ok(made.rework >= 5 && made.cancelled >= 1, `fuzz did not exercise rework enough: ${JSON.stringify(made)}`);
  });
});

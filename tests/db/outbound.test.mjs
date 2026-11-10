import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, seedFixture, rpc, one, all, actAs, checkInvariants } from './harness.mjs';

// Fase 2b: outbound documents (surat jalan), returns, stock adjustments.

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

async function pieces(code, extra = '') {
  await actAs(db, null);
  return all(db, `select p.* from public.piece p join public.bundle b on b.id = p.bundle_id
                  where b.code = $1 and p.status <> 'batal' ${extra} order by p.code`, [code]);
}

/** A bundle through sewing and finishing, labels printed, good pieces on A1 and rejects on RJ1. */
async function stocked(variant, qty, ffReject = 0) {
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
  await rpc(db, ids.gudang, 'putaway', { p_location: 'A1', p_code: code });
  if (ffReject) await rpc(db, ids.gudang, 'putaway', { p_location: 'RJ1', p_code: code });
  return code;
}

async function newDoc(user, type, extra = {}) {
  return rpc(db, user, 'outbound_create', {
    p_type: type, p_destination: extra.destination ?? 'Toko Sinar Jaya', p_ref_no: extra.ref ?? null,
    p_note: extra.note ?? null, p_plan: extra.plan ? JSON.stringify(extra.plan) : null,
  });
}

async function stockOf(sku) {
  await actAs(db, null);
  return all(db, `select grade, location_code, qty from public.stock_location where sku = $1 order by grade, location_code`, [sku]);
}

beforeEach(async () => {
  db = await createDb();
  ids = await seedFixture(db);
});

describe('outbound: draft, scan, ship', () => {
  it('ships a jual document; production stays reconciled, stock drops', async () => {
    const code = await stocked('kemejaM', 10, 2);
    const ps = await pieces(code);
    const good = ps.filter((p) => p.grade === 'baik');
    const bad = ps.filter((p) => p.grade === 'reject');

    await rejects(newDoc(ids.ani, 'jual'), 'forbidden_role');
    await rejects(newDoc(ids.gudang, 'jual', { destination: '  ' }), 'destination_required');
    const doc = await newDoc(ids.gudang, 'jual', { ref: 'PO-118', plan: [{ variant_id: ids.kemejaM, qty: 5 }] });
    assert.match(doc.code, /^SJ-\d{6}$/);

    // one piece by its QR token
    const r1 = await rpc(db, ids.gudang, 'outbound_add', { p_outbound_id: doc.id, p_code: good[0].qr_token });
    assert.equal(r1.added, 1);
    assert.equal(r1.total, 1);
    await rejects(rpc(db, ids.gudang, 'outbound_add', { p_outbound_id: doc.id, p_code: good[0].code }), 'dipesan');
    await rejects(rpc(db, ids.gudang, 'outbound_add', { p_outbound_id: doc.id, p_code: bad[0].code }), 'bs');

    // reserved pieces stay on their rack and in stock, but cannot be unshelved
    assert.deepEqual(await stockOf('KMJ-PTH-M'), [
      { grade: 'baik', location_code: 'A1', qty: 8 },
      { grade: 'reject', location_code: 'RJ1', qty: 2 },
    ]);
    await rejects(rpc(db, ids.gudang, 'unshelve', { p_code: good[0].code, p_note: 'coba' }), 'reserved');

    // the bundle label adds the remaining 7 good pieces and skips the rest
    const r2 = await rpc(db, ids.gudang, 'outbound_add', { p_outbound_id: doc.id, p_code: code });
    assert.equal(r2.added, 7);
    assert.deepEqual(r2.skipped, { bs: 2, dipesan: 1 });
    assert.equal(r2.total, 8);
    assert.match(r2.warning, /Melebihi rencana: Kemeja M · Putih 8\/5/);
    assert.equal(r2.progress[0].scanned, 8);
    assert.equal(r2.progress[0].planned, 5);
    await assertInvariants();

    // remove one, then ship 7
    await rpc(db, ids.gudang, 'outbound_remove', { p_outbound_id: doc.id, p_code: good[7].code });
    const shipped = await rpc(db, ids.gudang, 'outbound_ship', { p_outbound_id: doc.id });
    assert.equal(shipped.shipped, 7);
    assert.equal(shipped.message, `${doc.code}: 7 pcs dikirim ke Toko Sinar Jaya.`);

    await actAs(db, null);
    const o = await one(db, `select status, shipped_at is not null as shipped from public.outbound where id = $1`, [doc.id]);
    assert.deepEqual(o, { status: 'dikirim', shipped: true });
    assert.deepEqual(await stockOf('KMJ-PTH-M'), [
      { grade: 'baik', location_code: 'A1', qty: 1 },
      { grade: 'reject', location_code: 'RJ1', qty: 2 },
    ]);
    const recon = await one(db, `select ready, reject from public.bundle_reconciliation where code = $1`, [code]);
    assert.deepEqual(recon, { ready: 8, reject: 2 }, 'shipped pieces still count as produced');
    const ev = await all(db, `select type from public.piece_event where piece_id = $1 order by seq`, [good[0].id]);
    assert.deepEqual(ev.map((e) => e.type), ['dibuat', 'cetak', 'masuk_rak', 'dipesan', 'keluar']);

    // a shipped document is closed
    await rejects(rpc(db, ids.gudang, 'outbound_ship', { p_outbound_id: doc.id }), 'not_draft');
    await rejects(rpc(db, ids.gudang, 'outbound_add', { p_outbound_id: doc.id, p_code: good[7].code }), 'not_draft');
    await rejects(rpc(db, ids.gudang, 'outbound_cancel', { p_outbound_id: doc.id }), 'not_draft');
    // a shipped piece cannot go on a rack or into another document
    await rejects(rpc(db, ids.gudang, 'putaway', { p_location: 'A2', p_code: good[0].code }), 'piece_shipped');
    const doc2 = await newDoc(ids.gudang, 'jual');
    await rejects(rpc(db, ids.gudang, 'outbound_add', { p_outbound_id: doc2.id, p_code: good[0].code }), 'sudah_keluar');
    await assertInvariants();
  });

  it('refuses an empty ship and unknown codes; cancel releases pieces', async () => {
    const code = await stocked('kemejaL', 4);
    const doc = await newDoc(ids.gudang, 'kirim_toko', { destination: 'Toko cabang Bandung' });
    await rejects(rpc(db, ids.gudang, 'outbound_ship', { p_outbound_id: doc.id }), 'empty');
    await rejects(rpc(db, ids.gudang, 'outbound_add', { p_outbound_id: doc.id, p_code: 'P-9999999' }), 'not_found');

    await rpc(db, ids.gudang, 'outbound_add', { p_outbound_id: doc.id, p_code: code });
    const c = await rpc(db, ids.gudang, 'outbound_cancel', { p_outbound_id: doc.id });
    assert.equal(c.released, 4);
    await actAs(db, null);
    assert.equal((await one(db, `select count(*)::int as n from public.piece where outbound_id is not null`)).n, 0);

    // released pieces can go on a new document
    const doc2 = await newDoc(ids.gudang, 'sampel', { destination: 'Pameran' });
    assert.equal((await rpc(db, ids.gudang, 'outbound_add', { p_outbound_id: doc2.id, p_code: code })).added, 4);
    await assertInvariants();
  });

  it('jual_bs takes only reject or damaged pieces', async () => {
    const code = await stocked('kemejaXL', 5, 2);
    const ps = await pieces(code);
    const doc = await newDoc(ids.gudang, 'jual_bs', { destination: 'Pengepul BS' });
    await rejects(rpc(db, ids.gudang, 'outbound_add', { p_outbound_id: doc.id, p_code: ps.find((p) => p.grade === 'baik').code }), 'bukan_bs');
    const r = await rpc(db, ids.gudang, 'outbound_add', { p_outbound_id: doc.id, p_code: code });
    assert.equal(r.added, 2);
    assert.deepEqual(r.skipped, { bukan_bs: 3 });
    await rpc(db, ids.gudang, 'outbound_ship', { p_outbound_id: doc.id });
    assert.deepEqual(await stockOf('KMJ-PTH-XL'), [{ grade: 'baik', location_code: 'A1', qty: 3 }]);
    await assertInvariants();
  });
});

describe('returns', () => {
  it('a good return goes back to stock; a damaged one only to the reject rack and BS', async () => {
    const code = await stocked('kemejaM', 3);
    const [a, b] = await pieces(code);
    const doc = await newDoc(ids.gudang, 'jual');
    await rpc(db, ids.gudang, 'outbound_add', { p_outbound_id: doc.id, p_code: code });
    await rpc(db, ids.gudang, 'outbound_ship', { p_outbound_id: doc.id });

    await rejects(rpc(db, ids.ani, 'piece_return', { p_code: a.code, p_condition: 'baik', p_note: 'x' }), 'forbidden_role');
    await rejects(rpc(db, ids.gudang, 'piece_return', { p_code: a.code, p_condition: 'baik', p_note: ' ' }), 'note_required');

    const r1 = await rpc(db, ids.gudang, 'piece_return', { p_code: a.qr_token, p_condition: 'baik', p_note: 'Salah ukuran' });
    assert.equal(r1.message, `Pcs ${a.code} kembali dari ${doc.code} (baik). Masukkan ke rak stok.`);
    await rejects(rpc(db, ids.gudang, 'piece_return', { p_code: a.code, p_condition: 'baik', p_note: 'lagi' }), 'not_shipped');
    await actAs(db, null);
    const unshelved = await one(db, `select baik, reject from public.bundle_unshelved where code = $1`, [code]);
    assert.deepEqual(unshelved, { baik: 1, reject: 0 });
    await rpc(db, ids.gudang, 'putaway', { p_location: 'A1', p_code: a.code });

    const r2 = await rpc(db, ids.gudang, 'piece_return', { p_code: b.code, p_condition: 'rusak', p_note: 'Sobek' });
    assert.match(r2.message, /Masukkan ke rak reject\.$/);
    await rejects(rpc(db, ids.gudang, 'putaway', { p_location: 'A1', p_code: b.code }), 'wrong_rack_kind');
    await rpc(db, ids.gudang, 'putaway', { p_location: 'RJ1', p_code: b.code });
    assert.deepEqual(await stockOf('KMJ-PTH-M'), [
      { grade: 'baik', location_code: 'A1', qty: 1 },
      { grade: 'reject', location_code: 'RJ1', qty: 1 },
    ]);

    // the damaged piece can leave again only as BS; the good one ships normally
    const doc2 = await newDoc(ids.gudang, 'jual');
    await rejects(rpc(db, ids.gudang, 'outbound_add', { p_outbound_id: doc2.id, p_code: b.code }), 'bs');
    assert.equal((await rpc(db, ids.gudang, 'outbound_add', { p_outbound_id: doc2.id, p_code: a.code })).added, 1);
    const bs = await newDoc(ids.gudang, 'jual_bs', { destination: 'Pengepul BS' });
    assert.equal((await rpc(db, ids.gudang, 'outbound_add', { p_outbound_id: bs.id, p_code: b.code })).added, 1);

    await actAs(db, null);
    const recon = await one(db, `select ready, reject from public.bundle_reconciliation where code = $1`, [code]);
    assert.deepEqual(recon, { ready: 3, reject: 0 }, 'returns do not change production');
    const evB = await all(db, `select type from public.piece_event where piece_id = $1 order by seq`, [b.id]);
    assert.deepEqual(evB.map((e) => e.type), ['dibuat', 'cetak', 'masuk_rak', 'dipesan', 'keluar', 'retur', 'masuk_rak', 'dipesan']);
    await assertInvariants();
  });
});

describe('stock adjustments', () => {
  it('only a supervisor writes off stock, always with a reason', async () => {
    const code = await stocked('kemejaL', 2);
    await rejects(newDoc(ids.gudang, 'penyesuaian', { destination: 'Penyesuaian stok', note: 'Hilang' }), 'forbidden_role');
    await rejects(newDoc(ids.spv, 'penyesuaian', { destination: 'Penyesuaian stok' }), 'note_required');
    const doc = await newDoc(ids.spv, 'penyesuaian', { destination: 'Penyesuaian stok', note: 'Hilang saat stok opname' });
    // gudang cannot fill or ship a supervisor's adjustment
    await rejects(rpc(db, ids.gudang, 'outbound_add', { p_outbound_id: doc.id, p_code: code }), 'forbidden_role');
    await rpc(db, ids.spv, 'outbound_add', { p_outbound_id: doc.id, p_code: code });
    const s = await rpc(db, ids.spv, 'outbound_ship', { p_outbound_id: doc.id });
    assert.equal(s.message, `${doc.code}: 2 pcs dikeluarkan dari stok.`);
    assert.deepEqual(await stockOf('KMJ-PTH-L'), []);
    await assertInvariants();
  });
});

describe('corrections and shipped pieces', () => {
  it('a correction cannot void shipped or reserved pieces', async () => {
    const code = await stocked('kemejaM', 4);
    await actAs(db, null);
    const ff = await one(db, `select m.id from public.movement m join public.bundle b on b.id = m.bundle_id
                              where m.type = 'finish_finishing' and b.code = $1`, [code]);
    // reserved first, then shipped: both block a correction that would void them
    const doc = await newDoc(ids.gudang, 'jual');
    await rpc(db, ids.gudang, 'outbound_add', { p_outbound_id: doc.id, p_code: code });
    await rejects(rpc(db, ids.spv, 'correct_movement', {
      p_movement_id: ff.id, p_note: 'Salah hitung', p_qty_good: 3, p_qty_reject: 1, p_reason_id: ids.rReject,
    }), 'pieces_shelved');
    await rpc(db, ids.gudang, 'outbound_ship', { p_outbound_id: doc.id });
    await rejects(rpc(db, ids.spv, 'correct_movement', {
      p_movement_id: ff.id, p_note: 'Salah hitung', p_qty_good: 3, p_qty_reject: 1, p_reason_id: ids.rReject,
    }), /sudah dipesan atau dikirim/);
    await actAs(db, null);
    const counts = await one(db, `select count(*) filter (where status = 'keluar')::int as keluar,
                                         count(*) filter (where status = 'aktif')::int as aktif
                                  from public.piece p join public.bundle b on b.id = p.bundle_id where b.code = $1`, [code]);
    assert.deepEqual(counts, { keluar: 4, aktif: 0 }, 'the refused correction changed nothing');
    await assertInvariants();
  });
});

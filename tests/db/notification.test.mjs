import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, seedFixture, rpc, one, all, actAs } from './harness.mjs';

let db;
let ids;

beforeEach(async () => {
  db = await createDb();
  ids = await seedFixture(db);
});

async function newBundle(qty = 20) {
  const batch = await rpc(db, ids.produksi, 'create_batch', {
    p_fabric_roll_id: ids.roll,
    p_items: JSON.stringify([{ variant_id: ids.kemejaM, qty }]),
  });
  return batch.bundles[0].code;
}

async function receiveShort(code, received = 17) {
  return rpc(db, ids.ani, 'scan_receive', { p_code: code, p_qty_received: received, p_reason_id: ids.rSelisih });
}

async function notifications() {
  await actAs(db, null);
  return all(db, `select n.user_id, n.type, n.entity_type, n.data, n.read_at from public.notification n order by n.user_id`);
}

/** Read the notification table as an authenticated user, through RLS. */
async function asUser(userId, sql, params = []) {
  await actAs(db, userId);
  await db.exec(`set role authenticated`);
  try {
    return (await db.query(sql, params)).rows;
  } finally {
    await db.exec(`reset role`);
  }
}

describe('selisih notification', () => {
  it('notifies active admins and supervisors, with the event data', async () => {
    const code = await newBundle(20);
    await receiveShort(code, 17);

    const rows = await notifications();
    const recipients = rows.map((r) => r.user_id).sort();
    assert.deepEqual(recipients, [ids.admin, ids.spv].sort());
    const n = rows[0];
    assert.equal(n.type, 'selisih.baru');
    assert.equal(n.entity_type, 'discrepancy');
    assert.equal(n.read_at, null);
    assert.equal(n.data.bundle_code, code);
    assert.equal(n.data.qty, 3);
    assert.equal(n.data.qty_sent, 20);
    assert.equal(n.data.qty_received, 17);
    assert.equal(n.data.from_step, 'produksi');
    assert.equal(n.data.to_step, 'jahit');
    assert.equal(n.data.receiver, 'Ani');
    assert.ok(n.data.reason);
  });

  it('does nothing when the receive matches', async () => {
    const code = await newBundle(20);
    await rpc(db, ids.ani, 'scan_receive', { p_code: code, p_qty_received: 20 });
    assert.equal((await notifications()).length, 0);
  });

  it('skips inactive users and the person who scanned', async () => {
    await db.query(`update public.app_user set is_active = false where id = $1`, [ids.admin]);
    // A supervisor who also receives as a tailor does not notify themselves.
    await db.query(`update public.app_user set roles = '{supervisor,penjahit}', holder_id = $2 where id = $1`,
      [ids.spv, ids.hBudi]);
    const code = await newBundle(20);
    await rpc(db, ids.spv, 'scan_receive', { p_code: code, p_qty_received: 18, p_reason_id: ids.rSelisih });
    assert.equal((await notifications()).length, 0);
  });

  it('marks everyone read when the flag is resolved', async () => {
    const code = await newBundle(20);
    await receiveShort(code);
    const flag = await one(db, `select id from public.discrepancy`);
    await rpc(db, ids.spv, 'resolve_discrepancy', { p_discrepancy_id: flag.id, p_note: 'Dihitung ulang' });
    const rows = await notifications();
    assert.equal(rows.length, 2);
    assert.ok(rows.every((r) => r.read_at !== null));
  });

  it('follows corrections: new qty, then settled when the selisih becomes 0', async () => {
    const code = await newBundle(20);
    await receiveShort(code, 17);
    const mv = await one(db, `select movement_id from public.discrepancy`);

    await rpc(db, ids.spv, 'correct_movement', { p_movement_id: mv.movement_id, p_note: 'Salah hitung', p_qty_received: 19 });
    let rows = await notifications();
    assert.ok(rows.every((r) => r.data.qty === 1 && r.data.qty_received === 19 && r.read_at === null));

    await rpc(db, ids.spv, 'correct_movement', { p_movement_id: mv.movement_id, p_note: 'Lengkap', p_qty_received: 20 });
    rows = await notifications();
    assert.ok(rows.every((r) => r.read_at !== null));
  });
});

describe('reject notification', () => {
  async function toFinish(code, qty) {
    await rpc(db, ids.ani, 'scan_receive', { p_code: code, p_qty_received: qty });
  }
  const rejects = async () => (await notifications()).filter((n) => n.type === 'reject.baru');

  it('notifies admins and supervisors on reject at jahit and finishing', async () => {
    const code = await newBundle(20);
    await toFinish(code, 20);
    await rpc(db, ids.ani, 'scan_finish', { p_code: code, p_qty_good: 18, p_qty_reject: 2, p_reason_id: ids.rReject });

    let rows = await rejects();
    assert.deepEqual(rows.map((r) => r.user_id).sort(), [ids.admin, ids.spv].sort());
    const n = rows[0];
    assert.equal(n.entity_type, 'movement');
    assert.deepEqual(
      { code: n.data.bundle_code, step: n.data.step, in: n.data.qty_in, good: n.data.qty_good, reject: n.data.qty_reject, worker: n.data.worker },
      { code, step: 'jahit', in: 20, good: 18, reject: 2, worker: 'Ani' },
    );
    assert.ok(n.data.reason);

    await rpc(db, ids.finishing, 'scan_receive', { p_code: code, p_qty_received: 18 });
    await rpc(db, ids.finishing, 'scan_finish', { p_code: code, p_qty_good: 17, p_qty_reject: 1, p_reason_id: ids.rReject });
    rows = await rejects();
    assert.equal(rows.length, 4);
    assert.ok(rows.some((r) => r.data.step === 'finishing' && r.data.qty_reject === 1 && r.data.worker === 'Finishing A'));
  });

  it('does nothing without reject', async () => {
    const code = await newBundle(20);
    await toFinish(code, 20);
    await rpc(db, ids.ani, 'scan_finish', { p_code: code, p_qty_good: 20, p_qty_reject: 0 });
    assert.equal((await rejects()).length, 0);
  });

  it('follows corrections: new numbers, added reject, settled at 0 or void', async () => {
    const code = await newBundle(20);
    await toFinish(code, 20);
    const fin = await rpc(db, ids.ani, 'scan_finish', { p_code: code, p_qty_good: 18, p_qty_reject: 2, p_reason_id: ids.rReject });

    await rpc(db, ids.spv, 'correct_movement', { p_movement_id: fin.movement_id, p_note: 'Hitung ulang', p_qty_good: 17, p_qty_reject: 3 });
    let rows = await rejects();
    assert.equal(rows.length, 2);
    assert.ok(rows.every((r) => r.data.qty_reject === 3 && r.data.qty_good === 17 && r.read_at === null));

    await rpc(db, ids.spv, 'correct_movement', { p_movement_id: fin.movement_id, p_note: 'Ternyata bagus', p_qty_good: 20, p_qty_reject: 0 });
    rows = await rejects();
    assert.ok(rows.every((r) => r.read_at !== null));

    // A finish scan without reject that a correction turns into reject.
    const code2 = await newBundle(10);
    await toFinish(code2, 10);
    const fin2 = await rpc(db, ids.ani, 'scan_finish', { p_code: code2, p_qty_good: 10, p_qty_reject: 0 });
    await rpc(db, ids.spv, 'correct_movement', { p_movement_id: fin2.movement_id, p_note: 'Ada yang cacat', p_qty_good: 9, p_qty_reject: 1, p_reason_id: ids.rReject });
    rows = (await rejects()).filter((r) => r.data.bundle_code === code2);
    assert.equal(rows.length, 2);
    assert.ok(rows.every((r) => r.data.qty_reject === 1 && r.read_at === null));

    await rpc(db, ids.spv, 'correct_movement', { p_movement_id: fin2.movement_id, p_note: 'Batal', p_void: true });
    rows = (await rejects()).filter((r) => r.data.bundle_code === code2);
    assert.ok(rows.every((r) => r.read_at !== null));
  });

  it('queues email only when reject.baru × email is switched on', async () => {
    await db.query(`update public.notification_channel_setting set is_enabled = true where type = 'reject.baru'`);
    const code = await newBundle(20);
    await receiveShort(code, 18); // selisih: switch off, no queue
    await rpc(db, ids.ani, 'scan_finish', { p_code: code, p_qty_good: 17, p_qty_reject: 1, p_reason_id: ids.rReject });
    await actAs(db, null);
    const q = await all(db, `select n.type from public.notification_delivery d join public.notification n on n.id = d.notification_id`);
    assert.deepEqual(q.map((r) => r.type), ['reject.baru', 'reject.baru']);
  });
});

describe('inbox access', () => {
  it('users see and mark only their own notifications', async () => {
    const code = await newBundle(20);
    await receiveShort(code);

    assert.equal((await asUser(ids.spv, `select id from public.notification`)).length, 1);
    assert.equal((await asUser(ids.ani, `select id from public.notification`)).length, 0);
    await assert.rejects(
      asUser(ids.spv, `update public.notification set read_at = now()`),
      /permission denied/,
    );
    await assert.rejects(asUser(ids.spv, `select * from public.notification_delivery`), /permission denied/);

    assert.equal(await rpc(db, ids.ani, 'mark_notifications_read', {}), 0);
    assert.equal(await rpc(db, ids.spv, 'mark_notifications_read', {}), 1);
    const rows = await notifications();
    assert.equal(rows.find((r) => r.user_id === ids.spv).read_at !== null, true);
    assert.equal(rows.find((r) => r.user_id === ids.admin).read_at, null);
  });

  it('marks selected ids only', async () => {
    await receiveShort(await newBundle(20));
    await receiveShort(await newBundle(10), 8);
    const [first] = await asUser(ids.spv, `select id from public.notification order by created_at limit 1`);
    assert.equal(await rpc(db, ids.spv, 'mark_notifications_read', { p_ids: `{${first.id}}` }), 1);
    const unread = await asUser(ids.spv, `select id from public.notification where read_at is null`);
    assert.equal(unread.length, 1);
  });

  it('only admins see channel settings', async () => {
    assert.equal((await asUser(ids.admin, `select * from public.notification_channel_setting`)).length, 2);
    assert.equal((await asUser(ids.ani, `select * from public.notification_channel_setting`)).length, 0);
  });
});

describe('external delivery queue', () => {
  async function queue() {
    await actAs(db, null);
    return all(db, `select id, channel, status, attempts, last_error, sent_at from public.notification_delivery`);
  }

  it('stays empty while the email switch is off', async () => {
    await receiveShort(await newBundle(20));
    assert.equal((await queue()).length, 0);
  });

  it('queues one email per recipient when switched on, and drops them on resolve', async () => {
    await db.query(`update public.notification_channel_setting set is_enabled = true where type = 'selisih.baru'`);
    await receiveShort(await newBundle(20));
    let q = await queue();
    assert.equal(q.length, 2);
    assert.ok(q.every((d) => d.channel === 'email' && d.status === 'antre'));

    const flag = await one(db, `select id from public.discrepancy`);
    await rpc(db, ids.spv, 'resolve_discrepancy', { p_discrepancy_id: flag.id, p_note: 'OK' });
    q = await queue();
    assert.ok(q.every((d) => d.status === 'dilewati'));
  });

  it('claims with a lease, retries with backoff, gives up after 5 attempts', async () => {
    await db.query(`update public.notification_channel_setting set is_enabled = true where type = 'selisih.baru'`);
    await db.query(`update public.app_user set email = 'spv@example.com' where id = $1`, [ids.spv]);
    await receiveShort(await newBundle(20));

    const claimed = await all(db, `select * from public.claim_notification_deliveries(10)`);
    assert.equal(claimed.length, 2);
    const spv = claimed.find((c) => c.user_id === ids.spv);
    assert.equal(spv.user_email, 'spv@example.com');
    assert.equal(spv.type, 'selisih.baru');
    assert.equal(spv.attempts, 1);
    // Leased rows are not handed out twice.
    assert.equal((await all(db, `select * from public.claim_notification_deliveries(10)`)).length, 0);

    await db.query(`select public.finish_notification_delivery($1, 'terkirim')`, [spv.delivery_id]);
    const other = claimed.find((c) => c.user_id !== ids.spv);
    await db.query(`select public.finish_notification_delivery($1, 'gagal', 'timeout')`, [other.delivery_id]);

    let q = await queue();
    assert.equal(q.find((d) => d.id === spv.delivery_id).status, 'terkirim');
    const retry = q.find((d) => d.id === other.delivery_id);
    assert.equal(retry.status, 'antre');
    assert.equal(retry.last_error, 'timeout');

    // Make it due again four more times; the fifth failure is final.
    for (let i = 0; i < 4; i++) {
      await db.query(`update public.notification_delivery set next_attempt_at = now() where id = $1`, [other.delivery_id]);
      const [c] = await all(db, `select * from public.claim_notification_deliveries(10)`);
      assert.equal(c.delivery_id, other.delivery_id);
      await db.query(`select public.finish_notification_delivery($1, 'gagal', 'timeout')`, [c.delivery_id]);
    }
    q = await queue();
    const gave = q.find((d) => d.id === other.delivery_id);
    assert.equal(gave.attempts, 5);
    assert.equal(gave.status, 'gagal');
  });

  it('is not callable by signed-in users', async () => {
    await assert.rejects(
      asUser(ids.admin, `select * from public.claim_notification_deliveries(10)`),
      /permission denied/,
    );
  });
});

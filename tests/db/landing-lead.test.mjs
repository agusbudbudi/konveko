import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, one, all } from './harness.mjs';

let db;

beforeEach(async () => {
  db = await createDb();
});

const submit = async (name, phone, size = '11-30', ip = '10.0.0.1') =>
  (await one(db, `select public.landing_lead_submit($1, $2, $3, $4) as r`, [name, phone, size, ip])).r;

describe('landing lead form', () => {
  it('stores a lead with the IP hashed, not in the clear', async () => {
    assert.equal(await submit('  Bu Rina ', '6281200000001'), 'ok');
    const rows = await all(db, `select name, phone, team_size, ip_hash from public.landing_lead`);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].name, 'Bu Rina');
    assert.equal(rows[0].team_size, '11-30');
    assert.notEqual(rows[0].ip_hash, '10.0.0.1');
  });

  it('does not store the same phone twice within a day', async () => {
    assert.equal(await submit('Rina', '6281200000001'), 'ok');
    assert.equal(await submit('Rina', '6281200000001'), 'duplicate');
    assert.equal((await one(db, `select count(*)::int as n from public.landing_lead`)).n, 1);
  });

  it('refuses the sixth submission from one IP within an hour, other IPs still pass', async () => {
    for (let i = 1; i <= 5; i++) assert.equal(await submit('Rina', `628120000010${i}`), 'ok');
    assert.equal(await submit('Rina', '6281200000199'), 'rate_limited');
    assert.equal(await submit('Rina', '6281200000199', '11-30', '10.0.0.2'), 'ok');
  });

  it('does not rate limit when the IP is unknown', async () => {
    for (let i = 1; i <= 7; i++) assert.equal(await submit('Rina', `628120000020${i}`, null, 'unknown'), 'ok');
  });

  it('rejects a malformed phone or team size', async () => {
    await assert.rejects(submit('Rina', '0812'));
    await assert.rejects(submit('Rina', '6281200000001', 'banyak'));
  });

  it('is closed to anon and signed-in users', async () => {
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`);
      try {
        await assert.rejects(db.query(`select * from public.landing_lead`));
        await assert.rejects(db.query(`select public.landing_lead_submit('Rina', '6281200000001', null, null)`));
      } finally {
        await db.exec(`reset role`);
      }
    }
  });
});

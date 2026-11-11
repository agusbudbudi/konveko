// Notification registry, channels and dispatcher. Node strips the TypeScript types itself.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderNotification, renderEmail, timeAgo } from '../../lib/notifications/registry.ts';
import { deliverableEmail, logEmailChannel, resolveChannel } from '../../lib/notifications/channels.ts';
import { dispatchPending } from '../../lib/notifications/dispatch.ts';

const selisih = {
  type: 'selisih.baru',
  entity_type: 'discrepancy',
  entity_id: 'd1',
  data: {
    bundle_id: 'b1',
    bundle_code: 'B-00012',
    qty: 3,
    qty_sent: 50,
    qty_received: 47,
    from_step: 'produksi',
    to_step: 'jahit',
    reason: 'Kurang hitung',
    receiver: 'Siti',
  },
};

test('selisih renders title, body and bundle link', () => {
  const r = renderNotification(selisih);
  assert.equal(r.title, 'Selisih 3 pcs di B-00012');
  assert.equal(r.body, 'Terima jahit oleh Siti: 47 dari 50 pcs. Alasan: Kurang hitung.');
  assert.equal(r.href, '/bundle/b1');
  assert.equal(r.tone, 'warning');
});

test('selisih without reason or bundle id still reads', () => {
  const r = renderNotification({ ...selisih, data: { ...selisih.data, reason: null, bundle_id: undefined } });
  assert.equal(r.body, 'Terima jahit oleh Siti: 47 dari 50 pcs.');
  assert.equal(r.href, '/selisih');
});

test('reject renders per step', () => {
  const base = {
    type: 'reject.baru',
    entity_type: 'movement',
    entity_id: 'm1',
    data: { bundle_id: 'b1', bundle_code: 'B-00012', step: 'jahit', qty_in: 20, qty_good: 18, qty_reject: 2, reason: 'Jahitan', worker: 'Ani' },
  };
  let r = renderNotification(base);
  assert.equal(r.title, 'Reject 2 pcs di B-00012');
  assert.equal(r.body, 'Selesai jahit oleh Ani: 18 jadi, 2 reject dari 20 pcs. Alasan: Jahitan.');
  assert.equal(r.href, '/bundle/b1');
  assert.equal(r.tone, 'danger');

  r = renderNotification({ ...base, data: { ...base.data, step: 'finishing', worker: 'Finishing A', reason: null } });
  assert.equal(r.body, 'Selesai finishing oleh Finishing A: 18 lolos QC, 2 reject dari 20 pcs.');
});

test('unknown type falls back instead of throwing', () => {
  const r = renderNotification({ type: 'stok.minim', entity_type: 'x', entity_id: '1', data: {} });
  assert.equal(r.title, 'Notifikasi');
  assert.equal(r.href, null);
});

test('email has subject, absolute link and escaped html', () => {
  const n = { ...selisih, data: { ...selisih.data, receiver: '<b>Siti</b>' } };
  const e = renderEmail(n, { appUrl: 'https://konveko.vercel.app/', recipientName: 'Rina & Co' });
  assert.equal(e.subject, 'Selisih 3 pcs di B-00012');
  assert.match(e.text, /Buka: https:\/\/konveko\.vercel\.app\/bundle\/b1/);
  assert.match(e.html, /href="https:\/\/konveko\.vercel\.app\/bundle\/b1"/);
  assert.match(e.html, /Rina &amp; Co/);
  assert.match(e.html, /&lt;b&gt;Siti&lt;\/b&gt;/);
  assert.doesNotMatch(e.html, /<b>Siti/);
});

test('timeAgo', () => {
  const now = new Date('2026-11-11T10:00:00Z');
  const ago = (ms) => new Date(now.getTime() - ms).toISOString();
  assert.equal(timeAgo(ago(20_000), now), 'baru saja');
  assert.equal(timeAgo(ago(5 * 60_000), now), '5 menit lalu');
  assert.equal(timeAgo(ago(3 * 3_600_000), now), '3 jam lalu');
  assert.equal(timeAgo(ago(30 * 3_600_000), now), 'kemarin');
  assert.equal(timeAgo(ago(4 * 86_400_000), now), '4 hari lalu');
  assert.match(timeAgo(ago(30 * 86_400_000), now), /2026/);
});

test('deliverableEmail rejects empty, malformed and synthetic PIN addresses', () => {
  assert.equal(deliverableEmail(' Rina@Example.com '), 'rina@example.com');
  assert.equal(deliverableEmail(null), null);
  assert.equal(deliverableEmail('bukan-email'), null);
  assert.equal(deliverableEmail('628123456789@pin.konveko.internal'), null);
});

test('resolveChannel: log in dev, nothing in production until a provider exists', () => {
  assert.equal(resolveChannel('email', { NODE_ENV: 'development' }), logEmailChannel);
  assert.equal(resolveChannel('email', { NODE_ENV: 'production' }), null);
  assert.equal(resolveChannel('email', { NODE_ENV: 'production', EMAIL_PROVIDER: 'log' }), logEmailChannel);
  assert.equal(resolveChannel('wa', { NODE_ENV: 'development' }), null);
});

function fakeStore(rows) {
  const queue = [...rows];
  const finished = [];
  return {
    finished,
    async claim(limit) {
      return queue.splice(0, limit);
    },
    async finish(id, status, detail) {
      finished.push({ id, status, detail });
    },
  };
}

const row = (id, email, channel = 'email') => ({
  delivery_id: id,
  channel,
  attempts: 1,
  notification_id: `n-${id}`,
  type: selisih.type,
  entity_type: selisih.entity_type,
  entity_id: selisih.entity_id,
  data: selisih.data,
  created_at: '2026-11-11T10:00:00Z',
  user_id: `u-${id}`,
  user_name: 'Rina',
  user_email: email,
});

test('dispatcher finishes every claimed row: sent, skipped, unconfigured, thrown', async () => {
  const store = fakeStore([
    row('1', 'rina@example.com'),
    row('2', '628@pin.konveko.internal'),
    row('3', 'x@example.com', 'wa'),
    row('4', 'boom@example.com'),
  ]);
  const sent = [];
  const channel = {
    name: 'email',
    async send(msg) {
      if (msg.recipient.email === 'boom@example.com') throw new Error('provider down');
      if (!deliverableEmail(msg.recipient.email)) return { status: 'dilewati', reason: 'no email' };
      sent.push(msg);
      return { status: 'terkirim' };
    },
  };
  const summary = await dispatchPending(store, {
    appUrl: 'https://x.test',
    resolveChannel: (name) => (name === 'email' ? channel : null),
  });

  assert.deepEqual(summary, { terkirim: 1, dilewati: 1, gagal: 2 });
  assert.deepEqual(
    store.finished.map((f) => [f.id, f.status]),
    [['1', 'terkirim'], ['2', 'dilewati'], ['3', 'gagal'], ['4', 'gagal']],
  );
  assert.equal(store.finished[2].detail, 'Kanal wa belum dikonfigurasi.');
  assert.equal(store.finished[3].detail, 'provider down');
  assert.equal(sent[0].notification.data.bundle_code, 'B-00012');
  assert.equal(sent[0].appUrl, 'https://x.test');
});

test('dispatcher drains in batches and stops at maxBatches', async () => {
  const store = fakeStore(Array.from({ length: 7 }, (_, i) => row(String(i), 'a@example.com')));
  const ok = { name: 'email', send: async () => ({ status: 'terkirim' }) };
  const s = await dispatchPending(store, { appUrl: 'x', resolveChannel: () => ok, batchSize: 2, maxBatches: 3 });
  assert.equal(s.terkirim, 6);
  const rest = await dispatchPending(store, { appUrl: 'x', resolveChannel: () => ok, batchSize: 2 });
  assert.equal(rest.terkirim, 1);
});

test('log channel skips PIN accounts and "sends" real addresses', async () => {
  const msg = (email) => ({ notification: selisih, recipient: { id: 'u', name: 'Rina', email }, appUrl: 'https://x.test' });
  const orig = console.info;
  console.info = () => {};
  try {
    assert.deepEqual(await logEmailChannel.send(msg('628@pin.konveko.internal')), {
      status: 'dilewati',
      reason: 'Penerima belum punya alamat email.',
    });
    assert.deepEqual(await logEmailChannel.send(msg('rina@example.com')), { status: 'terkirim' });
  } finally {
    console.info = orig;
  }
});

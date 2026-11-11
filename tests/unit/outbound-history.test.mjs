import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHistory } from '../../lib/outbound-history.ts';

const at = (min) => new Date(Date.UTC(2026, 10, 11, 3, 0) + min * 60_000).toISOString();
let seq = 0;
const ev = (type, min, code, by = 'gudang', note = null) => ({
  seq: ++seq,
  type,
  note,
  created_at: at(min),
  created_by: by,
  piece: { code },
});
const doc = (over = {}) => ({
  created_at: at(0),
  created_by: 'spv',
  shipped_at: null,
  shipped_by: null,
  cancelled_at: null,
  cancelled_by: null,
  ...over,
});

test('folds runs of the same action by the same person; newest first', () => {
  const h = buildHistory(doc({ shipped_at: at(30), shipped_by: 'gudang' }), [
    ev('dipesan', 1, 'P-1'),
    ev('dipesan', 2, 'P-2'),
    ev('dipesan', 3, 'P-3', 'ani'), // other person: new entry
    ev('lepas_pesan', 4, 'P-2'),
    ev('dipesan', 20, 'P-4'), // > 5 min after the last run of gudang: new entry
    ev('keluar', 30, 'P-1'),
    ev('keluar', 30, 'P-3'),
    ev('keluar', 30, 'P-4'),
    ev('retur', 60, 'P-3', 'gudang', 'Kondisi baik. Salah ukuran'),
  ]);
  assert.deepEqual(
    h.map((e) => [e.title, e.by, e.codes.join(',')]),
    [
      ['Retur P-3', 'gudang', ''],
      ['Dikirim · 3 pcs', 'gudang', ''],
      ['1 pcs ditambahkan', 'gudang', 'P-4'],
      ['1 pcs dihapus dari dokumen', 'gudang', 'P-2'],
      ['1 pcs ditambahkan', 'ani', 'P-3'],
      ['2 pcs ditambahkan', 'gudang', 'P-1,P-2'],
      ['Dokumen dibuat', 'spv', ''],
    ],
  );
  assert.equal(h[0].note, 'Kondisi baik. Salah ukuran');
});

test('a cancel shows the released count once, not one entry per pcs', () => {
  const h = buildHistory(doc({ cancelled_at: at(10), cancelled_by: 'spv' }), [
    ev('dipesan', 1, 'P-1'),
    ev('dipesan', 1, 'P-2'),
    ev('lepas_pesan', 10, 'P-1', 'spv', 'Dokumen dibatalkan'),
    ev('lepas_pesan', 10, 'P-2', 'spv', 'Dokumen dibatalkan'),
  ]);
  assert.deepEqual(h.map((e) => e.title), ['Dokumen dibatalkan · 2 pcs dilepas', '2 pcs ditambahkan', 'Dokumen dibuat']);
});

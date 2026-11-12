// Pure scan helpers. Node strips the TypeScript types itself (node >= 22.18).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyCode, expandCode, normalizeScan } from '../../lib/scan/normalize.ts';
import { WedgeDetector } from '../../lib/scan/keyboard-wedge.ts';

const TOKEN = '3f2a9c0d4b5e6f708192a3b4c5d6e7f8';

/** Feed a string as key events `gap` ms apart, then an optional suffix. */
function type(d, text, { start = 1000, gap = 8, suffix = 'Enter' } = {}) {
  let t = start;
  const results = [];
  for (const ch of text) {
    results.push(d.feed({ key: ch, time: t }));
    t += gap;
  }
  if (suffix) results.push(d.feed({ key: suffix, time: t }));
  return { results, last: results.at(-1), end: t };
}

test('normalizeScan strips suffixes, AIM ids and URL wrappers', () => {
  assert.equal(normalizeScan(`  ${TOKEN}\r\n`), TOKEN);
  assert.equal(normalizeScan(`]Q1${TOKEN}`), TOKEN);
  assert.equal(normalizeScan(']C0P-0000123'), 'P-0000123');
  assert.equal(normalizeScan(`https://konveko.vercel.app/q/${TOKEN}`), TOKEN);
  assert.equal(normalizeScan('B-00231\t'), 'B-00231');
  assert.equal(normalizeScan('\u001d'), '');
  assert.equal(normalizeScan('x'.repeat(100)).length, 64);
});

test('classifyCode recognises label formats', () => {
  assert.equal(classifyCode(TOKEN), 'token');
  assert.equal(classifyCode('p-0000123'), 'piece');
  assert.equal(classifyCode('B-00231'), 'bundle');
  assert.equal(classifyCode('BT-0012'), 'batch');
  assert.equal(classifyCode('SJ-000001'), 'outbound');
  assert.equal(classifyCode('A1'), 'other');
  assert.equal(classifyCode('KAOS-HTM-M'), 'other');
});

test('fast run + Enter is one scan', () => {
  const d = new WedgeDetector();
  const { last } = type(d, TOKEN);
  assert.equal(last.kind, 'scan');
  assert.equal(last.code, TOKEN);
  assert.equal(last.gaps.length, TOKEN.length - 1);
});

test('Shift between characters (upper-case codes) does not break a scan', () => {
  const d = new WedgeDetector();
  let t = 0;
  for (const ch of 'P-0000123') {
    if (/[A-Z]/.test(ch)) d.feed({ key: 'Shift', time: t++ });
    d.feed({ key: ch, time: (t += 5) });
  }
  const r = d.feed({ key: 'Enter', time: t + 5 });
  assert.equal(r.kind, 'scan');
  assert.equal(r.code, 'P-0000123');
});

test('a person typing is not a scan', () => {
  const d = new WedgeDetector();
  const { last } = type(d, 'B-00231', { gap: 140 });
  assert.equal(last.kind, 'pass', 'Enter must reach the page');
});

test('one slow key inside a run restarts it', () => {
  const d = new WedgeDetector();
  type(d, 'xy', { suffix: null, start: 0 });
  // 500 ms later the real scan begins: the stray "xy" must not be glued to it
  const { last } = type(d, 'P-0000123', { start: 500 });
  assert.equal(last.code, 'P-0000123');
});

test('short runs are ignored', () => {
  const d = new WedgeDetector();
  assert.equal(type(d, 'ab').last.kind, 'pass');
});

test('modifier shortcuts reset the buffer', () => {
  const d = new WedgeDetector();
  type(d, 'abcd', { suffix: null, start: 0 });
  assert.equal(d.feed({ key: 'v', time: 40, ctrlKey: true }).kind, 'pass');
  assert.equal(d.feed({ key: 'Enter', time: 45 }).kind, 'pass');
});

test('scanner without suffix: flushIdle emits after the pause', () => {
  const d = new WedgeDetector({ idleMs: 100 });
  const { end } = type(d, 'P-0000123', { suffix: null, start: 0 });
  const lastKey = end - 8;
  assert.equal(d.idleDeadline(), lastKey + 100);
  assert.equal(d.flushIdle(lastKey + 50).kind, 'pass', 'too early');
  const r = d.flushIdle(lastKey + 100);
  assert.equal(r.kind, 'scan');
  assert.equal(r.code, 'P-0000123');
  assert.equal(d.idleDeadline(), null);
  // an Enter that arrives late after an idle emit is swallowed, not passed to a button
  assert.equal(d.feed({ key: 'Enter', time: lastKey + 150 }).kind, 'buffered');
  assert.equal(d.feed({ key: 'Enter', time: lastKey + 2000 }).kind, 'pass');
});

test('two scans back to back', () => {
  const d = new WedgeDetector();
  assert.equal(type(d, 'P-0000001', { start: 0 }).last.code, 'P-0000001');
  assert.equal(type(d, 'P-0000002', { start: 300 }).last.code, 'P-0000002');
});

test('expandCode pads typed digits to a full code', () => {
  assert.equal(expandCode('bundle', '231'), 'B-00231');
  assert.equal(expandCode('bundle', '231-1'), 'B-00231-1');
  assert.equal(expandCode('bundle', 'b-00231'), 'B-00231');
  assert.equal(expandCode('piece', '123'), 'P-0000123');
  assert.equal(expandCode('rack', ' a1 '), 'A1');
  assert.equal(expandCode('bundle', ''), '');
  assert.equal(expandCode('bundle', '-1'), '');
});

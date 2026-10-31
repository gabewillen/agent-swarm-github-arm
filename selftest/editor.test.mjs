// Extra tests for agent-16's area (the level editor, DESIGN.md §20).
// Not part of the acceptance suite; run with `node --test mytests/`.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { load, deepFreeze } from '../tests/helpers.mjs';

const ed = () => load('core/editor.js');

test('editorInit has exactly the fields of §20', async () => {
  const { editorInit } = await ed();
  const d = editorInit(8, 7);
  assert.deepEqual(Object.keys(d).sort(), ['driftPeriod', 'map', 'name', 'par', 'quorum', 'spawnEvery']);
  assert.equal(d.name, 'Untitled');
  assert.equal(d.quorum, 1);
  assert.equal(d.par, 100);
  assert.equal(d.driftPeriod, 2);
  assert.equal(d.spawnEvery, 20);
});

test('editorPaint keeps every other field of the definition', async () => {
  const { editorInit, editorPaint } = await ed();
  const d = editorInit(6, 5);
  const e = editorPaint(d, 1, 1, 'M');
  assert.deepEqual({ ...e, map: null }, { ...d, map: null });
});

test('editorPaint accepts every §4 character', async () => {
  const { editorInit, editorPaint } = await ed();
  const chars = ['#', '.', '@', 'P', 'M', 'X', 'H', '^', '>', 'v', '<'];
  let d = editorInit(13, 5);
  chars.forEach((c, i) => { d = editorPaint(d, 1 + i, 1, c); });
  assert.equal(d.map[1], '##.@PMXH^>v<#');
});

test('editorPaint ignores the last interior-adjacent border cells', async () => {
  const { editorInit, editorPaint } = await ed();
  const d = editorInit(6, 5);
  for (const [x, y] of [[1, 0], [4, 0], [1, 4], [4, 4], [-1, 2], [6, 2], [2, -3], [2, 9]]) {
    assert.deepEqual(editorPaint(d, x, y, 'P').map, d.map, `paint ${x},${y}`);
  }
});

test('painting @ over an existing @ keeps one', async () => {
  const { editorInit, editorPaint } = await ed();
  let d = editorInit(6, 5);
  d = editorPaint(d, 2, 2, '@');
  d = editorPaint(d, 2, 2, '@');
  assert.equal(d.map.join('').split('@').length - 1, 1);
});

test('painting X clears only X, and @ clears only @', async () => {
  const { editorInit, editorPaint } = await ed();
  let d = editorInit(8, 6);
  d = editorPaint(editorPaint(editorPaint(d, 2, 2, '@'), 4, 2, 'X'), 5, 2, '@'); // moves the @
  assert.equal(d.map[2], '#...X@.#');
  assert.equal(d.map.join('').split('@').length - 1, 1);
  assert.equal(d.map.join('').split('X').length - 1, 1);
  d = editorPaint(d, 3, 2, 'X'); // moves the X off the @
  assert.equal(d.map[2], '#..X.@.#');
});

test('editorPaint works on a frozen definition', async () => {
  const { editorInit, editorPaint } = await ed();
  const d = deepFreeze(editorInit(6, 5));
  const e = editorPaint(d, 3, 2, 'H');
  assert.equal(e.map[2], '#..H.#');
  assert.equal(d.map[2], '#....#');
});

test('editorFill fills from any cell character', async () => {
  const { editorInit, editorPaint, editorFill } = await ed();
  let d = editorInit(7, 5);
  d = editorPaint(d, 2, 1, 'P');
  d = editorPaint(d, 5, 1, '@');
  const f = editorFill(d, 2, 1, 'v'); // the P cell
  assert.equal(f.map[1], '#.v..@#'); // the @ cell is untouched
});

test('editorFill does not cross walls', async () => {
  const { editorInit, editorPaint, editorFill } = await ed();
  let d = editorInit(9, 5);
  d = editorPaint(d, 4, 1, '#');
  d = editorPaint(d, 4, 3, '#');
  const g = editorFill(d, 1, 1, 'H'); // floods around the stubs
  assert.deepEqual(g.map, ['#########', '#HHH#HHH#', '#HHHHHHH#', '#HHH#HHH#', '#########']);
  // (4,2) connects around the wall stubs through the open row 2, so a
  // fill there covers the whole interior except the stubs.
  const f = editorFill(d, 4, 2, 'M');
  assert.deepEqual(f.map, ['#########', '#MMM#MMM#', '#MMMMMMM#', '#MMM#MMM#', '#########']);
});

test('editorFill refills a filled region', async () => {
  const { editorInit, editorFill, editorPaint } = await ed();
  let d = editorInit(6, 5);
  d = editorFill(d, 2, 2, 'H');
  d = editorFill(d, 2, 2, '.');
  assert.deepEqual(d.map, ['######', '#....#', '#....#', '#....#', '######']);
  d = editorPaint(d, 3, 2, '@');
  const f = editorFill(d, 2, 2, 'M'); // everything but the @ cell
  assert.equal(f.map[2], '#MM@M#');
  assert.deepEqual(d.map, ['######', '#....#', '#..@.#', '#....#', '######']);
});

test('editorFill ignores cells outside the map', async () => {
  const { editorInit, editorFill } = await ed();
  const d = editorInit(6, 5);
  for (const [x, y] of [[-1, -1], [9, 9], [5, 5]]) {
    assert.deepEqual(editorFill(d, x, y, '#').map, d.map, `fill ${x},${y}`);
  }
});

test('editorResize keeps its other fields', async () => {
  const { editorInit, editorResize } = await ed();
  const d = editorInit(6, 5);
  const r = editorResize(d, 10, 9);
  assert.deepEqual({ ...r, map: null }, { ...d, map: null });
});

test('editorResize round-trips through paint and re-resize', async () => {
  const { editorInit, editorPaint, editorResize } = await ed();
  let d = editorInit(8, 8);
  d = editorPaint(d, 3, 3, '@');
  d = editorResize(d, 20, 12);
  assert.equal(d.map[3][3], '@');
  assert.equal(d.map[3][5], '.');
  d = editorResize(d, 8, 8);
  assert.equal(d.map[3][3], '@');
  assert.equal(d.map[0], '########');
});

test('editorErrors passes bad_fields through', async () => {
  const { editorErrors } = await ed();
  assert.deepEqual(editorErrors(null), ['bad_fields']);
  assert.deepEqual(editorErrors({ name: 'x', map: ['#'] }), ['bad_fields']);
  assert.deepEqual(editorErrors({ name: '', quorum: 1, par: 1, driftPeriod: 1, spawnEvery: 1, map: ['#'] }), ['bad_fields']);
});

test('editorImport accepts defs with correctable errors and extra keys', async () => {
  const { editorImport } = await ed();
  const text = '{"name":"x","quorum":1,"par":1,"driftPeriod":1,"spawnEvery":1,"map":["#####","#.P.#","#@M.#","#..X#","#####"],"note":"hi"}';
  const d = editorImport(text);
  assert.ok(d);
  assert.equal(d.name, 'x');
});

test('editorImport refuses null, numbers, and non-object JSON', async () => {
  const { editorImport } = await ed();
  assert.equal(editorImport('null'), null);
  assert.equal(editorImport('42'), null);
  assert.equal(editorImport('"hello"'), null);
  assert.equal(editorImport('{}'), null);
  assert.equal(editorImport(''), null);
});

test('the editor module stays pure', async () => {
  const text = readFileSync(new URL('../src/core/editor.js', import.meta.url), 'utf8');
  for (const banned of ['document', 'window', 'Math.random', 'Date.now', 'performance.now', 'require(', 'process.', 'node:']) {
    assert.ok(!text.includes(banned), `editor.js must not contain ${banned}`);
  }
});

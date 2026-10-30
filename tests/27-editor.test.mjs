import test from 'node:test';
import assert from 'node:assert/strict';
import { load, deepFreeze } from './helpers.mjs';

const ed = () => load('core/editor.js');

test('editorInit makes a bordered empty level', async () => {
  const { editorInit } = await ed();
  assert.deepEqual(editorInit(6, 5), { name: 'Untitled', quorum: 1, par: 100, driftPeriod: 2, spawnEvery: 20, map: ['######', '#....#', '#....#', '#....#', '######'] });
});

test('editorInit clamps its size', async () => {
  const { editorInit } = await ed();
  const small = editorInit(1, 2);
  assert.equal(small.map.length, 5);
  assert.equal(small.map[0].length, 5);
  const big = editorInit(99, 99);
  assert.equal(big.map.length, 24);
  assert.equal(big.map[0].length, 32);
});

test('editorPaint sets one cell without changing its argument', async () => {
  const { editorInit, editorPaint } = await ed();
  const d = deepFreeze(editorInit(6, 5));
  const e = editorPaint(d, 2, 1, 'P');
  assert.equal(e.map[1], '#.P..#');
  assert.equal(d.map[1], '#....#');
});

test('editorPaint ignores the border, outside cells, and unknown characters', async () => {
  const { editorInit, editorPaint } = await ed();
  const d = editorInit(6, 5);
  assert.deepEqual(editorPaint(d, 0, 2, '.').map, d.map);
  assert.deepEqual(editorPaint(d, 5, 4, 'P').map, d.map);
  assert.deepEqual(editorPaint(d, 9, 9, 'P').map, d.map);
  assert.deepEqual(editorPaint(d, 2, 2, 'Z').map, d.map);
});

test('painting @ or X keeps only one of each', async () => {
  const { editorInit, editorPaint } = await ed();
  let d = editorInit(7, 5);
  d = editorPaint(d, 1, 1, '@');
  d = editorPaint(d, 4, 2, '@');
  d = editorPaint(d, 2, 3, 'X');
  d = editorPaint(d, 5, 3, 'X');
  const all = d.map.join('');
  assert.equal(all.split('@').length - 1, 1);
  assert.equal(all.split('X').length - 1, 1);
  assert.equal(d.map[2][4], '@');
  assert.equal(d.map[3][5], 'X');
});

test('editorFill fills a connected region', async () => {
  const { editorInit, editorPaint, editorFill } = await ed();
  let d = editorInit(7, 5);
  for (let y = 1; y <= 3; y++) d = editorPaint(d, 3, y, '#');
  const f = editorFill(d, 1, 1, 'H');
  assert.deepEqual(f.map, ['#######', '#HH#..#', '#HH#..#', '#HH#..#', '#######']);
});

test('editorFill never touches the border and refuses @, X, and border cells', async () => {
  const { editorInit, editorFill } = await ed();
  const d = editorInit(6, 5);
  assert.deepEqual(editorFill(d, 2, 2, '#').map, ['######', '######', '######', '######', '######']);
  assert.deepEqual(editorFill(d, 2, 2, '@').map, d.map);
  assert.deepEqual(editorFill(d, 2, 2, 'X').map, d.map);
  assert.deepEqual(editorFill(d, 0, 0, '.').map, d.map);
});

test('editorResize keeps the inside and re-borders', async () => {
  const { editorInit, editorPaint, editorResize } = await ed();
  let d = editorInit(6, 5);
  d = editorPaint(d, 1, 1, '@');
  d = editorPaint(d, 4, 3, 'M');
  assert.deepEqual(editorResize(d, 8, 6).map, ['########', '#@.....#', '#......#', '#...M..#', '#......#', '########']);
  assert.deepEqual(editorResize(d, 5, 5).map, ['#####', '#@..#', '#...#', '#...#', '#####']);
});

test('editorResize clamps', async () => {
  const { editorInit, editorResize } = await ed();
  const r = editorResize(editorInit(6, 5), 2, 50);
  assert.equal(r.map.length, 24);
  assert.equal(r.map[0].length, 5);
});

test('editorErrors reports validation codes', async () => {
  const { editorInit, editorPaint, editorErrors } = await ed();
  let d = editorInit(7, 5);
  assert.deepEqual(editorErrors(d), ['player_count', 'exit_count', 'no_merge', 'no_spawn']);
  d = editorPaint(editorPaint(editorPaint(editorPaint(d, 1, 1, '@'), 2, 1, 'P'), 3, 1, 'M'), 4, 1, 'X');
  assert.deepEqual(editorErrors(d), []);
});

test('an edited level plays', async () => {
  const { editorInit, editorPaint } = await ed();
  const { init, step } = await load('core/game.js');
  let d = editorInit(7, 5);
  d = editorPaint(editorPaint(editorPaint(editorPaint(d, 1, 1, '@'), 2, 1, 'P'), 3, 1, 'M'), 4, 1, 'X');
  let s = init(1, { levels: [d] });
  for (const m of ['right', 'right', 'right']) s = step(s, { move: m, pause: false });
  assert.equal(s.status, 'won');
});

test('editorExport and editorImport round-trip', async () => {
  const { editorInit, editorPaint, editorExport, editorImport } = await ed();
  const d = editorPaint(editorInit(7, 6), 2, 2, 'H');
  assert.deepEqual(editorImport(editorExport(d)), d);
});

test('editorImport refuses bad text and bad fields', async () => {
  const { editorImport } = await ed();
  assert.equal(editorImport('not json'), null);
  assert.equal(editorImport('[]'), null);
  assert.equal(editorImport('{"name":"x","quorum":0,"par":1,"driftPeriod":1,"spawnEvery":1,"map":["###"]}'), null);
  assert.deepEqual(editorImport('{"name":"x","quorum":1,"par":1,"driftPeriod":1,"spawnEvery":1,"map":["###"]}').name, 'x');
});

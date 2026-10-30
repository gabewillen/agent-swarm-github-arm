import test from 'node:test';
import assert from 'node:assert/strict';
import { load, lvl } from './helpers.mjs';

const GOOD = ['#######', '#@.P.M#', '#..X..#', '#######'];
const v = async (def) => (await load('core/level.js')).validateLevel(def);

test('a good level validates', async () => {
  assert.deepEqual(await v(lvl(GOOD)), { ok: true, errors: [] });
});

test('a level with every cell kind validates', async () => {
  const r = await v(lvl(['#########', '#@.P.M.>#', '#.^..v..#', '#..<H.X.#', '#########']));
  assert.deepEqual(r, { ok: true, errors: [] });
});

test('bad_fields: missing name', async () => {
  const def = lvl(GOOD);
  delete def.name;
  assert.deepEqual(await v(def), { ok: false, errors: ['bad_fields'] });
});

test('bad_fields: empty name', async () => {
  assert.deepEqual((await v(lvl(GOOD, { name: '' }))).errors, ['bad_fields']);
});

test('bad_fields: quorum zero, par fractional, driftPeriod negative, spawnEvery a string', async () => {
  for (const extra of [{ quorum: 0 }, { par: 1.5 }, { driftPeriod: -1 }, { spawnEvery: '3' }]) {
    assert.deepEqual((await v(lvl(GOOD, extra))).errors, ['bad_fields'], JSON.stringify(extra));
  }
});

test('bad_fields: map not an array or empty', async () => {
  assert.deepEqual((await v(lvl('#@#'))).errors, ['bad_fields']);
  assert.deepEqual((await v(lvl([]))).errors, ['bad_fields']);
});

test('bad_fields stops every other check', async () => {
  assert.deepEqual(await v(lvl(['ab', 'c'], { quorum: 0 })), { ok: false, errors: ['bad_fields'] });
});

test('ragged rows', async () => {
  const r = await v(lvl(['#######', '#@.P.M#', '#..X.#', '#######']));
  assert.ok(r.errors.includes('ragged'));
  assert.equal(r.ok, false);
});

test('too_big: wider than 32', async () => {
  const w = 33;
  const map = ['#'.repeat(w), '#@PMX' + '.'.repeat(w - 6) + '#', '#'.repeat(w)];
  assert.ok((await v(lvl(map))).errors.includes('too_big'));
});

test('too_big: taller than 24', async () => {
  const map = ['#####', '#@PM#', '#X..#'];
  for (let i = 0; i < 21; i++) map.push('#...#');
  map.push('#####');
  assert.equal(map.length, 25);
  assert.deepEqual((await v(lvl(map))).errors, ['too_big']);
});

test('32 by 24 is not too big', async () => {
  const map = ['#'.repeat(32), '#@PMX' + '.'.repeat(26) + '#'];
  for (let i = 0; i < 21; i++) map.push('#' + '.'.repeat(30) + '#');
  map.push('#'.repeat(32));
  assert.deepEqual(await v(lvl(map)), { ok: true, errors: [] });
});

test('bad_char', async () => {
  assert.deepEqual((await v(lvl(['#######', '#@.P.M#', '#..X.Z#', '#######']))).errors, ['bad_char']);
});

test('no_border', async () => {
  assert.deepEqual((await v(lvl(['###.###', '#@.P.M#', '#..X..#', '#######']))).errors, ['no_border']);
});

test('player_count: none and two', async () => {
  assert.ok((await v(lvl(['#######', '#..P.M#', '#..X..#', '#######']))).errors.includes('player_count'));
  assert.ok((await v(lvl(['#######', '#@.P.M#', '#..X.@#', '#######']))).errors.includes('player_count'));
});

test('exit_count: none and two', async () => {
  assert.deepEqual((await v(lvl(['#######', '#@.P.M#', '#.....#', '#######']))).errors, ['exit_count']);
  assert.deepEqual((await v(lvl(['#######', '#@.PXM#', '#..X..#', '#######']))).errors, ['exit_count']);
});

test('no_merge', async () => {
  assert.deepEqual((await v(lvl(['#######', '#@.P..#', '#..X..#', '#######']))).errors, ['no_merge']);
});

test('no_spawn', async () => {
  assert.deepEqual((await v(lvl(['#######', '#@...M#', '#..X..#', '#######']))).errors, ['no_spawn']);
});

test('unreachable: a walled-off patch', async () => {
  assert.deepEqual((await v(lvl(['#######', '#@.#P##', '#M.X###', '#######']))).errors, ['unreachable']);
});

test('unreachable: holds and the exit count as passable', async () => {
  assert.deepEqual(await v(lvl(['#######', '#@.H.P#', '#M##X##', '#######'])), { ok: true, errors: [] });
});

test('unreachable is not checked without exactly one player', async () => {
  assert.deepEqual((await v(lvl(['#######', '#..#P##', '#M.X###', '#######']))).errors, ['player_count']);
});

test('errors come in the spec order', async () => {
  const r = await v(lvl(['##.###', '#..Z.#', '#.....#', '######']));
  assert.deepEqual(r.errors, ['ragged', 'bad_char', 'no_border', 'player_count', 'exit_count', 'no_merge', 'no_spawn']);
});

test('validateLevel does not change its argument', async () => {
  const def = lvl(GOOD);
  const copy = JSON.parse(JSON.stringify(def));
  await v(def);
  assert.deepEqual(def, copy);
});

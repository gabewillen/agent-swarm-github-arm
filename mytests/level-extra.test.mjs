// agent-20's own extra checks for src/core/level.js (DESIGN.md §4).
import test from 'node:test';
import assert from 'node:assert/strict';
import { load, lvl } from '../tests/helpers.mjs';

const GOOD = ['#######', '#@.P.M#', '#..X..#', '#######'];
const mod = await load('core/level.js');
const v = (def) => mod.validateLevel(def);
const p = (def) => mod.parseLevel(def);

test('null, number, and array definitions get bad_fields', () => {
  for (const def of [null, undefined, 7, 'x', []]) {
    assert.deepEqual(v(def), { ok: false, errors: ['bad_fields'] }, String(def));
  }
});

test('a non-string map row gets bad_fields', () => {
  assert.deepEqual(v(lvl(['#######', '#@.P.M#', '#..X..#', 3])).errors, ['bad_fields']);
});

test('boolean or NaN fields get bad_fields', () => {
  for (const extra of [{ quorum: true }, { par: NaN }, { driftPeriod: Infinity }]) {
    assert.deepEqual(v(lvl(GOOD, extra)).errors, ['bad_fields'], JSON.stringify(extra));
  }
});

test('too_big comes after ragged and before bad_char', () => {
  const r = v(lvl(['#'.repeat(33) + 'x', '#@$PM#', '########']));
  assert.deepEqual(r.errors, ['ragged', 'too_big', 'bad_char', 'no_border', 'exit_count']);
});

test('drift cells are passable for reachability', () => {
  assert.deepEqual(
    v(lvl(['#######', '#@^P.M#', '#v.X.##', '#######'])),
    { ok: true, errors: [] },
  );
});

test('31 wide by 24 tall is inside the bounds', () => {
  const map = ['#'.repeat(31), '#@PMX' + '.'.repeat(25) + '#'];
  for (let i = 0; i < 21; i++) map.push('#' + '.'.repeat(29) + '#');
  map.push('#'.repeat(31));
  assert.equal(map.length, 24);
  assert.deepEqual(v(lvl(map)), { ok: true, errors: [] });
});

test('validateLevel is pure across calls', () => {
  const def = lvl(GOOD, { map: undefined });
  assert.deepEqual(v(def), { ok: false, errors: ['bad_fields'] });
  assert.deepEqual(v(def), { ok: false, errors: ['bad_fields'] });
});

test('parseLevel throws on every error code', () => {
  for (const def of [lvl(['#######', '#@P..##', '#..X.M##', '#######']), lvl(GOOD, { par: 0 }), lvl(GOOD, { spawnEvery: 2.5 })]) {
    assert.throws(() => p(def), /^Error: invalid level/);
  }
});

test('parseLevel of a drift-free level has empty drifts', () => {
  const l = p(lvl(GOOD));
  assert.deepEqual(l.drifts, []);
  assert.deepEqual(l.spawns, [{ x: 3, y: 1 }]);
  assert.equal(l.tiles.join('|'), GOOD.join('|').replace('@', '.').replace('P', '.'));
});

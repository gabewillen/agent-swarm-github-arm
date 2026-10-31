// Extra edge-case tests for src/core/level.js, outside tests/ on purpose.
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateLevel, parseLevel } from '../src/core/level.js';

const GOOD = ['#######', '#@.P.M#', '#..X..#', '#######'];

test('bad_fields: a non-string row and a non-string name', () => {
  assert.deepEqual(validateLevel({ ...def, map: ['#####', '#@P.#', '#####', null] }).errors, ['bad_fields']);
  assert.deepEqual(validateLevel({ ...def, name: 7 }).errors, ['bad_fields']);
  assert.deepEqual(validateLevel({ ...def, par: Infinity }).errors, ['bad_fields']);
});

test('bad_fields: definitions that are not plain objects', () => {
  assert.deepEqual(validateLevel(null), { ok: false, errors: ['bad_fields'] });
  assert.deepEqual(validateLevel('level'), { ok: false, errors: ['bad_fields'] });
  assert.deepEqual(validateLevel(undefined), { ok: false, errors: ['bad_fields'] });
});

const def = { name: 't', quorum: 1, par: 10, driftPeriod: 1, spawnEvery: 10, map: GOOD };

test('unreachable: merge pad and exit walled off together', () => {
  assert.deepEqual(validateLevel({ ...def, map: ['#######', '#@P#MX#', '#######'] }).errors, ['unreachable']);
});

test('multiple M and P are fine; untouched variants validate', () => {
  const map = ['########', '#@PM.PM#', '#..X...#', '########'];
  assert.deepEqual(validateLevel({ ...def, map }), { ok: true, errors: [] });
  const p = parseLevel({ ...def, map });
  assert.equal(p.width, 8);
  assert.deepEqual(p.spawns, [{ x: 2, y: 1 }, { x: 5, y: 1 }]);
  assert.deepEqual(p.drifts, []);
});

test('parseLevel throws on ragged and bad_char', () => {
  assert.throws(() => parseLevel({ ...def, map: ['####', '#@P.', '####'] }), (e) => e instanceof Error && e.message.startsWith('invalid level'));
});

test('25 rows are too_big, 24 rows are not', () => {
  const rows = (n) => {
    const m = ['#'.repeat(8), '#@PM.X.#', '########'];
    while (m.length < n - 1) m.push('#......#');
    m.push('#'.repeat(8));
    return m;
  };
  assert.ok(validateLevel({ ...def, map: rows(25) }).errors.includes('too_big'));
  assert.deepEqual(validateLevel({ ...def, map: rows(24) }), { ok: true, errors: [] });
});

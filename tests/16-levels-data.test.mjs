import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './helpers.mjs';

const levels = async () => (await load('data/levels.js')).LEVELS;

test('LEVELS holds at least 10 levels', async () => {
  const l = await levels();
  assert.ok(Array.isArray(l) && l.length >= 10);
});

test('every shipped level validates', async () => {
  const { validateLevel } = await load('core/level.js');
  for (const def of await levels()) assert.deepEqual(validateLevel(def), { ok: true, errors: [] }, def.name);
});

test('level names are distinct', async () => {
  const names = (await levels()).map((l) => l.name);
  assert.equal(new Set(names).size, names.length);
});

test('the first level has no drift', async () => {
  const { parseLevel } = await load('core/level.js');
  assert.equal(parseLevel((await levels())[0]).drifts.length, 0);
});

test('at least six levels have drifts', async () => {
  const { parseLevel } = await load('core/level.js');
  const n = (await levels()).filter((l) => parseLevel(l).drifts.length > 0).length;
  assert.ok(n >= 6, `${n}`);
});

test('at least four levels have hold doors', async () => {
  const n = (await levels()).filter((l) => l.map.some((r) => r.includes('H'))).length;
  assert.ok(n >= 4, `${n}`);
});

test('quorums are at most 20 and pars at least 30', async () => {
  for (const l of await levels()) {
    assert.ok(l.quorum <= 20, l.name);
    assert.ok(l.par >= 30, l.name);
  }
});

test('every level has enough spawn points to be won', async () => {
  const { parseLevel } = await load('core/level.js');
  for (const l of await levels()) assert.ok(parseLevel(l).spawns.length >= 1, l.name);
});

test('each level can be loaded by init', async () => {
  const { init } = await load('core/game.js');
  const l = await levels();
  for (let i = 0; i < l.length; i++) assert.equal(init(1, { level: i }).levelIndex, i);
});

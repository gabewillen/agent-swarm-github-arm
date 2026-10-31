// My own check of src/core/generate.js against DESIGN.md §19 and
// tests/26-generate.test.mjs, minus the bot-playability test that waits
// on src/core/game.js.
//   node --test dev/generate.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { hashSeed, dailySeed, generateLevel } from '../src/core/generate.js';
import { validateLevel, parseLevel } from '../src/core/level.js';

function fnv(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h;
}

test('hashSeed is FNV-1a', () => {
  for (const t of ['', 'a', 'quorum', 'Quorum Run!', 'é中']) assert.equal(hashSeed(t), fnv(t), t);
  assert.equal(hashSeed(''), 0x811c9dc5);
});

test('dailySeed hashes the date', () => {
  assert.equal(dailySeed('2026-10-30'), fnv('quorum-run:2026-10-30'));
  assert.notEqual(dailySeed('2026-10-30'), dailySeed('2026-10-31'));
});

test('dailySeed refuses other text', () => {
  for (const t of ['2026-1-30', 'today', '', '2026/10/30', '2026-10-30T00:00']) assert.equal(dailySeed(t), null, t);
});

test('generated levels validate, for 40 seeds', () => {
  for (let seed = 0; seed < 40; seed++) assert.deepEqual(validateLevel(generateLevel(seed)).errors, [], `seed ${seed}`);
});

test('generated levels have the default size and counts', () => {
  for (let seed = 100; seed < 110; seed++) {
    const def = generateLevel(seed);
    const l = parseLevel(def);
    assert.equal(l.width, 15);
    assert.equal(l.height, 11);
    assert.equal(l.drifts.length, 2);
    assert.equal(l.spawns.length, 4);
    assert.equal(def.quorum, 5);
    assert.ok(def.map.join('').includes('M'));
  }
});

test('generateLevel honours its options', () => {
  const def = generateLevel(5, { width: 21, height: 13, drifts: 4, spawns: 6, quorum: 9 });
  const l = parseLevel(def);
  assert.deepEqual([l.width, l.height, l.drifts.length, l.spawns.length, def.quorum], [21, 13, 4, 6, 9]);
});

test('generated fields: name, par, driftPeriod, spawnEvery', () => {
  const def = generateLevel(-2);
  assert.equal(def.name, 'Generated 4294967294');
  assert.ok(def.par >= 30);
  assert.equal(def.driftPeriod, 2);
  assert.equal(def.spawnEvery, 12);
});

test('drifts start at least 3 steps from the player', () => {
  for (let seed = 0; seed < 30; seed++) {
    const l = parseLevel(generateLevel(seed, { drifts: 5 }));
    for (const d of l.drifts) assert.ok(Math.abs(d.x - l.start.x) + Math.abs(d.y - l.start.y) >= 3, `seed ${seed}`);
  }
});

test('generateLevel is deterministic and varies with the seed', () => {
  assert.deepEqual(generateLevel(77), generateLevel(77));
  const maps = new Set();
  for (let seed = 0; seed < 10; seed++) maps.add(generateLevel(seed).map.join('\n'));
  assert.ok(maps.size >= 8);
});

test('generateLevel throws RangeError for sizes out of range', () => {
  assert.throws(() => generateLevel(1, { width: 6 }), RangeError);
  assert.throws(() => generateLevel(1, { width: 33 }), RangeError);
  assert.throws(() => generateLevel(1, { height: 25 }), RangeError);
  assert.throws(() => generateLevel(1, { height: 6 }), RangeError);
});

test('the smallest and largest sizes generate', () => {
  const small = generateLevel(3, { width: 7, height: 7, drifts: 1, spawns: 2 });
  assert.ok(validateLevel(small).ok);
  assert.ok(validateLevel(generateLevel(3, { width: 32, height: 24 })).ok);
});

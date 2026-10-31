// Local self-checks for src/core/generate.js (§19): the daily-run hash,
// the level contract over many seeds and option sets, determinism, and
// — with the landed bot — that generated levels actually ship. Runs
// standalone:  node selfcheck/generate.mjs
import assert from 'node:assert/strict';
import { hashSeed, dailySeed, generateLevel } from '../src/core/generate.js';
import { validateLevel, parseLevel } from '../src/core/level.js';
import { init, step } from '../src/core/game.js';
import { botInput } from '../src/core/bot.js';

// The suite's own FNV-1a copy, to pin hashSeed against.
function fnv(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

let failures = 0;
function test(name, fn) {
  try {
    fn();
    console.log('ok - ' + name);
  } catch (err) {
    failures++;
    console.log('FAIL - ' + name + ': ' + err.message);
  }
}

test('hashSeed is the FNV-1a of the code units', () => {
  for (const t of ['', 'a', 'quorum', 'Quorum Run!', 'é中', 'quorum-run:2026-10-30']) {
    assert.equal(hashSeed(t), fnv(t), t);
  }
  assert.equal(hashSeed(''), 0x811c9dc5);
});

test('dailySeed is a salted date hash, or null', () => {
  assert.equal(dailySeed('2026-10-30'), fnv('quorum-run:2026-10-30'));
  assert.notEqual(dailySeed('2026-10-30'), dailySeed('2026-10-31'));
  for (const t of ['2026-1-30', 'today', '', '2026/10/30', '2026-10-30T00:00', '2026-13-01x']) {
    assert.equal(dailySeed(t), null, t);
  }
});

test('seed 0..99 levels validate at the default size', () => {
  for (let seed = 0; seed < 100; seed++) {
    assert.deepEqual(validateLevel(generateLevel(seed)).errors, [], `seed ${seed}`);
  }
});

test('default counts and fields for seeds 100..140', () => {
  for (let seed = 100; seed < 140; seed++) {
    const def = generateLevel(seed);
    const l = parseLevel(def);
    assert.equal(l.width, 15);
    assert.equal(l.height, 11);
    assert.equal(l.drifts.length, 2);
    assert.equal(l.spawns.length, 4);
    assert.equal(def.quorum, 5);
    assert.equal(def.driftPeriod, 2);
    assert.equal(def.spawnEvery, 12);
    assert.ok(def.par >= 30, `par ${def.par}`);
    assert.ok(def.map.join('').includes('M'), 'a merge pad exists');
  }
});

test('a negative seed is treated unsigned', () => {
  assert.equal(generateLevel(-2).name, 'Generated 4294967294');
  assert.equal(generateLevel(-1).name, 'Generated 4294967295');
});

test('options shape the level', () => {
  const l = parseLevel(generateLevel(5, { width: 21, height: 13, drifts: 4, spawns: 6, quorum: 9 }));
  assert.deepEqual([l.width, l.height, l.drifts.length, l.spawns.length], [21, 13, 4, 6]);
  assert.equal(generateLevel(5, { quorum: 9 }).quorum, 9);
});

test('sizes in range generate, out of range throw RangeError', () => {
  assert.ok(validateLevel(generateLevel(3, { width: 7, height: 7, drifts: 1, spawns: 2 })).ok);
  assert.ok(validateLevel(generateLevel(3, { width: 32, height: 24 })).ok);
  for (const bad of [{ width: 6 }, { width: 33 }, { height: 25 }, { height: 6 }]) {
    assert.throws(() => generateLevel(1, bad), RangeError, JSON.stringify(bad));
  }
});

test('drifts start at least 3 steps from the player', () => {
  for (let seed = 0; seed < 50; seed++) {
    const l = parseLevel(generateLevel(seed, { drifts: 5 }));
    for (const d of l.drifts) {
      assert.ok(Math.abs(d.x - l.start.x) + Math.abs(d.y - l.start.y) >= 3, `seed ${seed}`);
    }
  }
});

test('same seed, same level; most seeds differ', () => {
  for (const opts of [{}, { width: 21, height: 13 }, { drifts: 3, spawns: 6 }]) {
    assert.deepEqual(generateLevel(77, opts), generateLevel(77, opts));
  }
  const maps = new Set();
  for (let seed = 0; seed < 20; seed++) maps.add(generateLevel(seed).map.join('\n'));
  assert.ok(maps.size >= 17, `${maps.size} distinct of 20`);
});

const plays = () => {
  let shipped = 0;
  const misses = [];
  for (let seed = 1; seed <= 10; seed++) {
    let s = init(seed, { levels: [generateLevel(seed)] });
    for (let i = 0; i < 1500 && s.status === 'playing'; i++) s = step(s, botInput(s));
    if (s.status === 'won') shipped++;
    else misses.push(seed);
  }
  return { shipped, misses };
};

test('the bot ships most generated levels, seeds 1..10', () => {
  const { shipped, misses } = plays();
  assert.ok(shipped >= 6, `${shipped} of 10, misses ${misses.join(' ')}`);
});

test('a wide sweep ships nearly everything', () => {
  const misses = [];
  for (let seed = 1; seed <= 60; seed++) {
    for (const opts of [{}, { drifts: 3 }, { width: 21, height: 13 }, { quorum: 9 }]) {
      let s = init(seed, { levels: [generateLevel(seed, opts)] });
      let i = 0;
      for (; i < 4000 && s.status === 'playing'; i++) s = step(s, botInput(s));
      if (s.status !== 'won') misses.push(`${seed}:${JSON.stringify(opts)}`);
    }
  }
  assert.ok(misses.length <= 6, `${misses.length} misses: ${misses.join(' ')}`);
});

console.log(failures === 0 ? 'all local checks pass' : failures + ' local checks fail');
process.exit(failures === 0 ? 0 : 1);

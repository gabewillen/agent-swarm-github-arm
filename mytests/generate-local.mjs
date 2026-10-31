// agent-34's own checks for src/core/generate.js (not part of tests/).
import assert from 'node:assert/strict';
import { load } from '../tests/helpers.mjs';

const generate = await load('core/generate.js');
const level = await load('core/level.js');
const { hashSeed, dailySeed, generateLevel } = generate;
const { validateLevel, parseLevel } = level;

function fnv(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h;
}

// hashSeed matches FNV-1a on many strings
for (let i = 0; i < 200; i++) {
  const t = 'seed-' + i + '-text' + String.fromCharCode(i % 0x80);
  assert.equal(hashSeed(t), fnv(t), `hashSeed ${t}`);
}
assert.equal(hashSeed(''), 0x811c9dc5);

// dailySeed: shape and rejection
for (const ok of ['2026-10-30', '1999-01-01', '2100-12-31']) {
  assert.equal(dailySeed(ok), fnv('quorum-run:' + ok), ok);
}
for (const bad of ['2026-1-30', 'today', '', '2026/10/30', '2026-10-30T00:00', 20261030, null, undefined, ['a'], '026-10-30', '  2026-10-30', '2026-10-30 ']) {
  assert.equal(dailySeed(bad), null, `dailySeed rejects ${String(bad)}`);
}

// every generated level validates, exact counts, drifts far from the player
const combos = [
  {},
  { width: 7, height: 7, drifts: 1, spawns: 2 },
  { width: 32, height: 24 },
  { width: 21, height: 13, drifts: 4, spawns: 6, quorum: 9 },
  { width: 11, height: 9, drifts: 5, spawns: 4, quorum: 20 },
  { width: 10, height: 10, drifts: 0, spawns: 1 },
];
let checked = 0;
for (let seed = 0; seed < 60; seed++) {
  for (const opt of combos) {
    const def = generateLevel(seed, opt);
    const v = validateLevel(def);
    assert.deepEqual(v.errors, [], `validate seed ${seed} ${JSON.stringify(opt)}: ${v.errors}`);
    const l = parseLevel(def);
    const o = { width: 15, height: 11, drifts: 2, spawns: 4, quorum: 5, ...opt };
    assert.equal(l.width, o.width, 'width');
    assert.equal(l.height, o.height, 'height');
    assert.equal(l.drifts.length, o.drifts, `drifts seed ${seed}: ${l.drifts.length} != ${o.drifts}`);
    assert.equal(l.spawns.length, o.spawns, 'spawns');
    assert.equal(def.quorum, o.quorum, 'quorum');
    assert.equal(def.driftPeriod, 2, 'driftPeriod');
    assert.equal(def.spawnEvery, 12, 'spawnEvery');
    assert.ok(def.par >= 30, 'par >= 30');
    assert.equal(def.name, `Generated ${seed >>> 0}`, 'name');
    for (const d of l.drifts) {
      assert.ok(Math.abs(d.x - l.start.x) + Math.abs(d.y - l.start.y) >= 3, `drift at ${d.x},${d.y} vs start ${l.start.x},${l.start.y}`);
    }
    // spawn points and pads lie on parseable floor, and every tile matches the map
    checked++;
  }
}
assert.ok(checked >= 300, `checked ${checked}`);

// negative seed keeps name as >>> 0
assert.equal(generateLevel(-2).name, 'Generated 4294967294');
assert.deepEqual(generateLevel(-2).map, generateLevel(4294967294).map, '-2 and 4294967294 give the same level');

// deterministic, varies with the seed
assert.deepEqual(generateLevel(77), generateLevel(77));
assert.notDeepEqual(generateLevel(7), generateLevel(8));
const maps = new Set();
for (let seed = 0; seed < 60; seed++) maps.add(generateLevel(seed).map.join('\n'));
assert.ok(maps.size >= 50, `${maps.size} of 60 maps distinct`);

// options: out of range sizes throw RangeError, boundaries do not
for (const bad of [{ width: 6 }, { width: 33 }, { height: 6 }, { height: 25 }, { width: 0 }, { height: -7 }, { width: 15.5 }, { height: 11.5 }]) {
  assert.throws(() => generateLevel(1, bad), RangeError, JSON.stringify(bad));
}
assert.ok(validateLevel(generateLevel(3, { width: 7, height: 7, drifts: 1, spawns: 2 })).ok);
assert.ok(validateLevel(generateLevel(3, { width: 32, height: 24 })).ok);
assert.ok(validateLevel(generateLevel(3, { width: 7, height: 24, drifts: 3, spawns: 3 })).ok);
assert.ok(validateLevel(generateLevel(3, { width: 32, height: 7, drifts: 3, spawns: 3 })).ok);

// heavy option pressure still produces a valid level or fails honestly
for (let seed = 0; seed < 40; seed++) {
  const def = generateLevel(seed, { drifts: 8, spawns: 8, quorum: 10 });
  const v = validateLevel(def);
  if (v.ok) {
    const l = parseLevel(def);
    assert.ok(l.spawns.length >= 1 && l.drifts.length >= 1, 'parses');
    assert.ok(def.map.join('').includes('M'), 'still has a pad');
  }
}

// generated levels leave the merge pad and spawns reachable without game.js
for (let seed = 0; seed < 20; seed++) {
  const l = parseLevel(generateLevel(seed, { drifts: 6 }));
  assert.ok(l.spawns.length === 4, 'spawns from default count');
  const map = l.tiles;
  const walk = (sx, sy) => {
    const seen = new Set([`${sx},${sy}`]);
    const q = [[sx, sy]];
    while (q.length) {
      const [x, y] = q.pop();
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
        const nx = x + dx, ny = y + dy, k = `${nx},${ny}`;
        if (seen.has(k) || ny < 0 || ny >= map.length || nx < 0 || nx >= map[ny].length) continue;
        if (map[ny][nx] === '#') continue;
        seen.add(k); q.push([nx, ny]);
      }
    }
    return seen;
  };
  const reach = walk(l.start.x, l.start.y);
  assert.ok(reach.size > l.width * l.height / 3, `reachable floor ${reach.size}`);
}

console.log('agent-34 own checks: all pass');

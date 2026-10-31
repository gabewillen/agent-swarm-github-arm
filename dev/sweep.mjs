// Agent-owned sweep (not part of the acceptance suite): stress the §19
// bullets of generate.js over many seeds and option sets, replicating the
// §4 shape checks locally since src/core/level.js may not exist yet.
import { generateLevel, hashSeed, dailySeed } from '../src/core/generate.js';
import assert from 'node:assert/strict';

const DRIFT_CHARS = '^>v<';

function check(def, w, h, drifts, spawns, label) {
  const map = def.map;
  assert.equal(map.length, h, label);
  const W = map[0].length;
  assert.equal(W, w, label);
  let at = 0, ex = 0, ps = 0, ms = 0, dr = 0, sx = 0, sy = 0;
  for (let y = 0; y < h; y++) {
    assert.equal(map[y].length, W, label);
    for (let x = 0; x < W; x++) {
      const ch = map[y][x];
      assert.ok('#.@PMX^>v<.'.includes(ch), `${label} bad char ${ch}`);
      if (x === 0 || y === 0 || x === W - 1 || y === h - 1) assert.equal(ch, '#', `${label} border`);
      else if (ch === '@') { at++; sx = x; sy = y; }
      else if (ch === 'X') ex++;
      else if (ch === 'P') ps++;
      else if (ch === 'M') ms++;
      else if (DRIFT_CHARS.includes(ch)) dr++;
    }
  }
  assert.equal(at, 1, label); assert.equal(ex, 1, label);
  assert.equal(ps, spawns, label); assert.ok(ms >= 1, label);
  assert.equal(dr, drifts, label);
  // reachability from @ over non-# cells
  const seen = new Set([sx]);
  const st = [[sx, sy]];
  seen.add(sy * W + sx);
  while (st.length) {
    const [x, y] = st.pop();
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      if (nx < 0 || ny < 0 || nx >= W || ny >= h) continue;
      if (map[ny][nx] === '#' || seen.has(ny * W + nx)) continue;
      seen.add(ny * W + nx);
      st.push([nx, ny]);
    }
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < W; x++) {
    if ('PMX'.includes(map[y][x])) assert.ok(seen.has(y * W + x), `${label} unreachable ${map[y][x]}`);
  }
  // §19: every drift at least 3 steps from the player start
  for (let y = 0; y < h; y++) for (let x = 0; x < W; x++) {
    if (DRIFT_CHARS.includes(map[y][x])) {
      const d = Math.abs(x - sx) + Math.abs(y - sy);
      assert.ok(d >= 3, `${label} drift ${x},${y} only ${d} from start`);
    }
  }
  assert.equal(def.quorum, 5, `${label} default quorum`);
}

const combos = [
  [15, 11, 2, 4],
  [21, 13, 4, 6],
  [7, 7, 1, 2],
  [32, 24, 2, 4],
  [15, 11, 5, 4],
  [9, 9, 3, 3],
];
for (const [w, h, dr, sp] of combos) {
  for (let seed = 0; seed < 300; seed++) {
    const def = generateLevel(seed, { width: w, height: h, drifts: dr, spawns: sp });
    check(def, w, h, dr, sp, `seed ${seed} ${w}x${h} d${dr} s${sp}`);
    if (seed < 20) assert.deepEqual(generateLevel(seed, { width: w, height: h, drifts: dr, spawns: sp }), def, 'determinism');
  }
}
// determinism with explicit quorum too
assert.deepEqual(generateLevel(99, { quorum: 9 }), generateLevel(99, { quorum: 9 }));
// variety
const maps = new Set();
for (let seed = 0; seed < 40; seed++) maps.add(generateLevel(seed).map.join('\n'));
assert.ok(maps.size >= 36, `variety ${maps.size}/40`);
// name and unsigned seed
assert.equal(generateLevel(-2).name, 'Generated 4294967294');
assert.equal(generateLevel(7).name, 'Generated 7');
// dailySeed basics
assert.equal(dailySeed('2026-10-30'), hashSeed('quorum-run:2026-10-30'));
for (const bad of ['2026-1-30', 'today', '', '2026/10/30', '2026-10-30T00:00', '2026-13-30', '2026-10-32', null, undefined, 42]) {
  assert.equal(dailySeed(bad), null, `dailySeed(${String(bad)})`);
}
// hashSeed FNV-1a sanity
assert.equal(hashSeed(''), 0x811c9dc5);
console.log('sweep OK — all combos validated');

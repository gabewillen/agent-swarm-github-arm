// Local self-check for src/core/achievements.js against every scenario of
// tests/28-achievements.test.mjs, with a minimal engine stub standing in
// for src/core/game.js while it has not landed (owned by other agents).
// Not part of the acceptance suite: run with `node my-tests/achievements.mjs`.
import assert from 'node:assert/strict';
import { ACHIEVEMENTS, checkAchievements } from '../src/core/achievements.js';

const IDS = ['first_pickup', 'first_merge', 'full_hands', 'monochrome', 'quorum', 'shipped', 'flawless', 'conflict', 'survivor', 'champion'];
const MAP = ['########', '#@PPPM.#', '#X.....#', '########'];

assert.deepEqual(ACHIEVEMENTS.map((a) => a.id), IDS);
for (const a of ACHIEVEMENTS) {
  assert.ok(typeof a.title === 'string' && a.title.length > 0);
  assert.ok(typeof a.description === 'string' && a.description.length > 0);
}

// Minimal init per DESIGN §5 for a no-drift, single-map level.
function init(map, extra = {}, seed = 1) {
  const level = { ...map && {}, map };
  const rows = map;
  const width = rows[0].length, height = rows.length;
  let px = 0, py = 0;
  const patches = [];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const ch = rows[y][x];
    if (ch === '@') { px = x; py = y; }
    if (ch === 'P') patches.push({ x, y, color: 1 });
  }
  let s = seed >>> 0;
  const colors = patches.map(() => ((s = (s + 0x6D2B79F5) >>> 0), 0));
  return {
    seed: s, tick: 0, levelTicks: 0, levels: [{ name: 'test', quorum: extra.quorum ?? 1, par: 100, driftPeriod: 1, spawnEvery: 1000, map }],
    levelIndex: 0, level: { ...level, width, height },
    player: { x: px, y: py }, carried: [], patches, drifts: [], conflicts: [],
    score: 0, lives: 3, merges: 0, open: false, invuln: 0, status: 'playing', paused: false, events: [],
  };
}

// Minimal step per DESIGN §6 (moves, pickups, merges, quorum only): enough
// for the four right-moves the real test plays.
function step(s, input) {
  const n = { ...s, player: s.player, carried: [...s.carried], events: [], seed: s.seed };
  const n1 = { ...n };
  n1.tick = s.tick + 1;
  n1.levelTicks = s.levelTicks + 1;
  const DIRS = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] };
  const [dx, dy] = DIRS[input.move];
  const tx = s.player.x + dx, ty = s.player.y + dy;
  n1.player = { x: tx, y: ty };
  const ch = MAP[ty][tx];
  const patchIdx = s.patches.findIndex((p) => p.x === tx && p.y === ty);
  n1.patches = [...s.patches];
  if (patchIdx >= 0) {
    n1.patches.splice(patchIdx, 1);
    n1.carried.push(s.patches[patchIdx].color);
    n1.events.push('pickup');
  }
  if (ch === 'M' && s.carried.length > 0) {
    const nPatches = s.carried.length;
    n1.score = s.score + (100 * nPatches * nPatches) + (nPatches >= 2 && s.carried.every((c) => c === s.carried[0]) ? 50 * nPatches : 0);
    n1.merges = s.merges + nPatches;
    n1.carried = [];
    n1.events.push('merge');
    if (n1.merges >= s.levels[s.levelIndex].quorum && !s.open) {
      n1.open = true;
      n1.events.push('quorum');
    }
  }
  return n1;
}

// a pickup earns first_pickup once
const s = init(MAP);
const n = { ...s, events: ['pickup'], carried: [0] };
assert.deepEqual(checkAchievements(s, n, []), ['first_pickup']);
assert.deepEqual(checkAchievements(s, n, ['first_pickup']), []);

// merging one patch earns first_merge only
const s9 = init(MAP, { quorum: 9 });
assert.deepEqual(checkAchievements({ ...s9, carried: [1] }, { ...s9, events: ['merge'] }, []), ['first_merge']);

// merging three earns full_hands; one colour earns monochrome too
assert.deepEqual(checkAchievements({ ...s9, carried: [0, 1, 2] }, { ...s9, events: ['merge'] }, ['first_merge']), ['full_hands']);
assert.deepEqual(checkAchievements({ ...s9, carried: [2, 2, 2] }, { ...s9, events: ['merge'] }, ['first_merge']), ['full_hands', 'monochrome']);

// quorum, shipped, and flawless
const sq = init(MAP, { quorum: 1 });
assert.deepEqual(checkAchievements(sq, { ...sq, events: ['merge', 'quorum'] }, ['first_merge']), ['quorum']);
assert.deepEqual(checkAchievements(sq, { ...sq, events: ['level'], levelIndex: 1 }, []), ['shipped', 'flawless']);
assert.deepEqual(checkAchievements(sq, { ...sq, events: ['level'], levelIndex: 1, lives: 2 }, []), ['shipped']);

// conflict, survivor, and champion
assert.deepEqual(checkAchievements(sq, { ...sq, events: ['conflict'] }, []), ['conflict']);
assert.deepEqual(checkAchievements(sq, { ...sq, events: ['level'], levelIndex: 3, lives: 1 }, ['shipped']), ['survivor']);
assert.deepEqual(checkAchievements(sq, { ...sq, events: ['won'], status: 'won', lives: 1 }, []), ['shipped', 'champion']);

// nothing happening earns nothing
assert.deepEqual(checkAchievements(sq, { ...sq, events: [] }, []), []);

// a real game earns achievements in order
let st = init(MAP, { quorum: 3 });
st = { ...st, patches: st.patches.map((p) => ({ ...p, color: 1 })) };
const unlocked = [];
for (const m of ['right', 'right', 'right', 'right']) {
  const nt = step(st, { move: m, pause: false });
  unlocked.push(...checkAchievements(st, nt, unlocked));
  st = nt;
}
assert.deepEqual(unlocked, ['first_pickup', 'first_merge', 'full_hands', 'monochrome', 'quorum']);

console.log('achievements local self-check: all scenarios pass');

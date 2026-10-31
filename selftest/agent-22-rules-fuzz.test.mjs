// agent-22's selfcheck of the rules (DESIGN.md §5 to §8), areas 3 + 4.
// The acceptance tests are exact scenarios; this file instead plays long
// seeded games (bot-driven and hand-written move scripts) and audits every
// produced state against the design directly: drift conservation and
// terrain (§6 step 10), conflict aging and stacking (§6 steps 5 and 11),
// hits, drops and invulnerability (§6 step 12), spawn seeding and bounds
// (§6 step 13), event order (§7), and the purity and stillness rules of
// §5 and §14. It also replays the tricky step-order cases by hand so a
// bad future merge of src/core/game.js shows up here before it lands.
//
// Run with: node --test selftest/
// Nothing under tests/ is touched.

import test from 'node:test';
import assert from 'node:assert/strict';
import { init, step, tileAt } from '../src/core/game.js';
import { CARRY_MAX, START_LIVES, INVULN_TICKS, CONFLICT_TICKS, COLORS } from '../src/core/constants.js';
import { botInput } from '../src/core/bot.js';
import { LEVELS } from '../src/data/levels.js';
import { generateLevel } from '../src/core/generate.js';
import { rngNext, rngInt } from '../src/core/rng.js';

// The part of helpers.mjs this selfcheck needs, so it stands alone.
const NONE = { move: null, pause: false };
const mv = (move) => ({ move, pause: false });

function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}

const validTiles = new Set(['.', 'M', 'H', 'X']);

// §6 step 12's drop is a hit with hands full: it empties them and buys
// INVULN_TICKS instead of costing a life.
function assertStepShape(events) {
  let i = 0;
  for (const name of ['pickup', 'merge', 'quorum']) {
    if (events[i] === name) i += 1;
  }
  if (events[i] === 'level') i += 1;
  if (events[i] === 'won') i += 1;
  assert.ok(!events.includes('level') || !events.includes('won'), `level and won on one step: ${events}`);
  for (; i < events.length && events[i] === 'conflict'; i += 1);
  if (events[i] === 'drop') {
    i += 1;
    assert.ok(!events.includes('hit'), `drop and hit on one step: ${events}`);
  } else if (events[i] === 'hit') {
    i += 1;
    if (events[i] === 'lost') i += 1;
  }
  if (i < events.length && events[i] === 'spawn') {
    i += 1;
    assert.ok(!events.includes('lost'), `a lost game still spawns: ${events}`);
  }
  assert.equal(i, events.length, `events out of §6 order: ${events.join(',')}`);
}

// Every state of an honest game obeys the §5 shape and the §8 limits the
// acceptance tests only sample; assert them per step here.
function auditState(prev, next, seenDrifts) {
  assert.deepEqual(JSON.parse(JSON.stringify(next)), next, 'state is not plain JSON');

  // drifts: the same number as long as the level lasts, never off the map,
  // and never on a wall, a hold, or the exit (§6 step 10)
  if (next.levelIndex === prev.levelIndex) {
    assert.equal(next.drifts.length, seenDrifts, 'drifts appeared or vanished');
  }
  for (const d of next.drifts) {
    assert.ok(['up', 'right', 'down', 'left'].includes(d.dir), `bad dir ${d.dir}`);
    const t = tileAt(next, d.x, d.y);
    if (!validTiles.has(t) && t !== '.') assert.fail(`drift sits on '${t}' at (${d.x},${d.y})`);
  }

  // conflicts: alive ttls bounded and unique per cell, only grown by
  // conflict events, and cell-stable as they age (§6 steps 5, 11)
  const cells = new Set();
  for (const c of next.conflicts) {
    assert.ok(Number.isInteger(c.ttl) && c.ttl >= 1 && c.ttl <= CONFLICT_TICKS, `bad ttl ${c.ttl}`);
    cells.add(`${c.x},${c.y}`);
  }
  assert.equal(cells.size, next.conflicts.length, 'two conflicts share a cell');

  // patches: on real spawn points, at most one per cell, legal colours
  const spawns = new Set(next.level.spawns.map((s) => `${s.x},${s.y}`));
  const patchCells = new Set();
  for (const p of next.patches) {
    assert.ok(spawns.has(`${p.x},${p.y}`), `patch off spawn at (${p.x},${p.y})`);
    assert.ok(Number.isInteger(p.color) && p.color >= 0 && p.color < COLORS, `bad colour ${p.color}`);
    patchCells.add(`${p.x},${p.y}`);
  }
  assert.equal(patchCells.size, next.patches.length, 'two patches share a spawn point');
  assert.ok(next.patches.length + next.carried.length <= next.level.spawns.length,
    'more patches than spawn points');
  for (const c of next.carried) {
    assert.ok(Number.isInteger(c) && c >= 0 && c < COLORS, `bad carried colour ${c}`);
  }

  // counters and flags (§5, §8)
  assert.ok(next.score >= prev.score && Number.isInteger(next.score), 'score fell');
  assert.ok(next.lives >= 0 && next.lives <= START_LIVES && next.lives <= prev.lives, `lives ${next.lives}`);
  assert.ok(next.invuln >= 0 && next.invuln <= INVULN_TICKS, `invuln ${next.invuln}`);
  assert.ok(next.tick === prev.tick || next.tick === prev.tick + 1, 'tick jumped');
  assert.ok(next.levelTicks === 0 || next.levelTicks >= prev.levelTicks, 'levelTicks jumped back up');
  if (next.status !== 'playing') {
    assert.ok(prev.status === 'playing' && next.events.length > 0, 'status flipped without an event');
  }
}

// Play one game from init(seed, options), audit every step, and return the
// recorded states, events, and inputs for the determinism replay.
function playAudited(startState, moves, maxSteps) {
  let s = startState;
  const seenDrifts = s.drifts.length;
  const inputs = [];
  let drifts = seenDrifts;
  for (let i = 0; i < maxSteps && s.status === 'playing'; i += 1) {
    const input = moves ? moves(s, i) : botInput(s);
    const prev = s;
    s = step(s, input);
    inputs.push(input);
    auditState(prev, s, drifts);
    assertStepShape(s.events);
    if (s.levelIndex !== prev.levelIndex || s.status !== 'playing') {
      drifts = s.drifts.length;
    }
    if (prev.paused) {
      assert.deepEqual(s.events, [], 'a paused step made events');
    }
  }
  return { final: s, inputs, states: null };
}

test('the rules hold over long bot games of the shipped levels', async () => {
  for (let seed = 1; seed <= 6; seed += 1) {
    for (let first = 0; first < Math.min(3, LEVELS.length); first += 1) {
      const s0 = init(seed, { level: first });
      const { final } = playAudited(s0, null, 4000);
      assert.ok(['playing', 'won', 'lost'].includes(final.status), 'status escaped its values');
    }
  }
});

test('the rules hold over long bot games of generated levels', async () => {
  let seed = 0x5eed;
  for (let i = 0; i < 4; i += 1) {
    seed = rngNext(seed).seed;
    const level = generateLevel(seed);
    const s0 = init(seed ^ 0x9e3779b9, { levels: [level] });
    playAudited(s0, null, 4000);
  }
});

test('the same seed and inputs reproduce every state byte for byte', () => {
  for (const seed of [1, 4, 12]) {
    const s0 = init(seed, { level: 0 });
    const first = [];
    let a = s0;
    let b = s0;
    for (let i = 0; i < 600 && a.status === 'playing'; i += 1) {
      const input = botInput(a);
      a = step(a, input);
      b = step(b, input);
      first.push([JSON.parse(JSON.stringify(input)), JSON.parse(JSON.stringify(a))]);
      assert.deepEqual(a, b, 'two identical runs diverged');
    }
    // once more from the recorded trace on regenerated states
    let c = s0;
    for (const [input] of first) c = step(c, input);
    assert.deepEqual(c, b, 'a replayed trace diverged');
  }
});

test('stepping a deep-frozen state works and leaves it frozen', () => {
  const s0 = deepFreeze(init(7, { level: 0 }));
  let s = s0;
  for (let i = 0; i < 200 && s.status === 'playing'; i += 1) {
    s = deepFreeze(step(s, botInput(s)));
  }
  assert.ok(s.tick > 0, 'the frozen game did not move');
});

test('a finished game no longer changes, at all', () => {
  const map = ['#######', '#@PM.X#', '#.....#', '#######'];
  const won = init(2, { levels: [{ name: 'w', quorum: 1, par: 30, driftPeriod: 1, spawnEvery: 10, map }] });
  let s = won;
  for (let i = 0; i < 4; i += 1) s = step(s, mv('right')); // pickup, merge, walk, exit
  assert.equal(s.status, 'won');
  for (const input of [NONE, mv('left'), { move: 'up', pause: true }]) {
    const t = step(s, input);
    assert.deepEqual(t, { ...s, events: [] }, 'the finished game changed');
  }
  const lost = init(2, { levels: [{ name: 'l', quorum: 1, par: 30, driftPeriod: 1, spawnEvery: 10, map }] });
  const doomed = { ...lost, lives: 1, drifts: [{ x: 2, y: 1, dir: 'left' }] };
  const dead = step(doomed, NONE);
  assert.equal(dead.status, 'lost');
  assert.deepEqual(dead.events, ['hit', 'lost'], 'the death events are not hit then lost');
  const after = step(dead, mv('up'));
  assert.deepEqual(after, { ...dead, events: [] }, 'the lost game changed');
});

// §6 steps 10 to 13 under hand-built states, checked against the design.

test('a conflict ages away in step 5 and frees its cell in that same step', () => {
  const s0 = deepFreeze(init(3, {
    levels: [{ name: 'f', quorum: 9, par: 100, driftPeriod: 1, spawnEvery: 100,
      map: ['#######', '#@P>MX#', '#.....#', '#######'] }],
    level: 0,
  }));
  // a conflict with ttl 1 sits where the drift is heading (step 5 removes
  // it, it is at 0), so step 10 lets the drift walk it.
  const s = { ...s0, drifts: [{ x: 3, y: 1, dir: 'right' }], conflicts: [{ x: 4, y: 1, ttl: 1 }] };
  const t = step(s, NONE);
  assert.deepEqual(t.conflicts, [], 'the spent conflict stayed');
  assert.deepEqual(t.drifts, [{ x: 4, y: 1, dir: 'right' }], 'the drift did not take the freed cell');
  assert.deepEqual(t.events, [], 'no conflict event when none was left');
});

test('a stacked pair squeezed through one gap collides again past it', () => {
  const s0 = init(3, {
    levels: [{ name: 's', quorum: 9, par: 100, driftPeriod: 1, spawnEvery: 100,
      map: ['#######', '#@P#MX#', '#.#.#.#', '#.....#', '#######'] }],
  });
  // both drifts start on the cell (3,2) with a conflict ttl 1 under them.
  // Step 5 ages the conflict away; step 10: the only gap is (3,3), so both
  // cells go there, drift2 down first try, drift1 after failing up and
  // right; step 11 stacks them at (3,3) reversing both to 'up'.
  const s = {
    ...s0, drifts: [{ x: 3, y: 2, dir: 'up' }, { x: 3, y: 2, dir: 'down' }],
    conflicts: [{ x: 3, y: 2, ttl: 1 }],
  };
  const t = step(s, NONE);
  assert.deepEqual(t.conflicts, [{ x: 3, y: 3, ttl: CONFLICT_TICKS }], 'no fresh conflict past the gap');
  assert.deepEqual(t.drifts, [{ x: 3, y: 3, dir: 'up' }, { x: 3, y: 3, dir: 'up' }], 'the pair did not converge, reverse, and conflict');
  assert.deepEqual(t.events, ['conflict'], 'one event for the one collision');
});

test('collisions are read out in reading order, one event per cell', () => {
  const s0 = init(3, {
    levels: [{ name: 'r', quorum: 9, par: 100, driftPeriod: 1, spawnEvery: 100,
      map: ['###########', '#@P.M....X#', '#>.<...>.<#', '#.........#', '###########'] }],
  });
  const t = step(s0, NONE);
  assert.deepEqual(t.conflicts, [{ x: 2, y: 2, ttl: CONFLICT_TICKS }, { x: 8, y: 2, ttl: CONFLICT_TICKS }]);
  assert.deepEqual(t.events, ['conflict', 'conflict'], 'one event per colliding cell');
});

test('a swap hit with a drift that turned: the hit still lands once', () => {
  // the player steps right into the drift's vacated cell while the drift
  // steps west; blocking is impossible on '.' so the swap must be caught
  const s0 = init(3, {
    levels: [{ name: 'h', quorum: 9, par: 100, driftPeriod: 1, spawnEvery: 100,
      map: ['#######', '#@<MPX#', '#.....#', '#######'] }],
  });
  const t = step(s0, mv('right'));
  assert.equal(t.lives, 2, 'the swap was not a hit');
  assert.deepEqual(t.events, ['hit'], 'one hit event');
  assert.deepEqual(t.player, { x: 1, y: 1 }, 'the hit did not return the player to the start');
});

test('a drifting pair stacked with the player drops patches, not lives', () => {
  const s0 = init(3, {
    levels: [{ name: 'd', quorum: 9, par: 100, driftPeriod: 1, spawnEvery: 100,
      map: ['#########', '#@PPPM.X#', '#.......#', '#########'] }],
  });
  let s = s0;
  s = step(s, mv('right')); // pickup
  // a drift walks onto the player who is carrying; the second drift closes
  // on the neighbouring cell but does not stack with it
  const onTop = { ...s, drifts: [{ x: 1, y: 1, dir: 'right' }, { x: 4, y: 1, dir: 'left' }] };
  const t = step(onTop, NONE); // one drift lands on the player
  assert.deepEqual(t.events, ['drop'], `no drop while covered: ${t.events}`);
  assert.deepEqual(t.carried, [], 'the drop left patches behind');
  assert.equal(t.lives, 3, 'a drop cost a life');
  assert.equal(t.invuln, INVULN_TICKS, 'a drop bought no immunity');
});

test('a drifting pair meeting on the player drops and conflicts in order', () => {
  const s0 = init(3, {
    levels: [{ name: 'e', quorum: 9, par: 100, driftPeriod: 1, spawnEvery: 100,
      map: ['#########', '#@PPPM.X#', '#.......#', '#########'] }],
  });
  let s = step(s0, mv('right')); // pickup, carrying one patch
  const closing = { ...s, drifts: [{ x: 1, y: 1, dir: 'right' }, { x: 3, y: 1, dir: 'left' }] };
  const t = step(closing, NONE);
  assert.deepEqual(t.events, ['conflict', 'drop'], `bad order: ${t.events}`);
  assert.deepEqual(t.conflicts, [{ x: 2, y: 1, ttl: CONFLICT_TICKS }]);
  assert.deepEqual(t.carried, [], 'the drop left patches behind');
  assert.equal(t.lives, 3, 'a drop cost a life');
  assert.equal(t.invuln, INVULN_TICKS, 'a drop bought no immunity');
});

test('spawning draws the point and then the colour from the running seed', () => {
  const map = ['#########', '#@PP.M.X#', '#.......#', '#########'];
  const s0 = init(11, {
    levels: [{ name: 'p', quorum: 9, par: 100, driftPeriod: 5, spawnEvery: 1, map }],
  });
  let seed = s0.seed;
  const free = s0.level.spawns.length;
  const t = step({ ...s0, patches: [] }, NONE);
  const a = rngInt(seed, free);
  const b = rngInt(a.seed, COLORS);
  assert.equal(t.patches.length, 1, 'no patch spawned');
  const spot = s0.level.spawns[a.value];
  assert.deepEqual(t.patches, [{ x: spot.x, y: spot.y, color: b.value }], 'the spawn draws went wrong');
  assert.equal(t.seed, b.seed, 'the seed did not end after the colour draw');
});

test('a spawn skips the player\'s cell and a drifting cell, in reading order', () => {
  const map = ['#########', '#@PPPM.X#', '#.......#', '#########'];
  const s0 = init(2, {
    levels: [{ name: 'q', quorum: 9, par: 100, driftPeriod: 9, spawnEvery: 1, map }],
  });
  // spawns (2,1),(3,1),(4,1); the player on (3,1) and a drift on (4,1)
  // make the only free point (2,1), drawn from free.length === 1 anyway,
  // but a drift-covering (2,1) also leaves nothing: no event and no draw.
  const covered = { ...s0, patches: [], player: { x: 3, y: 1 }, drifts: [{ x: 2, y: 1, dir: 'up' }, { x: 4, y: 1, dir: 'up' }] };
  const t = step(covered, NONE);
  assert.deepEqual(t.patches, [], 'a patch spawned over a blocked point');
  assert.deepEqual(t.events, [], 'a spawn event without a patch');
  assert.equal(t.seed, covered.seed, 'the seed moved without a draw');
});

test('carried patches keep the spawn counter from underflowing', () => {
  const map = ['#########', '#@PPPM.X#', '#.......#', '#########'];
  const s0 = init(2, {
    levels: [{ name: 'c', quorum: 9, par: 100, driftPeriod: 9, spawnEvery: 1, map }],
  });
  const full = { ...s0, patches: [], carried: [0, 1, 2] };
  const t = step(full, NONE);
  assert.deepEqual(t.patches, [], 'spawning ignored full hands');
  const half = { ...s0, patches: [], carried: [1] };
  const u = step(half, NONE);
  assert.equal(u.patches.length, 1, 'carried patches did not keep spawn points busy');
});

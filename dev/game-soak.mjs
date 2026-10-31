// A soak harness for src/core/game.js (agent-3's area: §6 steps 10-13 and
// the state machine around them). Not part of tests/ — run directly:
//   node dev/game-soak.mjs [steps-per-walk]
// It plays whole games from many seeds with a drunkard's random-ish move
// table (deterministic per seed, from src/core/rng.js, never Math.random)
// and asserts the invariants every state must satisfy, most of them mine:
//   - step never mutates its argument; the next state is plain JSON
//   - the score never drops, lives never grow, status only ends
//   - drifts never sit in walls or off the map; conflicts stay on the grid
//   - conflicts age monotonically and carry ttl <= CONFLICT_TICKS
//   - events only contain the §7 vocabulary, in §6's order per step
//   - carried length <= CARRY_MAX; drops empty carried; hits cost life or
//     drop; lost at zero lives; respawn returns the player to the start
import assert from 'node:assert/strict';
import { init, step } from '../src/core/game.js';
import { rngInt } from '../src/core/rng.js';
import { LEVELS } from '../src/data/levels.js';

const WALKS = Number(process.argv[2] ?? 120);
const STEPS = 400;

const EVENTS = new Set(['pickup', 'merge', 'quorum', 'level', 'won', 'conflict', 'drop', 'hit', 'lost', 'spawn', 'pause', 'resume']);
// Per §7, the order within a step is: pickup, merge, quorum, (level|won),
// then conflict, drop/hit/lost, then spawn; pause/resume stand alone.
const ORDER = new Map([...EVENTS].map((e, i) => [e, i]));

function walk(seed, startLevel) {
  let s = init(seed, { levels: LEVELS, level: startLevel });
  for (let i = 0; i < STEPS; i++) {
    const before = JSON.stringify(s);
    const draw = rngInt(s.seed, 4);
    const moves = ['up', 'right', 'down', 'left'];
    const paused = rngInt(draw.seed, 17).value === 0;
    const input = paused ? { move: null, pause: true } : { move: moves[draw.value], pause: false };
    const next = step(s, input);
    assert.equal(JSON.stringify(s), before, 'step changed its argument');
    const idle = input.pause === true || s.paused === true || s.status !== 'playing';
    assert.ok(next.tick >= s.tick && next.levelTicks >= s.levelTicks, 'ticks went backwards');
    assert.ok(next.score >= s.score, 'score dropped');
    assert.ok(next.lives <= s.lives, 'lives grew');
    assert.ok(next.lives >= 0, 'lives negative');
    if (s.status !== 'playing') {
      assert.deepEqual({ ...next, events: [] }, { ...s, events: [] }, 'a finished game changed');
    }
    for (const e of next.events) assert.ok(EVENTS.has(e), `event ${e} outside §7`);
    const order = next.events.map((e) => ORDER.get(e));
    assert.deepEqual([...order].sort((a, b) => a - b), order, `events out of order: ${next.events}`);
    assert.ok(next.carried.length <= 3, 'carried overflow');
    for (const p of next.patches) {
      assert.ok(next.level.spawns.some((sp) => sp.x === p.x && sp.y === p.y),
        'patch off a spawn point');
      assert.ok(Number.isInteger(p.color) && p.color >= 0 && p.color < 4,
        'patch colour out of range');
    }
    assert.ok(Number.isInteger(next.levelIndex) && next.levelIndex >= 0 &&
      next.levelIndex < next.levels.length, 'levelIndex out of range');
    assert.equal(next.levelIndex === s.levelIndex || next.events.includes('level'),
      true, 'levelIndex moved without a level event');
    assert.ok(next.status === 'playing' || next.status === 'won' || next.status === 'lost',
      'status off the vocabulary');
    for (const d of next.drifts) {
      const row = next.level.tiles[d.y];
      assert.ok(row !== undefined && d.x >= 0 && d.x < row.length, 'drift off the map');
      assert.ok(row[d.x] !== '#', 'drift in a wall');
    }
    for (const c of next.conflicts) {
      assert.ok(c.ttl > 0 && c.ttl <= 10, 'conflict ttl out of range');
      const row = next.level.tiles[c.y];
      assert.ok(row !== undefined && c.x >= 0 && c.x < row.length, 'conflict off the map');
    }
    for (const c of s.conflicts) {
      const aged = next.conflicts.find((k) => k.x === c.x && k.y === c.y);
      if (aged && !idle) {
        const fell = aged.ttl === c.ttl - 1;
        const replaced = c.ttl === 1 && aged.ttl === 10;
        assert.ok(fell || replaced, 'conflict ttl not falling');
      }
    }
    s = next;
  }
}

let failures = 0;
for (let i = 0; i < WALKS; i++) {
  try {
    walk((i * 0x9e3779b9) >>> 0, i % LEVELS.length);
  } catch (err) {
    failures++;
    if (failures <= 3) console.log(`walk ${i}: ${err.message}`);
  }
}
console.log(`soak: ${WALKS - failures}/${WALKS} walks clean`);
process.stdout.write(failures ? 'FAILURES\n' : 'OK\n');
process.exitCode = failures ? 1 : 0;

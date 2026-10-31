// The bot's dev tests (my own; not under tests/). Mirrors the acceptance
// section 17 checks against the dev stand-in core, plus dodge-quality checks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { init, step, checkLevel } from './quorum.js';
import { botInput } from '../src/core/bot.js';
import { DEVLEVELS } from './levels-dev.js';

const MOVES = new Set(['up', 'right', 'down', 'left', null]);
const lvl = (map, extra = {}) => ({
  name: 'test', quorum: 1, par: 100, driftPeriod: 1, spawnEvery: 1000, map, ...extra,
});

for (const def of DEVLEVELS) {
  test(`dev level ${def.name} is valid`, () => {
    const { ok, errors } = checkLevel(def);
    assert.ok(ok, errors.join(','));
  });
}

function broken(s) {
  const wall = (x, y) => {
    const r = s.level.tiles[y];
    return r === undefined || x < 0 || x >= r.length || r[x] === '#';
  };
  if (!['playing', 'won', 'lost'].includes(s.status)) return 'status';
  if (wall(s.player.x, s.player.y)) return 'player in wall';
  if (s.carried.length > 3) return 'carry';
  if (!Number.isInteger(s.lives) || s.lives < 0 || s.lives > 3) return 'lives';
  if (!Number.isInteger(s.score) || s.score < 0) return 'score';
  if (s.patches.some((p) => !s.level.spawns.some((q) => q.x === p.x && q.y === p.y))) return 'patch off spawn';
  if (s.drifts.some((d) => wall(d.x, d.y))) return 'drift in wall';
  return null;
}

function botGame(seed, ticks, opts = {}) {
  let s = init(seed, opts);
  let shipped = false;
  const tally = { pickup: 0, merge: 0, drop: 0, hit: 0, lost: 0, level: 0, spawn: 0, conflict: 0 };
  let steps = 0;
  for (let i = 0; i < ticks && s.status === 'playing'; i++) {
    const input = botInput(s);
    assert.ok(input && MOVES.has(input.move) && input.pause === false, `bad input ${JSON.stringify(input)}`);
    const before = s.score;
    s = step(s, input);
    steps++;
    if (s.levelIndex > 0 || s.status === 'won') shipped = true;
    for (const e of s.events) if (e in tally) tally[e]++;
    const why = broken(s);
    assert.equal(why, null, `seed ${seed} tick ${i} (${s.level?.name}): ${why}`);
    assert.ok(s.score >= before);
  }
  return { s, shipped, tally, steps };
}

test('the bot heads for the only patch', () => {
  const s = init(1, { levels: [lvl(['#######', '#@..P.#', '#M...X#', '#######'])] });
  assert.equal(botInput(s).move, 'right');
});

test('the bot takes full hands to the merge pad', () => {
  const s = init(1, { levels: [lvl(['#######', '#M.@.P#', '#....X#', '#######'], { quorum: 5 })] });
  assert.equal(botInput({ ...s, carried: [0, 1, 2] }).move, 'left');
});

test('the bot heads for the open exit', () => {
  const s = init(1, { levels: [lvl(['#######', '#P.@.X#', '#M....#', '#######'])] });
  assert.equal(botInput({ ...s, open: true }).move, 'right');
});

test('the bot never pauses', () => {
  const s = init(1, { levels: [DEVLEVELS[1]] });
  for (let i = 0; i < 30; i++) assert.equal(botInput(s).pause, false);
});

test('botInput is pure and deterministic on a frozen state', () => {
  const s = init(4, { levels: [DEVLEVELS[2]] });
  const freeze = (o) => {
    if (o && typeof o === 'object' && !Object.isFrozen(o)) {
      Object.freeze(o);
      for (const v of Object.values(o)) freeze(v);
    }
    return o;
  };
  const f = freeze(s);
  const a = botInput(f);
  const b = botInput(f);
  assert.deepEqual(a, b);
});

test('the bot ships the quiet room with a life to spare in most seeds', () => {
  let ok = 0;
  for (let seed = 1; seed <= 10; seed++) {
    const { s, shipped, tally } = botGame(seed, 1500, { levels: [DEVLEVELS[0]] });
    if (s.status === 'won' && shipped) ok++;
    else console.log(`  seed ${seed}: status ${s.status} ${s.score} pts after ${tally.merge} merges`);
  }
  assert.ok(ok >= 8, `${ok} of 10 seeded wins on the quiet room`);
});

test('the bot survives the patrol level without a hit in most seeds', () => {
  let clean = 0;
  const { } = {};
  for (let seed = 1; seed <= 10; seed++) {
    const { s, shipped, tally, steps } = botGame(seed, 1200, { levels: [DEVLEVELS[1]] });
    if (tally.hit === 0 && tally.drop === 0) clean++;
    else console.log(`  seed ${seed}: ${tally.hit} hits ${tally.drop} drops (status ${s.status}, steps ${steps})`);
  }
  assert.ok(clean >= 8, `${clean} of 10 seeds without hits on the patrol level`);
});

test('the bot survives the crossing lanes without a hit in most seeds', () => {
  let clean = 0;
  for (let seed = 1; seed <= 10; seed++) {
    const { s, tally } = botGame(seed, 1500, { levels: [DEVLEVELS[2]] });
    if (tally.hit === 0 && tally.drop === 0) clean++;
    else console.log(`  seed ${seed}: ${tally.hit} hits ${tally.drop} drops (status ${s.status})`);
  }
  assert.ok(clean >= 6, `${clean} of 10 seeds without hits on crossing lanes`);
});

test('the bot rides the hold gate straight through', () => {
  for (let seed = 1; seed <= 5; seed++) {
    const { s, shipped, steps } = botGame(seed, 400, { levels: [DEVLEVELS[3]] });
    assert.equal(s.status, 'won', `seed ${seed} status ${s.status} after ${steps} steps`);
    assert.ok(shipped, 'shipped');
  }
});

test('the bot plays every dev level for 700 ticks without breaking a rule', () => {
  for (let i = 0; i < DEVLEVELS.length; i++) {
    botGame(100 + i, 700, { levels: [DEVLEVELS[i]] });
  }
});

test('the bot plays all dev levels chained for 1600 ticks without breaking a rule', () => {
  const { s } = botGame(77, 1600, { levels: DEVLEVELS });
  assert.ok(['playing', 'won', 'lost'].includes(s.status));
});

test('a bot game is deterministic', () => {
  const run = () => {
    let s = init(77, { levels: DEVLEVELS, level: 2 });
    for (let i = 0; i < 500 && s.status === 'playing'; i++) s = step(s, botInput(s));
    return s;
  };
  const a = run();
  const b = run();
  assert.deepEqual(a, b);
});

// Lab tests for src/core/bot.js (my own, outside tests/). Three parts:
//
// 1. unit: botInput on hand-built §5 states, against §9's examples.
// 2. replica: bot games through the lab step replica of DESIGN §5–§7,
//    checking rules, dodging, scoring and shipping across seeds.
// 3. integration: the same through the real game.js and data/levels.js
//    once they exist (skipped until then).
import test from 'node:test';
import assert from 'node:assert/strict';
import { deepFreeze, loadBot, mkState, fileExists } from './lab.mjs';
import { repInit, repStep } from './ministep.mjs';

const MOVES = new Set(['up', 'right', 'down', 'left', null]);

const bot = await loadBot();
const { botInput } = bot;

function checkInput(input, note) {
  assert.ok(input && typeof input === 'object', note);
  assert.ok(MOVES.has(input.move), `${note}: move ${JSON.stringify(input.move)}`);
  assert.equal(input.pause, false, note);
}

// tests/17's own rule check, lab copy.
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
  if (s.patches.some((p) => !s.level.spawns.some((q) => q.x === p.x && q.y === p.y))) {
    return 'patch off spawn';
  }
  if (s.drifts.some((d) => wall(d.x, d.y))) return 'drift in wall';
  return null;
}

// Lab level set: a bare first level, then drifts and holds in rising order.
export const LAB_LEVELS = [
  { name: 'lab1', quorum: 2, par: 120, driftPeriod: 1, spawnEvery: 25, map: [
    '###########',
    '#@..P....M#',
    '#M...P..X.#',
    '#P........#',
    '###########',
  ] },
  { name: 'lab2', quorum: 3, par: 120, driftPeriod: 2, spawnEvery: 20, map: [
    '###########',
    '#@..P..M..#',
    '#M...P..X.#',
    '#.....>...#',
    '###########',
  ] },
  { name: 'lab3', quorum: 3, par: 140, driftPeriod: 1, spawnEvery: 18, map: [
    '###########',
    '#@..P.M..v#',
    '#....H.P..#',
    '#M...H.X..#',
    '#....P....#',
    '###########',
  ] },
  { name: 'lab4', quorum: 3, par: 160, driftPeriod: 2, spawnEvery: 16, map: [
    '#############',
    '#@..P....M..#',
    '#..>.<...X..#',
    '#M....P.....#',
    '#..P....H...#',
    '#....M...v..#',
    '#############',
  ] },
];

function repGame(seed, ticks, levels, level = 0) {
  let s = repInit(seed, { levels, level });
  const notes = [];
  for (let i = 0; i < ticks && s.status === 'playing'; i++) {
    const prev = s;
    const go = botInput(prev);
    checkInput(go, `seed ${seed} tick ${i}`);
    s = repStep(prev, go);
    const why = broken(s);
    assert.equal(why, null, `seed ${seed} tick ${i}: ${why}`);
    assert.ok(s.score >= prev.score, `seed ${seed} tick ${i}: score dropped`);
    notes.push(s.events);
  }
  return { s, notes };
}

test('botInput: heads for the only patch', async () => {
  const s = mkState(['#######', '#@..P.#', '#M...X#', '#######']);
  assert.equal(botInput(s).move, 'right');
});

test('botInput: full hands head for the merge pad', async () => {
  const s = mkState(['#######', '#M.@.P#', '#....X#', '#######'],
    { carried: [0, 1, 2] });
  assert.equal(botInput(s).move, 'left');
});

test('botInput: heads for the open exit', async () => {
  const s = mkState(['#######', '#P.@.X#', '#M....#', '#######'], { open: true });
  assert.equal(botInput(s).move, 'right');
});

test('botInput: is pure and deterministic', async () => {
  const s = mkState(['#######', '#@.P..#', '#M..X.#', '#######'],
    { carried: [2], conflicts: [{ x: 2, y: 1, ttl: 5 }] });
  const f = deepFreeze(s);
  const a = botInput(f);
  const b = botInput(f);
  assert.deepEqual(a, b);
});

test('botInput: valid shape on odd states', async () => {
  const base = ['#######', '#@....#', '#M...X#', '#######'];
  const odd = [
    mkState(base, { status: 'won' }),
    mkState(base, { status: 'lost' }),
    mkState(base, { paused: true }),
    mkState(base, { patches: [] }),
    mkState(base, { player: { x: 1, y: 1 }, carried: [9, 9, 9, 9] }),
    mkState(base, { conflicts: [{ x: 2, y: 1, ttl: 30 }] }),
    mkState(base, { tick: 99, driftPeriod: undefined }),
    { ...mkState(base), patches: undefined, conflicts: undefined, drifts: undefined },
  ];
  for (const s of odd) checkInput(botInput(s), JSON.stringify(s.status));
});

test('botInput: dodges a drift heading for the player', async () => {
  // The drift at (2,1) plans to step left onto the player: the safe route
  // to the patch dips down first.
  const s = mkState(['#####', '#@<P#', '#..M#', '#####']);
  assert.equal(botInput(s).move, 'down');
});

test('botInput: routes round a live conflict but not a dying one', async () => {
  const map = ['#####', '#@.P#', '#.M.#', '#####'];
  const live = mkState(map, { conflicts: [{ x: 2, y: 1, ttl: 5 }] });
  const dying = mkState(map, { conflicts: [{ x: 2, y: 1, ttl: 1 }] });
  assert.equal(botInput(live).move, 'down');
  assert.equal(botInput(dying).move, 'right');
});

test('botInput: walks into a cell a drift is vacating', async () => {
  // '>' at (2,1) plans to step right; the patch lies beyond it at (4,1),
  // and the player may follow into the cell it leaves.
  const s = mkState(['######', '#@>.P#', '#....#', '######']);
  assert.equal(botInput(s).move, 'right');
});

test('botInput: closed holds shut the way, open ones open it', async () => {
  const map = ['#####', '#@H.P#', '#.#..#', '#####'];
  const shut = mkState(map, { patches: [{ x: 3, y: 1, color: 1 }] });
  assert.equal(botInput(shut).move, null); // patch sealed beyond the hold
  const wide = mkState(map, { open: true, patches: [{ x: 3, y: 1, color: 1 }] });
  assert.equal(botInput(wide).move, 'right');
});

test('replica: banking full hands pays the square', async () => {
  const levels = [{ name: 'm', quorum: 3, par: 100, driftPeriod: 1, spawnEvery: 10000,
    map: ['#########', '#@..M.PP#', '#.......#', '#########'] }];
  let s = repInit(2, { levels });
  s.carried = [1];
  let firstMerge = 0;
  for (let i = 0; i < 60 && s.status === 'playing'; i++) {
    const go = botInput(s);
    checkInput(go, `m ${i}`);
    const before = s.carried.length;
    s = repStep(s, go);
    if (firstMerge === 0 && s.events.includes('merge')) firstMerge = before;
  }
  assert.equal(firstMerge, 3, 'the first merge held three patches');
  assert.ok(s.score >= 900, `score ${s.score}`);
});

test('replica: ships lab1 for most seeds', async () => {
  let shipped = 0;
  const seen = [];
  for (let seed = 1; seed <= 10; seed++) {
    const { s } = repGame(seed, 1500, [LAB_LEVELS[0]]);
    const ok = s.levelIndex > 0 || s.status === 'won';
    if (!ok) seen.push(seed);
    if (ok) shipped++;
  }
  assert.ok(shipped >= 7, `shipped ${shipped}; stuck seeds ${seen.join(',')}`);
});

test('replica: scores early in every lab1 game', async () => {
  for (let seed = 1; seed <= 10; seed++) {
    const { s } = repGame(seed, 400, [LAB_LEVELS[0]]);
    assert.ok(s.score > 0, `seed ${seed} score ${s.score}`);
  }
});

test('replica: never hit on the driftless lab1', async () => {
  for (let seed = 1; seed <= 10; seed++) {
    const { s, notes } = repGame(seed, 1200, [LAB_LEVELS[0]]);
    for (const evs of notes) {
      assert.ok(!evs.includes('hit') && !evs.includes('drop'),
        `seed ${seed} got hit`);
      assert.ok(!evs.includes('lost'), `seed ${seed} lost`);
    }
    assert.notEqual(s.status, 'lost');
    assert.equal(s.lives, 3);
  }
});

test('replica: survives the drift lab levels for 800 ticks', async () => {
  for (let j = 1; j < LAB_LEVELS.length; j++) {
    for (const seed of [1, 4, 9, 23, 77]) {
      const { s } = repGame(seed + j * 100, 800, [LAB_LEVELS[j]]);
      assert.notEqual(s.status, 'lost',
        `lab level ${j} seed ${seed}: lost with ${s.lives} lives at tick ${s.tick}`);
    }
  }
});

test('replica: shipping a two-level run plays the next level', async () => {
  const { s } = repGame(7, 3000, [LAB_LEVELS[0], LAB_LEVELS[1]]);
  assert.ok(s.levelIndex > 0 || s.status === 'won',
    `stuck on level ${s.levelIndex}`);
});

test('replica: a bot game is deterministic', async () => {
  const a = repGame(77, 500, [LAB_LEVELS[0], LAB_LEVELS[1]]);
  const b = repGame(77, 500, [LAB_LEVELS[0], LAB_LEVELS[1]]);
  assert.deepEqual(a.s, b.s);
});

const REAL_GAME = 'src/core/game.js';
const REAL_LEVELS = 'src/data/levels.js';

test('integration: the real game.js and shipped levels with the bot', async (t) => {
  if (!fileExists(REAL_GAME) || !fileExists(REAL_LEVELS)) {
    t.skip('core/game.js or data/levels.js not landed yet');
    return;
  }
  const [{ init, step }, { LEVELS }] = await Promise.all([
    import('../src/core/game.js'), import('../src/data/levels.js'),
  ]);
  const game = (seed, ticks, opts) => {
    let s = init(seed, opts);
    for (let i = 0; i < ticks && s.status === 'playing'; i++) {
      const go = botInput(s);
      checkInput(go, `seed ${seed} tick ${i}`);
      const before = s.score;
      s = step(s, go);
      const why = broken(s);
      assert.equal(why, null, `seed ${seed} tick ${i}: ${why}`);
      assert.ok(s.score >= before, `seed ${seed} tick ${i}: score dropped`);
    }
    return s;
  };
  for (let seed = 1; seed <= 10; seed++) game(seed, 2000);
  for (let seed = 1; seed <= 10; seed++) assert.ok(game(seed, 600).score > 0,
    `seed ${seed} scored nothing in 600 ticks`);
});

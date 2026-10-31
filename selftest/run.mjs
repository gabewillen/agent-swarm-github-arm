// Development harness for src/core/bot.js, mirroring the checks of the
// acceptance suite's bot section (tests/17) against the fake game in
// selftest/fakegame.mjs, plus timing. Run with: node selftest/run.mjs
import { init, step } from './fakegame.mjs';
import { botInput } from '../src/core/bot.js';
import { LEVELS, MINIES, FIRST, CORRIDORS, HOLDS, ARENA, PRESSURE, MINI_PATCH, MINI_FULLHANDS, MINI_EXIT } from './levels.mjs';

const MOVES = new Set(['up', 'right', 'down', 'left', null]);
const lvl = (map, extra = {}) => ({ name: 'test', quorum: 1, par: 100, driftPeriod: 1, spawnEvery: 1000, map, ...extra });

function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}

// The acceptance suite's own rule checks (state integrity, independent of
// src/core/invariants.js).
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

async function botGame(seed, ticks, opts = {}) {
  let s = init(seed, { levels: opts.levels ?? LEVELS, level: opts.level ?? 0 });
  let shipped = false;
  for (let i = 0; i < ticks && s.status === 'playing'; i++) {
    const input = botInput(s);
    if (!input || !MOVES.has(input.move) || input.pause !== false) {
      throw new Error(`bad input ${JSON.stringify(input)} at tick ${i} seed ${seed}`);
    }
    const before = s.score;
    s = step(s, input);
    if (s.levelIndex > 0 || s.status === 'won') shipped = true;
    const why = broken(s);
    if (why !== null) throw new Error(`seed ${seed} tick ${i}: ${why}`);
    if (s.score < before) throw new Error(`seed ${seed} tick ${i}: score dropped`);
  }
  return { s, shipped };
}

let passed = 0;
let failed = 0;
const failures = [];
function check(name, fn) {
  try {
    fn();
    passed++;
  } catch (err) {
    failed++;
    failures.push(`${name}: ${err.message}`);
  }
}
async function checkAsync(name, fn) {
  try {
    await fn();
    passed++;
  } catch (err) {
    failed++;
    failures.push(`${name}: ${err.message}`);
  }
}

check('botInput returns a valid input', () => {
  const input = botInput(init(1, { levels: LEVELS }));
  if (!MOVES.has(input.move)) throw new Error(`bad move ${input.move}`);
  if (input.pause !== false) throw new Error('pause not false');
});

check('botInput is pure and deterministic', () => {
  const s = deepFreeze(init(4, { levels: LEVELS }));
  const a = botInput(s);
  const b = botInput(s);
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error('not deterministic');
});

check('the bot heads for the only patch', () => {
  const s = init(1, { levels: [MINI_PATCH] });
  if (botInput(s).move !== 'right') throw new Error(`got ${botInput(s).move}`);
});

check('the bot takes full hands to the merge pad', () => {
  const s = init(1, { levels: [MINI_FULLHANDS] });
  if (botInput({ ...s, carried: [0, 1, 2] }).move !== 'left') throw new Error('not left');
});

check('the bot heads for the open exit', () => {
  const s = init(1, { levels: [MINI_EXIT] });
  if (botInput({ ...s, open: true }).move !== 'right') throw new Error('not right');
});

await checkAsync('the bot plays 10 seeded games of the harness levels for 2000 ticks', async () => {
  for (let seed = 1; seed <= 10; seed++) await botGame(seed, 2000);
});

await checkAsync('the bot scores in every seeded game', async () => {
  for (let seed = 1; seed <= 10; seed++) {
    const { s } = await botGame(seed, 600);
    if (!(s.score > 0)) throw new Error(`seed ${seed} score ${s.score}`);
  }
});

await checkAsync('the bot ships the first level in at least 7 of 10 seeds', async () => {
  let n = 0;
  for (let seed = 1; seed <= 10; seed++) {
    const { shipped } = await botGame(seed, 1500, { levels: [FIRST] });
    if (shipped) n++;
  }
  if (n < 7) throw new Error(`${n} of 10`);
});

await checkAsync('the bot plays every harness level from its start without breaking a rule', async () => {
  for (let i = 0; i < LEVELS.length; i++) await botGame(100 + i, 800, { level: i });
});

check('every harness level is valid (border, contents, reachability)', () => {
  for (const def of LEVELS) {
    const pass = (x, y) => {
      const ch = def.map[y]?.[x] ?? '#';
      return ch !== '#';
    };
    for (let x = 0; x < def.map[0].length; x++) {
      if (def.map[0][x] !== '#' || def.map[def.map.length - 1][x] !== '#') throw new Error(`${def.name}: border`);
    }
    let start = null;
    let p = 0, m = 0, xx = 0;
    for (let y = 0; y < def.map.length; y++) {
      for (let x = 0; x < def.map[y].length; x++) {
        const ch = def.map[y][x];
        if (ch === '@') start = { x, y };
        if (ch === 'P') p++;
        if (ch === 'M') m++;
        if (ch === 'X') xx++;
      }
    }
    if (!start || p < 1 || m < 1 || xx !== 1) throw new Error(`${def.name}: contents qty`);
    const seen = new Set([`${start.x},${start.y}`]);
    const q = [start];
    while (q.length) {
      const { x, y } = q.pop();
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
        const nx = x + dx, ny = y + dy;
        if (!pass(nx, ny) || seen.has(`${nx},${ny}`)) continue;
        seen.add(`${nx},${ny}`);
        q.push({ x: nx, y: ny });
      }
    }
    for (let y = 0; y < def.map.length; y++) {
      for (let x = 0; x < def.map[y].length; x++) {
        const ch = def.map[y][x];
        if ('@PMX'.includes(ch) && !seen.has(`${x},${y}`)) {
          throw new Error(`${def.name}: ${ch} at ${x},${y} unreachable`);
        }
      }
    }
  }
});

await checkAsync('the bot dodges the corridor drifts (ships level 2 from 5 seeds)', async () => {
  for (const seed of [1, 4, 7, 11, 42]) {
    const { s, shipped } = await botGame(seed, 900, { levels: [CORRIDORS] });
    if (s.status === 'lost') throw new Error(`seed ${seed} died`);
    if (!shipped) throw new Error(`seed ${seed} did not ship within 900 ticks`);
  }
});

await checkAsync('the bot ships the hold-gated level', async () => {
  for (const seed of [1, 5, 9]) {
    const { s, shipped } = await botGame(seed, 900, { levels: [HOLDS] });
    if (!shipped) throw new Error(`seed ${seed} stalled: merges ${s.s_merges ?? s.merges} open ${s.open}`);
  }
});

await checkAsync('the bot ships the drift arena', async () => {
  let lost = 0;
  for (const seed of [1, 2, 3, 4, 5]) {
    const { s } = await botGame(seed, 900, { levels: [ARENA] });
    if (s.status === 'lost') lost++;
  }
  if (lost > 1) throw new Error(`died in ${lost} of 5 seeds`);
});

await checkAsync('a bot game is deterministic', async () => {
  const a = await botGame(77, 500);
  const b = await botGame(77, 500);
  if (JSON.stringify(a.s) !== JSON.stringify(b.s)) throw new Error('not equal');
});

check('purity: botInput never mutates a frozen state', () => {
  const s = deepFreeze(init(9, { levels: LEVELS }));
  botInput(s); // mutations would throw on a frozen object
});

check('timing: 2000 bot steps stay quick', () => {
  let s = init(3, { levels: LEVELS });
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < 2000 && s.status === 'playing'; i++) {
    s = step(s, botInput(s));
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  if (ms > 8000) throw new Error(`2000 steps took ${ms.toFixed(0)} ms`);
  console.log(`  (timing: 2000 steps in ${ms.toFixed(0)} ms, end score ${s.score})`);
});

console.log(`selftest: ${passed} passed, ${failed} failed`);
for (const f of failures) console.log('  - ' + f.split('\n').join('\n    '));
process.exit(failed > 0 ? 1 : 0);

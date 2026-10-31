// Stress: nasty level shapes and planner timing.
import { init, step } from './quorum.js';
import { botInput } from '../src/core/bot.js';

const STRESS = [
  {
    // quorum 20, sparse spawns, big empty room, drifts in mid lanes
    name: 'stress huge quorum', quorum: 20, par: 900, driftPeriod: 2, spawnEvery: 55,
    map: [
      '########################',
      '#@..P.....M..........P.#',
      '#......................#',
      '#..v...............^...#',
      '#......................#',
      '#.P..................P.#',
      '#......................#',
      '#....................X.#',
      '#......................#',
      '#..^................v..#',
      '#......................#',
      '########################',
    ],
  },
  {
    // driftPeriod 1 everywhere, tight maze
    name: 'stress maze period 1', quorum: 6, par: 500, driftPeriod: 1, spawnEvery: 24,
    map: [
      '##############',
      '#@.P....M....#',
      '#.###.####.###',
      '#.#..........#',
      '#.#.###..##.>#',
      '#...#..P....X#',
      '#.###.####.###',
      '#.......^..P.#',
      '##############',
    ],
  },
  {
    // 24 tall, deep hold stack
    name: 'stress deep holds', quorum: 9, par: 800, driftPeriod: 2, spawnEvery: 30,
    map: [
      '####################',
      '#@...P....M...P....#',
      '#..................#',
      '#HHHHHHHH....HHHHHH#',
      '#..................#',
      '#...v..........^...#',
      '#..................#',
      '#HH..HHHHPPHH..HHHH#',
      '#..................#',
      '#.........X........#',
      '#..................#',
      '#HHHHHHHH....HHHHHH#',
      '#....P.........v...#',
      '#..................#',
      '####################',
    ],
  },
];

function broken(s) {
  const wall = (x, y) => {
    const r = s.level.tiles[y];
    return r === undefined || x < 0 || x >= r.length || r[x] === '#';
  };
  if (wall(s.player.x, s.player.y)) return 'player in wall';
  if (s.carried.length > 3) return 'carry';
  if (s.patches.some((p) => !s.level.spawns.some((q) => q.x === p.x && q.y === p.y))) return 'patch off spawn';
  if (s.drifts.some((d) => wall(d.x, d.y))) return 'drift in wall';
  return null;
}

const started = performance.now();
for (const def of STRESS) {
  let ships = 0, hits = 0, drops = 0, tickSum = 0, scoreSum = 0;
  const t0 = performance.now();
  for (let seed = 1; seed <= 10; seed++) {
    let s = init(seed, { levels: [def] });
    let i = 0;
    for (; i < 3000 && s.status === 'playing'; i++) {
      s = step(s, botInput(s));
      const why = broken(s);
      if (why) { console.log(`BROKEN ${def.name} seed ${seed} tick ${i}: ${why}`); process.exit(1); }
      for (const e of s.events) {
        if (e === 'hit') hits++;
        else if (e === 'drop') drops++;
      }
    }
    if (s.status === 'won') { ships++; tickSum += i; }
    scoreSum += s.score;
  }
  console.log(
    `${def.name.padEnd(22)} ships ${(ships * 10).toFixed(0)}% hits ${hits} drops ${drops} `
    + `avg ticks ${ships ? Math.round(tickSum / ships) : '-'} score ${(scoreSum / 10).toFixed(0)} `
    + `(${Math.round(performance.now() - t0)}ms)`,
  );
}
// planner cost on the biggest map, steady state with drifts and conflicts
let s = init(3, { levels: [STRESS[0]] });
for (let i = 0; i < 120; i++) s = step(s, botInput(s));
const n = 4000;
const t1 = performance.now();
for (let i = 0; i < n; i++) botInput(s);
console.log(`botInput: ${((performance.now() - t1) * 1000 / n).toFixed(1)}µs/call on a ${s.level.width}x${s.level.height} map`);
console.log(`total ${(performance.now() - started).toFixed(0)}ms`);

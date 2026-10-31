// agent-34's own checks for src/core/generate.js (kept out of tests/).
// Run with: node local-tests/generate-check.mjs
// Skips gracefully when modules it depends on have not landed on main yet.

import { load } from '../tests/helpers.mjs';

const g = await load('core/generate.js');
let failures = 0;
const ok = (cond, label) => {
  if (!cond) {
    failures++;
    console.log('FAIL', label);
  }
};

// hashSeed is FNV-1a over UTF-16 code units.
function fnv(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}
for (const t of ['', 'a', 'quorum', 'Quorum Run!', 'é中', '2026-10-30']) {
  ok(g.hashSeed(t) === fnv(t), `hashSeed ${JSON.stringify(t)}`);
}
ok(g.hashSeed('') === 0x811c9dc5, 'hashSeed empty');
ok(g.dailySeed('2026-10-30') === fnv('quorum-run:2026-10-30'), 'dailySeed date');
for (const t of ['2026-1-30', 'today', '', '2026/10/30', '2026-10-30T00:00', null, 5]) {
  ok(g.dailySeed(t) === null, `dailySeed refuses ${JSON.stringify(t)}`);
}

// RangeError for sizes out of range.
for (const bad of [{ width: 6 }, { width: 33 }, { height: 25 }, { height: 6 }]) {
  let threw = false;
  try { g.generateLevel(1, bad); } catch (e) { threw = e instanceof RangeError; }
  ok(threw, `RangeError ${JSON.stringify(bad)}`);
}

// Structural checks, without or with the validator from core/level.js.
const { validateLevel } = await load('core/level.js').catch(() => ({ validateLevel: null }));

function checkShape(def, width, height, drifts, spawns) {
  const rows = def.map;
  ok(rows.length === height, `map height ${def.name}`);
  ok(rows.every((r) => r.length === width), `map width ${def.name}`);
  const cells = rows.join('');
  ok(/^[#.PMX@^>v<]*$/.test(cells), `chars ${def.name}`);
  let at = 0, exit = 0, pads = 0, patches = 0, drift = 0;
  for (let i = 0; i < cells.length; i++) {
    const ch = cells[i];
    if (ch === '@') at++;
    else if (ch === 'X') exit++;
    else if (ch === 'M') pads++;
    else if (ch === 'P') patches++;
    else if (ch === '^' || ch === '>' || ch === 'v' || ch === '<') drift++;
  }
  ok(at === 1, `one @ ${def.name}`);
  ok(exit === 1, `one X ${def.name}`);
  ok(pads >= 1, `an M ${def.name}`);
  ok(patches === spawns, `${spawns} P ${def.name} (${patches})`);
  ok(drift === drifts, `${drifts} drifts ${def.name} (${drift})`);
  // border is all #
  for (let x = 0; x < width; x++) {
    ok(rows[0][x] === '#' && rows[height - 1][x] === '#', `border row ${def.name}`);
  }
  for (let y = 0; y < height; y++) {
    ok(rows[y][0] === '#' && rows[y][width - 1] === '#', `border col ${def.name}`);
  }
  // drains reach, drift distance >= 3, flood fill from @ reaches P/M/X
  let sx = -1, sy = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) if (rows[y][x] === '@') { sx = x; sy = y; }
  }
  const driftList = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if ('^>v<'.includes(rows[y][x])) driftList.push([x, y]);
    }
  }
  for (const [dx, dy] of driftList) {
    ok(Math.abs(dx - sx) + Math.abs(dy - sy) >= 3, `drift >=3 from @ ${def.name}`);
  }
  const seen = new Set([`${sx},${sy}`]);
  let queue = [[sx, sy]];
  while (queue.length) {
    const [x, y] = queue.pop();
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      if (rows[ny][nx] === '#' || seen.has(`${nx},${ny}`)) continue;
      seen.add(`${nx},${ny}`);
      queue.push([nx, ny]);
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if ('PMX'.includes(rows[y][x])) ok(seen.has(`${x},${y}`), `reachable ${def.name} ${x},${y}`);
    }
  }
  ok(def.par >= 30 && Number.isInteger(def.par), `par ${def.name}`);
  ok(def.driftPeriod === 2 && def.spawnEvery === 12, `period fields ${def.name}`);
}

const combos = [
  [undefined, {}],
  [0, {}],
  [-2, {}],
  [77, {}],
  [5, { width: 21, height: 13, drifts: 4, spawns: 6, quorum: 9 }],
  [5, { width: 9, height: 9 }],
  [5, { width: 32, height: 24 }],
  [5, { width: 11, height: 11, drifts: 5, spawns: 3 }],
  [3, { width: 7, height: 7, drifts: 1, spawns: 2 }],
  [3, { width: 7, height: 9, drifts: 0, spawns: 2 }],
  [3, { width: 8, height: 7, drifts: 3, spawns: 1 }],
  [123, { drifts: 5 }],
  [9, { quorum: 20 }],
  [9, { spawns: 10, drifts: 4 }],
];

for (const [seed, options] of combos) {
  const def = g.generateLevel(seed, options);
  const width = options.width ?? 15;
  const height = options.height ?? 11;
  checkShape(def, width, height, options.drifts ?? 2, options.spawns ?? 4);
  ok(def.name === 'Generated ' + (seed >>> 0), `name ${def.name}`);
  ok(typeof def.quorum === 'number' && def.quorum > 0, `quorum ${def.name}`);
  if (validateLevel) ok(validateLevel(def).errors.length === 0, `valid ${def.name} ${JSON.stringify(validateLevel(def).errors)}`);
}

// 100 more structure checks on 7x7 and defaults
for (let seed = 0; seed < 100; seed++) {
  const def = g.generateLevel(seed);
  checkShape(def, 15, 11, 2, 4);
  if (validateLevel) ok(validateLevel(def).errors.length === 0, `valid default seed ${seed}`);
}
for (let seed = 0; seed < 60; seed++) {
  const def = g.generateLevel(seed, { width: 7, height: 7, drifts: 1, spawns: 2 });
  checkShape(def, 7, 7, 1, 2);
  if (validateLevel) ok(validateLevel(def).errors.length === 0, `valid small seed ${seed}`);
}
for (let seed = 0; seed < 60; seed++) {
  const def = g.generateLevel(seed, { width: 32, height: 24 });
  checkShape(def, 32, 24, 2, 4);
  if (validateLevel) ok(validateLevel(def).errors.length === 0, `valid big seed ${seed}`);
}
for (let seed = 0; seed < 60; seed++) {
  const def = g.generateLevel(seed, { drifts: 5 });
  checkShape(def, 15, 11, 5, 4);
}

// deterministic and varied
ok(JSON.stringify(g.generateLevel(77)) === JSON.stringify(g.generateLevel(77)), 'deterministic');
const maps = new Set();
for (let seed = 0; seed < 10; seed++) maps.add(g.generateLevel(seed).map.join('\n'));
ok(maps.size >= 8, `maps vary (${maps.size})`);

// print a couple of samples
console.log(JSON.stringify(g.generateLevel(1), null, 0));
console.log(JSON.stringify(g.generateLevel(1, { width: 7, height: 7, drifts: 1, spawns: 2 }), null, 0));

// The bot ships most generated levels, when game.js and bot.js exist.
try {
  const { init, step } = await load('core/game.js');
  const { botInput } = await load('core/bot.js');
  let shipped = 0;
  const notes = [];
  for (let seed = 1; seed <= 10; seed++) {
    let s = init(seed, { levels: [g.generateLevel(seed)] });
    let i = 0;
    for (; i < 1500 && s.status === 'playing'; i++) s = step(s, botInput(s));
    if (s.status === 'won') shipped++;
    else notes.push(`seed ${seed}: ${s.status} at tick ${i}`);
  }
  console.log(`bot shipped ${shipped}/10 ${notes.join('; ')}`);
  ok(shipped >= 6, `bot ships generated levels (${shipped}/10)`);
} catch (e) {
  console.log('(bot check skipped:', e.message.split('\n')[0], ')');
}

console.log(failures === 0 ? 'generate-check: all ok' : `generate-check: ${failures} failures`);
process.exit(failures === 0 ? 0 : 1);

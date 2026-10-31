// Dev tool: build the shipped maps from wall segments so every row
// length and border is exact, validate them (§4), and print the final
// literal to paste into src/data/levels.js. Not part of src/.

import { validateLevel, parseLevel } from '../src/core/level.js';

const grid = (w, h) => Array.from({ length: h }, () => '#'.repeat(w).split(''));

const put = (g, x, y, ch) => { g[y][x] = ch; };

const seg = (g, x0, y0, x1, y1, ch = '#') => {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(g, x, y, ch);
};

const open = (g, x0, y0, x1, y1) => seg(g, x0, y0, x1, y1, '.');

const show = (g) => g.map((row) => row.join(''));

const LEVELS = [];

// 1 — First merge (9x5, no drift): an open little room.
{
  const g = grid(9, 5);
  open(g, 1, 1, 7, 3);
  put(g, 1, 1, '@');
  put(g, 7, 1, 'X');
  put(g, 4, 1, 'P');
  put(g, 1, 3, 'P');
  put(g, 4, 3, 'M');
  LEVELS[0] = { name: 'First merge', quorum: 2, par: 90, driftPeriod: 2, spawnEvery: 20, map: show(g) };
}

// 2 — Corridor run (15x7, no drift): two hanging bars make a maze.
{
  const g = grid(15, 7);
  open(g, 1, 1, 13, 5);
  seg(g, 2, 2, 6, 2);
  seg(g, 8, 4, 12, 4);
  put(g, 1, 1, '@');
  put(g, 10, 1, 'P');
  put(g, 1, 5, 'P');
  put(g, 7, 3, 'M');
  put(g, 13, 5, 'X');
  LEVELS[1] = { name: 'Corridor run', quorum: 3, par: 110, driftPeriod: 2, spawnEvery: 18, map: show(g) };
}

// 3 — First patrol (15x7): the corridors of level 2, one drift.
{
  const g = grid(15, 7);
  open(g, 1, 1, 13, 5);
  seg(g, 2, 2, 6, 2);
  seg(g, 8, 4, 12, 4);
  put(g, 1, 1, '@');
  put(g, 10, 1, 'P');
  put(g, 1, 5, 'P');
  put(g, 7, 3, 'M');
  put(g, 13, 5, 'X');
  put(g, 11, 2, '<');
  LEVELS[2] = { name: 'First patrol', quorum: 3, par: 110, driftPeriod: 2, spawnEvery: 16, map: show(g) };
}

// 4 — The gate (17x9): a hold-doored wall off an annex.
{
  const g = grid(17, 9);
  open(g, 1, 1, 15, 7);
  seg(g, 12, 1, 12, 1);
  seg(g, 12, 3, 12, 5);
  seg(g, 12, 7, 12, 7);
  put(g, 12, 2, 'H');
  put(g, 12, 6, 'H');
  put(g, 1, 1, '@');
  put(g, 14, 2, 'M');
  put(g, 14, 4, 'P');
  put(g, 1, 7, 'X');
  put(g, 3, 5, 'P');
  put(g, 5, 2, '>');
  LEVELS[3] = { name: 'The gate', quorum: 3, par: 130, driftPeriod: 2, spawnEvery: 16, map: show(g) };
}

// 5 — Roundabout (19x9): two stubs and a gated middle wall.
{
  const g = grid(19, 9);
  open(g, 1, 1, 17, 7);
  seg(g, 5, 1, 5, 3);
  seg(g, 13, 5, 13, 7);
  seg(g, 9, 3, 9, 3);
  seg(g, 9, 5, 9, 5);
  put(g, 9, 4, 'H');
  put(g, 1, 1, '@');
  put(g, 3, 3, 'P');
  put(g, 9, 7, 'P');
  put(g, 16, 2, 'M');
  put(g, 16, 7, 'X');
  put(g, 11, 1, '>');
  put(g, 6, 7, '^');
  LEVELS[4] = { name: 'Roundabout', quorum: 4, par: 140, driftPeriod: 2, spawnEvery: 16, map: show(g) };
}

// 6 — Twin halls (21x9): the wall down the middle has two doors.
{
  const g = grid(21, 9);
  open(g, 1, 1, 19, 7);
  seg(g, 10, 1, 10, 1);
  seg(g, 10, 3, 10, 5);
  seg(g, 10, 7, 10, 7);
  put(g, 10, 2, 'H');
  put(g, 10, 6, 'H');
  put(g, 1, 1, '@');
  put(g, 19, 7, 'X');
  put(g, 5, 3, 'P');
  put(g, 15, 3, 'P');
  put(g, 4, 6, 'M');
  put(g, 16, 6, 'M');
  put(g, 5, 5, '>');
  put(g, 15, 5, '<');
  LEVELS[5] = { name: 'Twin halls', quorum: 5, par: 150, driftPeriod: 2, spawnEvery: 16, map: show(g) };
}

// 7 — The vault (23x11): a horizontal wall splits the level, two doors.
{
  const g = grid(23, 11);
  open(g, 1, 1, 21, 9);
  seg(g, 1, 5, 4, 5);
  seg(g, 6, 5, 16, 5);
  seg(g, 18, 5, 21, 5);
  put(g, 5, 5, 'H');
  put(g, 17, 5, 'H');
  put(g, 11, 1, '@');
  put(g, 21, 9, 'X');
  put(g, 3, 2, 'P');
  put(g, 19, 2, 'P');
  put(g, 11, 3, 'P');
  put(g, 11, 7, 'M');
  put(g, 19, 8, 'M');
  put(g, 3, 3, '>');
  put(g, 19, 3, '<');
  put(g, 11, 8, '^');
  LEVELS[6] = { name: 'The vault', quorum: 6, par: 160, driftPeriod: 2, spawnEvery: 14, map: show(g) };
}

// 8 — Crossing (25x11): a plus of walls, four quadrants, one door.
{
  const g = grid(25, 11);
  open(g, 1, 1, 23, 9);
  seg(g, 12, 1, 12, 1);
  seg(g, 12, 3, 12, 4);
  seg(g, 12, 6, 12, 9);
  put(g, 12, 2, 'H');
  seg(g, 1, 5, 5, 5);
  seg(g, 7, 5, 11, 5);
  seg(g, 13, 5, 14, 5);
  seg(g, 16, 5, 17, 5);
  put(g, 15, 5, 'H');
  seg(g, 19, 5, 23, 5);
  put(g, 6, 5, '.');
  put(g, 18, 5, '.');
  put(g, 1, 1, '@');
  put(g, 23, 9, 'X');
  put(g, 4, 2, 'P');
  put(g, 20, 2, 'P');
  put(g, 4, 9, 'P');
  put(g, 20, 9, 'M');
  put(g, 2, 7, 'M');
  put(g, 6, 6, '>');
  put(g, 18, 6, '<');
  put(g, 6, 7, 'v');
  put(g, 20, 7, '^');
  LEVELS[7] = { name: 'Crossing', quorum: 7, par: 170, driftPeriod: 2, spawnEvery: 14, map: show(g) };
}

// 9 — Gauntlet (27x15): three full walls, gaps and a door.
{
  const g = grid(27, 15);
  open(g, 1, 1, 25, 13);
  seg(g, 1, 4, 12, 4);
  seg(g, 14, 4, 25, 4);
  seg(g, 1, 8, 12, 8);
  seg(g, 14, 8, 25, 8);
  put(g, 13, 8, 'H');
  seg(g, 1, 12, 12, 12);
  seg(g, 14, 12, 25, 12);
  put(g, 1, 1, '@');
  put(g, 25, 13, 'X');
  put(g, 25, 2, 'P');
  put(g, 1, 6, 'P');
  put(g, 25, 6, 'P');
  put(g, 1, 10, 'P');
  put(g, 25, 10, 'P');
  put(g, 13, 2, 'M');
  put(g, 13, 6, 'M');
  put(g, 5, 2, '>');
  put(g, 21, 2, '<');
  put(g, 5, 10, 'v');
  put(g, 21, 10, '^');
  LEVELS[8] = { name: 'Gauntlet', quorum: 8, par: 180, driftPeriod: 2, spawnEvery: 12, map: show(g) };
}

// 10 — The long road (29x15): a zigzag between wall columns.
{
  const g = grid(29, 15);
  open(g, 1, 1, 27, 13);
  seg(g, 6, 1, 6, 4);
  seg(g, 6, 6, 6, 10);
  put(g, 6, 5, 'H');
  seg(g, 12, 4, 12, 13);
  seg(g, 18, 1, 18, 4);
  seg(g, 18, 6, 18, 10);
  put(g, 18, 5, 'H');
  seg(g, 24, 4, 24, 13);
  put(g, 1, 1, '@');
  put(g, 27, 13, 'X');
  put(g, 3, 12, 'P');
  put(g, 9, 7, 'P');
  put(g, 15, 2, 'P');
  put(g, 21, 12, 'P');
  put(g, 27, 1, 'P');
  put(g, 3, 2, 'M');
  put(g, 15, 12, 'M');
  put(g, 9, 2, '>');
  put(g, 21, 2, '<');
  put(g, 3, 6, 'v');
  put(g, 21, 6, '^');
  put(g, 9, 10, '<');
  LEVELS[9] = { name: 'The long road', quorum: 9, par: 200, driftPeriod: 2, spawnEvery: 12, map: show(g) };
}

// 11 — Quorum court (31x15): four pillars and a choose-your-door wall.
{
  const g = grid(31, 15);
  open(g, 1, 1, 29, 13);
  seg(g, 3, 4, 5, 6);
  seg(g, 11, 4, 13, 6);
  seg(g, 19, 4, 21, 6);
  seg(g, 25, 4, 27, 6);
  seg(g, 1, 8, 6, 8);
  seg(g, 8, 8, 14, 8);
  seg(g, 16, 8, 22, 8);
  seg(g, 24, 8, 28, 8);
  seg(g, 30, 8, 30, 8); // unreachable, but keep row intact — wait this is the border column
  put(g, 7, 8, 'H');
  put(g, 15, 8, 'H');
  put(g, 23, 8, 'H');
  put(g, 29, 8, '.');
  put(g, 1, 1, '@');
  put(g, 29, 13, 'X');
  put(g, 2, 2, 'P');
  put(g, 10, 6, 'P');
  put(g, 18, 6, 'P');
  put(g, 26, 6, 'P');
  put(g, 15, 12, 'P');
  put(g, 15, 2, 'M');
  put(g, 5, 12, 'M');
  put(g, 25, 12, 'M');
  put(g, 5, 2, '>');
  put(g, 17, 2, '<');
  put(g, 25, 2, '>');
  put(g, 7, 10, '<');
  put(g, 15, 10, '>');
  put(g, 23, 10, '<');
  LEVELS[10] = { name: 'Quorum court', quorum: 10, par: 200, driftPeriod: 2, spawnEvery: 14, map: show(g) };
}

// 12 — Yellow yard (31x17): bands of walls with doors and gaps.
{
  const g = grid(31, 17);
  open(g, 1, 1, 29, 15);
  seg(g, 3, 4, 27, 4);
  put(g, 15, 4, 'H');
  seg(g, 3, 8, 27, 8);
  put(g, 13, 8, 'H');
  put(g, 23, 8, '.');
  seg(g, 12, 9, 12, 15);
  seg(g, 20, 9, 20, 15);
  put(g, 1, 1, '@');
  put(g, 29, 15, 'X');
  put(g, 2, 2, 'P');
  put(g, 27, 2, 'P');
  put(g, 5, 6, 'P');
  put(g, 25, 6, 'P');
  put(g, 2, 13, 'P');
  put(g, 17, 13, 'P');
  put(g, 15, 2, 'M');
  put(g, 5, 13, 'M');
  put(g, 25, 13, 'M');
  put(g, 9, 2, '>');
  put(g, 21, 2, '<');
  put(g, 11, 6, '>');
  put(g, 19, 6, '<');
  put(g, 8, 13, '<');
  put(g, 22, 13, '>');
  LEVELS[11] = { name: 'Yellow yard', quorum: 12, par: 210, driftPeriod: 2, spawnEvery: 12, map: show(g) };
}

let bad = 0;
for (const def of LEVELS) {
  const result = validateLevel(def);
  if (result.ok) {
    const level = parseLevel(def);
    console.log(`${def.name}: ok (${level.width}x${level.height}, ${level.spawns.length} spawns, ${level.drifts.length} drifts)`);
  } else {
    bad++;
    console.log(`${def.name}: ${result.errors.join(',')}`);
    if (result.errors.includes('unreachable') && def.name && result.errors.includes('ragged') === false) {
      const width = def.map[0].length;
      const height = def.map.length;
      let sx = 0, sy = 0;
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (def.map[y][x] === '@') { sx = x; sy = y; }
      const seen = Array.from({ length: height }, () => new Array(width).fill(false));
      const queue = [[sx, sy]];
      seen[sy][sx] = true;
      while (queue.length) {
        const [x, y] = queue.pop();
        for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          if (seen[ny][nx] || def.map[ny][nx] === '#') continue;
          seen[ny][nx] = true;
          queue.push([nx, ny]);
        }
      }
      const label = { P: 'spawn', M: 'pad', X: 'exit' };
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const ch = def.map[y][x];
        if (label[ch] && !seen[y][x]) console.log(`  unreachable ${label[ch]} ${ch} at (${x}, ${y})`);
      }
      for (const row of def.map) console.log('  ' + row);
    }
  }
}
if (bad) process.exit(1);

const body = LEVELS.map((def) => `  {
    name: ${JSON.stringify(def.name)},
    quorum: ${def.quorum},
    par: ${def.par},
    driftPeriod: ${def.driftPeriod},
    spawnEvery: ${def.spawnEvery},
    map: [
${def.map.map((row) => `      ${JSON.stringify(row)},`).join('\n')}
    ],
  },`).join('\n');
console.log(`\nexport const LEVELS = [\n${body}\n];\n`);

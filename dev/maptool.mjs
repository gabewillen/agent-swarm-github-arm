// Builds every shipped map from exact coordinates and prints the row
// strings to paste into src/data/levels.js. dev/levelcheck.mjs verifies.
import { checkLevels, parseLevel } from './levelcheck.mjs';

function grid(W, H) {
  const g = Array.from({ length: H }, () => Array.from({ length: W }, () => '.'));
  for (let x = 0; x < W; x++) { g[0][x] = '#'; g[H - 1][x] = '#'; }
  for (let y = 0; y < H; y++) { g[y][0] = '#'; g[y][W - 1] = '#'; }
  return g;
}
const rect = (g, x0, y0, x1, y1, ch = '#') => {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) g[y][x] = ch;
};
// one-cell-thick wall ring with door cells (each door { x, y, ch = '.' })
function ring(g, x0, y0, x1, y1, doors = []) {
  rect(g, x0, x0 === y0 ? y0 : y0, y1 === x1 ? y1 : x1, y1); // unused guard
}
const outline = (g, x0, y0, x1, y1, doors = []) => {
  for (let x = x0; x <= x1; x++) { g[y0][x] = '#'; g[y1][x] = '#'; }
  for (let y = y0; y <= y1; y++) { g[y][x0] = '#'; g[y][x1] = '#'; }
  for (const d of doors) g[d.y][d.x] = d.ch ?? '.';
};
const put = (g, x, y, ch) => { g[y][x] = ch; };
const show = (g, name) => {
  const rows = g.map((r) => r.join(''));
  console.log(`\n// ${name} (${rows[0].length}x${rows.length})`);
  for (const r of rows) console.log(`      '${r}',`);
};

const levels = [];
function level(def) {
  levels.push({ ...def, map: def.g.map((r) => r.join('')) });
}

// ------------------------------------------------ 1 First merge (15x9)
{
  const g = grid(15, 9);
  rect(g, 6, 3, 8, 4);
  put(g, 1, 1, '@'); put(g, 4, 1, 'P'); put(g, 10, 1, 'P');
  put(g, 3, 4, 'M'); put(g, 11, 4, 'M'); put(g, 13, 1, 'X');
  put(g, 3, 6, 'P'); put(g, 11, 6, 'P');
  level({ name: 'First merge', quorum: 2, par: 140, driftPeriod: 2, spawnEvery: 20, g });
}

// ------------------------------------------------ 2 Twin pads (17x11)
{
  const g = grid(17, 11);
  for (const y of [3, 4, 5]) { g[y][5] = '#'; g[y][6] = '#'; g[y][10] = '#'; g[y][11] = '#'; }
  put(g, 1, 1, '@'); put(g, 4, 1, 'P'); put(g, 12, 1, 'P'); put(g, 15, 1, 'X');
  put(g, 3, 4, 'M'); put(g, 13, 4, 'M');
  put(g, 3, 7, 'P'); put(g, 13, 7, 'P');
  level({ name: 'Twin pads', quorum: 3, par: 160, driftPeriod: 2, spawnEvery: 18, g });
}

// ------------------------------------------------ 3 Closed doors (15x11)
{
  const g = grid(15, 11);
  g[2][10] = '#'; g[2][11] = '#'; g[2][12] = '#'; g[2][13] = '#';
  for (const y of [3, 4, 5, 6, 8, 9]) g[y][10] = '#';
  g[7][10] = 'H';
  put(g, 1, 1, '@'); put(g, 4, 1, 'P'); put(g, 9, 1, 'P'); put(g, 5, 6, 'P');
  put(g, 3, 4, 'M'); put(g, 12, 4, 'P'); put(g, 13, 7, 'X');
  level({ name: 'Closed doors', quorum: 3, par: 180, driftPeriod: 2, spawnEvery: 20, g });
}

// ------------------------------------------------ 4 First patrol (17x11)
{
  const g = grid(17, 11);
  put(g, 1, 1, '@'); put(g, 4, 1, 'P'); put(g, 10, 1, 'P'); put(g, 13, 1, 'P');
  put(g, 4, 4, '>'); // the drift, six steps from the start
  rect(g, 5, 6, 6, 6); rect(g, 9, 6, 10, 6); rect(g, 13, 6, 13, 7);
  put(g, 3, 8, 'M'); put(g, 12, 8, 'M'); put(g, 15, 8, 'X');
  put(g, 7, 9, 'P'); put(g, 10, 9, 'P');
  level({ name: 'First patrol', quorum: 4, par: 200, driftPeriod: 2, spawnEvery: 16, g });
}

// ------------------------------------------------ 5 Crossing (19x11)
{
  const g = grid(19, 11);
  rect(g, 1, 5, 17, 5);
  g[5][5] = '.'; g[5][12] = '.'; // two doors through the mid wall
  put(g, 1, 1, '@'); put(g, 3, 1, 'P'); put(g, 9, 1, 'P'); put(g, 15, 1, 'P');
  put(g, 3, 4, 'v'); put(g, 15, 7, '<'); // drifts by the doors
  put(g, 4, 8, 'M'); put(g, 13, 8, 'M'); put(g, 17, 8, 'X');
  put(g, 9, 9, 'P');
  level({ name: 'Crossing', quorum: 4, par: 220, driftPeriod: 2, spawnEvery: 16, g });
}

// ------------------------------------------------ 6 The gauntlet (19x13)
{
  const g = grid(19, 13);
  outline(g, 6, 3, 12, 8, [{ x: 9, y: 3 }]); // the merge ring
  put(g, 9, 6, 'M');
  put(g, 3, 2, '>'); // drift outside, top-left lane
  put(g, 9, 10, '>'); // drift below the ring
  put(g, 15, 6, '<'); // drift east of the ring
  put(g, 1, 1, '@');
  put(g, 5, 1, 'P'); put(g, 14, 1, 'P'); put(g, 17, 1, 'P');
  put(g, 2, 6, 'P'); put(g, 17, 4, 'P'); put(g, 16, 10, 'P');
  put(g, 1, 10, 'M'); put(g, 3, 11, 'X'); put(g, 9, 11, 'P');
  level({ name: 'The gauntlet', quorum: 5, par: 240, driftPeriod: 2, spawnEvery: 15, g });
}

// ------------------------------------------------ 7 Hold line (21x13)
{
  const g = grid(21, 13);
  for (let y = 1; y <= 11; y++) g[y][13] = '#';
  g[6][13] = 'H'; g[9][13] = 'H';
  put(g, 19, 7, 'X'); put(g, 16, 3, 'P'); // inside the hold room
  put(g, 1, 1, '@');
  put(g, 4, 1, 'P'); put(g, 8, 1, 'P'); put(g, 12, 1, 'P'); put(g, 2, 3, 'P');
  put(g, 4, 11, 'P'); put(g, 11, 10, 'P'); put(g, 2, 8, 'P'); // six outside
  put(g, 2, 6, 'M'); put(g, 8, 4, 'M');
  rect(g, 6, 3, 7, 5); rect(g, 10, 6, 11, 8); // pillars in the yard
  put(g, 6, 9, '>'); put(g, 10, 2, 'v'); // two drifts in the yard
  level({ name: 'Hold line', quorum: 6, par: 280, driftPeriod: 2, spawnEvery: 16, g });
}

// ------------------------------------------------ 8 The spiral (21x15)
{
  const g = grid(21, 15);
  outline(g, 3, 3, 17, 11, [{ x: 10, y: 3 }]); // outer wall ring
  outline(g, 6, 5, 14, 9, [{ x: 10, y: 9, ch: 'H' }]); // the vault's door
  put(g, 10, 7, 'X'); put(g, 8, 7, 'P'); put(g, 12, 7, 'P'); // inside the vault
  put(g, 4, 7, 'M'); put(g, 16, 7, 'M'); // pads in the aisles
  put(g, 2, 1, 'P'); put(g, 7, 1, 'P'); put(g, 13, 1, 'P'); put(g, 18, 1, 'P');
  put(g, 2, 13, 'P'); put(g, 18, 13, 'P');
  put(g, 5, 4, '>'); put(g, 15, 10, '>'); // two drifts orbit the aisles
  put(g, 1, 2, '@');
  level({ name: 'The spiral', quorum: 6, par: 280, driftPeriod: 2, spawnEvery: 16, g });
}

// ------------------------------------------------ 9 Crossroads (23x15)
{
  const g = grid(23, 15);
  rect(g, 1, 1, 9, 6); rect(g, 13, 1, 21, 6);
  rect(g, 1, 8, 9, 13); rect(g, 13, 8, 21, 13);
  // four rooms with doors onto the cross
  rect(g, 2, 2, 8, 5, '.'); g[6][5] = '.'; // NW room, door south
  rect(g, 14, 2, 20, 5, '.'); g[6][17] = '.'; // NE room, door south
  rect(g, 2, 9, 8, 12, '.'); g[8][5] = '.'; // SW room, door north
  rect(g, 14, 9, 20, 12, '.'); g[8][17] = '.'; // SE room, door north
  put(g, 1, 7, '@');
  put(g, 11, 3, 'v'); put(g, 11, 11, '^'); put(g, 5, 7, '>'); put(g, 17, 7, '<');
  put(g, 3, 3, 'M'); put(g, 19, 4, 'M');
  put(g, 5, 1, 'P'); put(g, 17, 1, 'P'); put(g, 20, 2, 'P');
  put(g, 7, 9, 'P'); put(g, 21, 7, 'P'); put(g, 11, 1, 'P'); put(g, 11, 13, 'P');
  put(g, 9, 7, 'X'); put(g, 19, 12, 'P'); put(g, 15, 12, 'P');
  level({ name: 'Crossroads', quorum: 8, par: 320, driftPeriod: 3, spawnEvery: 14, g });
}

// ------------------------------------------------ 10 The vault (23x15)
{
  const g = grid(23, 15);
  outline(g, 15, 2, 21, 10, [{ x: 15, y: 7, ch: 'H' }]); // the vault
  put(g, 19, 6, 'X'); put(g, 19, 3, 'P'); put(g, 19, 9, 'P');
  rect(g, 4, 4, 6, 4); rect(g, 9, 3, 11, 3); rect(g, 4, 9, 6, 9);
  put(g, 5, 6, 'M'); put(g, 12, 6, 'M'); put(g, 3, 12, 'M');
  put(g, 1, 1, '@');
  put(g, 4, 1, 'P'); put(g, 9, 1, 'P'); put(g, 14, 1, 'P'); put(g, 18, 1, 'P');
  put(g, 3, 11, 'P'); put(g, 9, 13, 'P'); put(g, 14, 12, 'P');
  put(g, 9, 6, 'v'); put(g, 13, 11, '>'); put(g, 2, 7, '<');
  level({ name: 'The vault', quorum: 7, par: 300, driftPeriod: 2, spawnEvery: 14, g });
}

// ------------------------------------------------ 11 The ring (25x17)
{
  const g = grid(25, 17);
  outline(g, 6, 4, 18, 14, [{ x: 12, y: 4 }]); // the great ring
  put(g, 12, 9, 'M'); put(g, 12, 2, 'M'); put(g, 15, 12, 'M');
  put(g, 8, 6, 'v'); put(g, 16, 6, 'v'); put(g, 8, 12, '>'); put(g, 16, 12, '>');
  put(g, 1, 1, '@');
  put(g, 3, 1, 'P'); put(g, 10, 1, 'P'); put(g, 16, 1, 'P'); put(g, 23, 1, 'P');
  put(g, 1, 8, 'P'); put(g, 23, 8, 'P'); put(g, 1, 15, 'P'); put(g, 23, 15, 'P');
  put(g, 4, 15, 'P'); put(g, 12, 15, 'P'); put(g, 20, 15, 'P');
  put(g, 22, 3, 'X'); put(g, 3, 5, 'P'); put(g, 21, 13, 'P');
  level({ name: 'The ring', quorum: 9, par: 340, driftPeriod: 2, spawnEvery: 14, g });
}

// ------------------------------------------------ 12 Quorum keep (27x19)
{
  const g = grid(27, 19);
  outline(g, 5, 3, 23, 15, [{ x: 13, y: 15, ch: 'H' }, { x: 5, y: 9, ch: 'H' }, { x: 23, y: 9, ch: 'H' }]);
  outline(g, 9, 6, 19, 12, [{ x: 13, y: 12, ch: 'H' }]); // the inner keep
  put(g, 13, 9, 'X'); put(g, 11, 8, 'P'); put(g, 17, 8, 'P'); put(g, 13, 7, 'M');
  put(g, 3, 17, '@');
  put(g, 1, 1, 'P'); put(g, 9, 1, 'P'); put(g, 17, 1, 'P'); put(g, 25, 1, 'P');
  put(g, 1, 6, 'P'); put(g, 25, 5, 'P'); put(g, 2, 13, 'P'); put(g, 24, 16, 'P');
  put(g, 13, 17, 'P'); put(g, 9, 17, 'P'); put(g, 25, 12, 'P'); put(g, 2, 8, 'P');
  put(g, 3, 11, 'M'); put(g, 21, 13, 'M');
  put(g, 7, 13, '>'); put(g, 21, 5, '<'); put(g, 15, 4, 'v'); // yard drifts
  put(g, 11, 9, '>'); put(g, 17, 11, '<'); // keep drifts
  level({ name: 'Quorum keep', quorum: 12, par: 380, driftPeriod: 2, spawnEvery: 12, g });
}

// ------------------------------------------------ print + check
for (const l of levels) show(l.g, `${l.name} — quorum ${l.quorum}, par ${l.par}, spawns ${[...l.map.join('')].filter((c) => c === 'P').length}, drifts ${[...l.map.join('')].filter((c) => '^>v<'.includes(c) && c !== '^' || ['^'].includes(c)).length}`);
const problems = checkLevels(levels);
console.log('\n=== checkLevels:', problems.length ? 'PROBLEMS' : 'all clear');
for (const p of problems) console.log(' - ' + p);

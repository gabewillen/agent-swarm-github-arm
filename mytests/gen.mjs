// Drafts the shipped levels, prints the map rows for src/data/levels.js,
// and verifies them with the local §4 copy.
import { validateLevel, parseLevel, reach } from './levelcheck.mjs';

const grid = (w, h, ch = '.') => Array.from({ length: h }, () => Array.from({ length: w }, () => ch));
const set = (g, x, y, c) => { g[y][x] = c; };
const wall = (g, x0, y0, x1, y1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) g[y][x] = '#'; };
const carve = (g, x0, y0, x1, y1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) g[y][x] = '.'; };
const stroke = (g, x0, y0, x1, y1) => {
  wall(g, x0, y0, x1, y0); wall(g, x0, y1, x1, y1); wall(g, x0, y0, x0, y1); wall(g, x1, y0, x1, y1);
};
const border = (g) => stroke(g, 0, 0, g[0].length - 1, g.length - 1);
const rows = (g) => g.map((r) => r.join(''));

const levels = [];

// 1 — First merge: one open room, three patches in plain sight.
{
  const g = grid(13, 7);
  border(g);
  set(g, 1, 1, '@');
  set(g, 4, 1, 'P'); set(g, 9, 1, 'P'); set(g, 3, 3, 'P');
  set(g, 6, 3, 'M'); set(g, 11, 1, 'X');
  levels.push({ name: 'First merge', quorum: 3, par: 120, driftPeriod: 4, spawnEvery: 20, map: g });
}

// 2 — Double back: a serpentine weave over three walled rows.
{
  const g = grid(15, 9);
  border(g);
  for (const y of [2, 4, 6]) wall(g, 1, y, 13, y);
  set(g, 13, 2, '.');   // gate 1: right
  set(g, 1, 4, '.');    // gate 2: left
  set(g, 13, 6, '.');   // gate 3: right
  set(g, 1, 1, '@');
  set(g, 4, 1, 'P'); set(g, 10, 1, 'P'); set(g, 2, 3, 'P');
  set(g, 6, 5, 'P'); set(g, 3, 7, 'P');
  set(g, 7, 3, 'M'); set(g, 13, 7, 'X');   // the exit waits at the end of the weave
  levels.push({ name: 'Double back', quorum: 4, par: 140, driftPeriod: 4, spawnEvery: 18, map: g });
}

// 3 — First patrol: a drift laps a sealed room that holds the pad.
{
  const g = grid(15, 9);
  border(g);
  wall(g, 3, 2, 11, 6);
  carve(g, 4, 3, 10, 5);
  set(g, 7, 2, '.');   // the door from the top
  set(g, 1, 1, '@');
  set(g, 4, 1, 'P'); set(g, 10, 1, 'P'); set(g, 7, 7, 'P');
  set(g, 6, 4, 'M'); set(g, 9, 4, 'v');
  set(g, 13, 1, 'X');
  levels.push({ name: 'First patrol', quorum: 4, par: 150, driftPeriod: 3, spawnEvery: 18, map: g });
}

// 4 — Hold the line: a hold wall splits the map; the far side waits.
{
  const g = grid(19, 9);
  border(g);
  wall(g, 8, 1, 8, 7); set(g, 8, 3, 'H');
  wall(g, 3, 2, 4, 2); wall(g, 3, 4, 4, 4);     // left pillars
  wall(g, 12, 2, 13, 2); wall(g, 12, 6, 13, 6); // right pillars
  set(g, 1, 1, '@');
  set(g, 4, 1, 'P'); set(g, 6, 5, 'P');
  set(g, 3, 3, 'M');
  set(g, 14, 1, 'P'); set(g, 13, 5, 'P');
  set(g, 17, 1, 'X');
  set(g, 3, 7, '^');
  levels.push({ name: 'Hold the line', quorum: 5, par: 160, driftPeriod: 3, spawnEvery: 16, map: g });
}

// 5 — Square dance: two drifts weave between pillar rows.
{
  const g = grid(17, 11);
  border(g);
  for (const y of [3, 6, 8]) { wall(g, 4, y, 5, y); wall(g, 11, y, 12, y); }
  set(g, 1, 1, '@');
  set(g, 4, 1, 'P'); set(g, 8, 1, 'P'); set(g, 12, 1, 'P');
  set(g, 3, 5, 'M'); set(g, 8, 9, 'P');
  set(g, 15, 1, 'X');
  set(g, 8, 4, 'v'); set(g, 1, 9, '^');
  levels.push({ name: 'Square dance', quorum: 6, par: 180, driftPeriod: 2, spawnEvery: 16, map: g });
}

// 6 — The vault: the exit is locked in a hold-walled vault.
{
  const g = grid(21, 11);
  border(g);
  wall(g, 8, 3, 12, 7);
  carve(g, 9, 4, 11, 6);
  set(g, 8, 5, 'H'); set(g, 12, 5, 'H');
  set(g, 11, 4, 'X'); set(g, 10, 5, 'M');
  set(g, 1, 1, '@');
  set(g, 4, 1, 'P'); set(g, 10, 1, 'P'); set(g, 16, 1, 'P');
  set(g, 2, 9, 'P'); set(g, 18, 9, 'P');
  set(g, 2, 5, 'M');
  set(g, 2, 2, '>'); set(g, 18, 2, 'v');
  levels.push({ name: 'The vault', quorum: 7, par: 190, driftPeriod: 2, spawnEvery: 15, map: g });
}

// 7 — Corridors: three long lanes and one drift a lane each way.
{
  const g = grid(23, 13);
  border(g);
  for (const y of [2, 4, 6, 8, 10]) wall(g, 1, y, 21, y);
  set(g, 21, 2, '.'); set(g, 1, 4, '.'); set(g, 21, 6, '.'); set(g, 1, 8, '.'); set(g, 21, 10, '.');
  set(g, 12, 4, '.'); set(g, 12, 6, '.'); set(g, 12, 8, '.'); // one express lane
  set(g, 1, 1, '@');
  set(g, 6, 1, 'P'); set(g, 12, 1, 'P'); set(g, 18, 1, 'P');
  set(g, 5, 5, 'P'); set(g, 15, 5, 'P');
  set(g, 9, 7, 'P'); set(g, 4, 9, 'P'); set(g, 14, 9, 'P'); set(g, 8, 11, 'P');
  set(g, 11, 3, 'M'); set(g, 11, 9, 'M');  // hmm two pads? no: keep one
  set(g, 21, 11, 'X');
  set(g, 3, 3, '>'); set(g, 19, 9, '<');
  levels.push({ name: 'Corridors', quorum: 8, par: 210, driftPeriod: 2, spawnEvery: 14, map: g });
}

// 8 — Crossfire: three drifts sweep one pillar lattice.
{
  const g = grid(17, 13);
  border(g);
  for (const y of [4, 7, 10]) for (const x of [3, 8, 13]) set(g, x, y, '#');
  set(g, 1, 1, '@');
  set(g, 5, 1, 'P'); set(g, 11, 1, 'P');
  set(g, 2, 11, 'P'); set(g, 14, 6, 'P'); set(g, 8, 9, 'P');
  set(g, 8, 6, 'M');
  set(g, 15, 11, 'X');
  set(g, 2, 3, '>'); set(g, 14, 3, '<'); set(g, 8, 2, 'v');
  levels.push({ name: 'Crossfire', quorum: 9, par: 220, driftPeriod: 2, spawnEvery: 13, map: g });
}

// 9 — The gauntlet: hold doors punch through a wall between two drift halls.
{
  const g = grid(23, 11);
  border(g);
  wall(g, 1, 5, 21, 5);
  set(g, 9, 5, 'H'); set(g, 13, 5, 'H');
  set(g, 1, 1, '@');
  set(g, 3, 1, 'P'); set(g, 8, 1, 'P'); set(g, 19, 1, 'P'); set(g, 2, 9, 'P'); set(g, 19, 9, 'P');
  set(g, 5, 3, 'M'); set(g, 19, 3, 'M');
  set(g, 16, 8, 'X');
  set(g, 11, 2, '>'); set(g, 17, 4, '<'); set(g, 4, 7, 'v');
  levels.push({ name: 'The gauntlet', quorum: 10, par: 240, driftPeriod: 2, spawnEvery: 13, map: g });
}

// 10 — Ring cycle: two drift laps, one per ring, around a central island.
{
  const g = grid(21, 13);
  border(g);
  fill0: {
    wall(g, 1, 1, 19, 11);          // everything wall first
    carve(g, 1, 1, 19, 1);          // outer ring
    carve(g, 1, 11, 19, 11);
    carve(g, 1, 1, 1, 11);
    carve(g, 19, 1, 19, 11);
    carve(g, 3, 3, 17, 3);          // inner ring
    carve(g, 3, 9, 17, 9);
    carve(g, 3, 3, 3, 9);
    carve(g, 17, 3, 17, 9);
    set(g, 10, 2, '.'); set(g, 10, 10, '.');  // links
    set(g, 2, 6, '.'); set(g, 18, 6, '.');
    wall(g, 8, 5, 12, 7);           // island box
    carve(g, 9, 5, 11, 7);          // island room
    carve(g, 4, 6, 7, 6); carve(g, 13, 6, 16, 6); // corridors to the island
    set(g, 8, 6, '.'); set(g, 12, 6, '.');    // island doors
    set(g, 9, 6, 'M'); set(g, 11, 6, 'X'); set(g, 10, 5, 'P');
  }
  set(g, 4, 1, 'P'); set(g, 16, 11, 'P'); set(g, 1, 8, 'P'); set(g, 19, 4, 'P'); set(g, 10, 1, 'P');
  set(g, 1, 4, '@');
  set(g, 2, 1, '>'); set(g, 18, 11, '<'); set(g, 4, 3, '>'); set(g, 16, 9, '<');
  levels.push({ name: 'Ring cycle', quorum: 12, par: 260, driftPeriod: 2, spawnEvery: 12, map: g });
}

// 11 — Grand central: a grand hall whose exit plaza hides behind holds.
{
  const g = grid(25, 15);
  border(g);
  for (const y of [3, 6, 9]) { wall(g, 4, y, 5, y); wall(g, 16, y, 17, y); wall(g, 20, y, 21, y); }
  wall(g, 1, 10, 23, 10); set(g, 12, 10, 'H');   // hold wall with one door
  set(g, 1, 1, '@');
  set(g, 3, 1, 'P'); set(g, 21, 1, 'P'); set(g, 8, 1, 'P'); set(g, 16, 1, 'P');
  set(g, 2, 12, 'P'); set(g, 22, 12, 'P');
  set(g, 12, 3, 'M'); set(g, 5, 12, 'M');
  set(g, 12, 12, 'X');
  set(g, 2, 2, '>'); set(g, 22, 2, '<'); set(g, 2, 8, 'v'); set(g, 22, 8, '^'); set(g, 12, 7, '>');
  levels.push({ name: 'Grand central', quorum: 14, par: 280, driftPeriod: 2, spawnEvery: 12, map: g });
}

// 12 — The long haul: a big arena, fast drifts, and a guarded exit vault.
{
  const g = grid(27, 17);
  border(g);
  for (const y of [4, 8, 12]) { wall(g, 3, y, 5, y); wall(g, 13, y, 15, y); wall(g, 21, y, 23, y); }
  wall(g, 20, 2, 25, 4); carve(g, 21, 3, 24, 3); set(g, 21, 3, 'H'); set(g, 23, 3, 'X'); set(g, 20, 3, '.');
  set(g, 1, 1, '@');
  set(g, 3, 1, 'P'); set(g, 10, 1, 'P'); set(g, 17, 1, 'P');
  set(g, 3, 15, 'P'); set(g, 10, 15, 'P'); set(g, 24, 15, 'P'); set(g, 14, 8, 'P');
  set(g, 5, 8, 'M'); set(g, 20, 8, 'M');
  set(g, 2, 3, '>'); set(g, 24, 5, '<'); set(g, 2, 13, 'v'); set(g, 24, 13, '^'); set(g, 10, 10, '>'); set(g, 16, 4, '<');
  levels.push({ name: 'The long haul', quorum: 16, par: 300, driftPeriod: 1, spawnEvery: 12, map: g });
}

const defs = levels.map((l) => ({ ...l, map: rows(l.map) }));
console.log(JSON.stringify(defs, null, 1));

let bad = 0;
for (const def of defs) {
  const v = validateLevel(def);
  if (!v.ok) { console.log('FAIL', def.name, v.errors); bad++; continue; }
  const pre = reach(def.map, true) ?? new Set();
  const ps = parseLevel(def).spawns.filter((s) => pre.has(`${s.x},${s.y}`)).length;
  const ms = [];
  def.map.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (row[x] === 'M' && pre.has(`${x},${y}`)) ms.push(x); });
  if (!ps || !ms.length) { console.log('FAIL pre-open', def.name); bad++; }
}
if (bad) process.exit(1);

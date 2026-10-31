// Scratch: does a reasonable greedy bot ship the first level in most seeds,
// and survive each shipped level from its start, per tests 17's bar?
import { LEVELS } from '../src/data/levels.js';
import { init, step } from '../src/core/game.js';

const DIRS = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] };

function tile(s, x, y) {
  const row = s.level.tiles[y];
  if (row === undefined || x < 0 || x >= row.length) return '#';
  return row[x];
}
function passable(s, x, y) {
  const t = tile(s, x, y);
  if (t === '#') return false;
  if ((t === 'H' || t === 'X') && !s.open) return false;
  if (s.conflicts.some((c) => c.x === x && c.y === y)) return false;
  return true;
}
function danger(x, y, drifts) {
  let cost = 0;
  for (const d of drifts) {
    const dist = Math.abs(d.x - x) + Math.abs(d.y - y);
    if (dist === 0) cost += 50;
    else if (dist === 1) cost += 12;
    else if (dist === 2) cost += 3;
  }
  return cost;
}
// Dijkstra to the target avoiding danger; returns first step or null.
function stepToward(s, tx, ty) {
  const q = [{ x: s.player.x, y: s.player.y, cost: danger(s.player.x, s.player.y, s.drifts), prev: null, dir: null }];
  const best = new Map([[`${s.player.x},${s.player.y}`, q[0].cost]]);
  const fringe = [q[0]];
  while (fringe.length) {
    fringe.sort((a, b) => a.cost - b.cost);
    const cur = fringe.shift();
    for (const [dir, [dx, dy]] of Object.entries(DIRS)) {
      const nx = cur.x + dx, ny = cur.y + dy;
      if (!passable(s, nx, ny)) continue;
      const c = cur.cost + 1 + danger(nx, ny, s.drifts);
      const key = `${nx},${ny}`;
      if (best.has(key) && best.get(key) <= c) continue;
      best.set(key, c);
      fringe.push({ x: nx, y: ny, cost: c, prev: cur, dir });
    }
    if (cur.x === tx && cur.y === ty) {
      let n = cur;
      while (n.prev && !(n.prev.x === s.player.x && n.prev.y === s.player.y)) n = n.prev;
      return n.dir;
    }
  }
  return null;
}
function exitCell(s) {
  for (let y = 0; y < s.level.height; y++) {
    for (let x = 0; x < s.level.width; x++) if (tile(s, x, y) === 'X') return { x, y };
  }
  return { x: 0, y: 0 };
}

function botInput(s) {
  if (!s.open) {
    // gather: nearest patch while under 3 carried, else the merge pad
    let target = null;
    if (s.carried.length < 3 && s.patches.length > 0) {
      let bestD = Infinity;
      for (const p of s.patches) {
        const d = Math.abs(p.x - s.player.x) + Math.abs(p.y - s.player.y);
        if (d < bestD) { bestD = d; target = p; }
      }
      return { move: stepToward(s, target.x, target.y) ?? null, pause: false };
    }
    if (s.carried.length > 0) {
      const t = tile(s, s.player.x, s.player.y);
      if (t !== 'M') {
        let bestD = Infinity;
        for (let y = 0; y < s.level.height; y++) {
          for (let x = 0; x < s.level.width; x++) {
            if (tile(s, x, y) === 'M') {
              const d = Math.abs(x - s.player.x) + Math.abs(y - s.player.y);
              if (d < bestD) { bestD = d; target = { x, y }; }
            }
          }
        }
        return { move: stepToward(s, target.x, target.y) ?? null, pause: false };
      }
    }
    return { move: null, pause: false };
  }
  return { move: stepToward(s, exitCell(s).x, exitCell(s).y), pause: false };
}

function broken(s) {
  const wall = (x, y) => { const r = s.level.tiles[y]; return r === undefined || x < 0 || x >= r.length || r[x] === '#'; };
  if (!['playing', 'won', 'lost'].includes(s.status)) return 'status';
  if (wall(s.player.x, s.player.y)) return 'player in wall';
  if (s.carried.length > 3) return 'carry';
  if (!Number.isInteger(s.lives) || s.lives < 0 || s.lives > 3) return 'lives';
  if (!Number.isInteger(s.score) || s.score < 0) return 'score';
  if (s.patches.some((p) => !s.level.spawns.some((q) => q.x === p.x && q.y === p.y))) return 'patch off spawn';
  if (s.drifts.some((d) => wall(d.x, d.y))) return 'drift in wall';
  return null;
}

let shipped = 0;
for (let seed = 1; seed <= 10; seed++) {
  let s = init(seed);
  let landed = false;
  for (let i = 0; i < 1500 && s.status === 'playing'; i++) {
    s = step(s, botInput(s));
    if (s.levelIndex > 0) landed = true;
  }
  if (landed || s.status === 'won') shipped++;
  console.log(`seed ${seed}: status ${s.status} levelIndex ${s.levelIndex} score ${s.score} lives ${s.lives} merges ${s.merges}`);
}
console.log(`shipped ${shipped}/10`);

for (let i = 0; i < LEVELS.length; i++) {
  let s = init(100 + i, { level: i });
  let bad = null;
  const t0 = Date.now();
  for (let j = 0; j < 800 && s.status === 'playing'; j++) {
    s = step(s, botInput(s));
    bad = broken(s);
    if (bad) break;
  }
  console.log(`level ${i} (${LEVELS[i].name}): ${s.status} score ${s.score} lives ${s.lives} merges ${s.merges} idx ${s.levelIndex}${bad ? ' BROKEN: ' + bad : ''}`);
}

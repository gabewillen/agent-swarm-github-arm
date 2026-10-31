// Playability audit for the drafted levels: for each level, walk the map
// from the start cell with hold doors treated as WALLS (they are closed
// until quorum) and count the spawn points the player can reach before
// anything opens. A level is winnable only if that count >= quorum.
import { LEVELS } from './levels-draft-levels.mjs';

function audit(def) {
  const w = def.map[0].length, h = def.map.length;
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? '#' : def.map[y][x]);
  let start = null; const spawns = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ch = at(x, y);
    if (ch === '@') start = { x, y };
    if (ch === 'P') spawns.push({ x, y });
  }
  const pass = (ch) => ch !== '#' && ch !== 'H';
  const seen = new Set([`${start.x},${start.y}`]);
  const q = [start];
  while (q.length) {
    const { x, y } = q.pop();
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const nx = x + dx, ny = y + dy, k = `${nx},${ny}`;
      if (seen.has(k) || !pass(at(nx, ny))) continue;
      seen.add(k); q.push({ x: nx, y: ny });
    }
  }
  const reach = spawns.filter((s) => seen.has(`${s.x},${s.y}`)).length;
  const exitReach = def.map.some((row, y) => [...row].some((ch, x) => ch === 'X' && seen.has(`${x},${y}`)));
  const driftCount = [...def.map.join('')].filter((ch) => '<^v>'.includes(ch)).length;
  const ok = reach >= def.quorum;
  return { name: def.name, reach, quorum: def.quorum, exitReach, driftCount, ok, note: ok ? '' : 'UNWINNABLE pre-open' };
}

for (const lvl of LEVELS) {
  const a = audit(lvl);
  const tag = a.ok ? 'ok' : 'FIX';
  console.log(`${tag} ${a.name}: reach=${a.reach} quorum=${a.quorum} drifts=${a.driftCount} exitReachable=${a.exitReach} ${a.note}`);
  if (a.ok === false) {
    // dump where spawns are
    console.log('  rows:');
    lvl.map.forEach((r) => console.log('   ', r));
  }
}

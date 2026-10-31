// Local helper (not an acceptance test): level design checks.
import { validateLevel } from '../src/core/level.js';
import { LEVELS } from '../src/data/levels.js';

for (const def of LEVELS) {
  const v = validateLevel(def);
  const problems = [];
  if (!v.ok) {
    // Reproduce validateLevel's checks with coordinates.
    for (let y = 0; y < def.map.length; y++) {
      const row = def.map[y];
      if (row.length !== def.map[0].length) problems.push(`ragged row ${y} len ${row.length}`);
      for (let x = 0; x < row.length; x++) {
        const edge = y === 0 || y === def.map.length - 1 || x === 0 || x === row.length - 1;
        if (edge && row[x] !== '#') problems.push(`no_border at (${x},${y}) '${row[x]}'`);
      }
    }
    // Reachability, mirroring §4.
    let start = null;
    const targets = [];
    let players = 0;
    for (let y = 0; y < def.map.length; y++) {
      for (let x = 0; x < def.map[y].length; x++) {
        const ch = def.map[y][x];
        if (ch === '@') { players++; start = { x, y }; }
        if ('XMP'.includes(ch)) targets.push({ x, y, ch });
      }
    }
    if (start && players === 1) {
      const seen = new Set([`${start.x},${start.y}`]);
      const queue = [start];
      while (queue.length > 0) {
        const c = queue.pop();
        for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
          const x = c.x + dx, y = c.y + dy;
          const key = `${x},${y}`;
          if (seen.has(key) || y < 0 || y >= def.map.length || x < 0 || x >= def.map[y].length) continue;
          if (def.map[y][x] === '#') continue;
          seen.add(key);
          queue.push({ x, y });
        }
      }
      for (const t of targets) {
        if (!seen.has(`${t.x},${t.y}`)) problems.push(`unreachable ${t.ch} at (${t.x},${t.y})`);
      }
    }
  }
  console.log(v.ok ? 'ok   ' : 'FAIL ', def.name.padEnd(14), v.ok ? '' : problems.join(' | '));
}

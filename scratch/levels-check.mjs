// Scratch harness: rectify map widths, validate, and report level facts.
import { LEVELS } from '../src/data/levels.js';
import { validateLevel, parseLevel } from '../src/core/level.js';

// Pad every row to its map's widest row, then force the border ring to '#'.
const fixed = LEVELS.map((def) => {
  const w = Math.max(...def.map.map((r) => r.length));
  const h = def.map.length;
  const map = def.map.map((r, y) => {
    let row = r.length <= w ? r + '.'.repeat(w - r.length) : r.slice(0, w);
    const cells = row.split('');
    for (let x = 0; x < w; x++) if (y === 0 || y === h - 1 || x === 0 || x === w - 1) cells[x] = '#';
    return cells.join('');
  });
  return { ...def, map };
});

for (const def of fixed) {
  const v = validateLevel(def);
  if (v.ok) {
    const l = parseLevel(def);
    console.log(`ok ${def.name}: ${l.width}x${l.height} P${l.spawns.length} D${l.drifts.length} M1 ${l.spawns.map((s) => `${s.x},${s.y}`).join(' ')} | ${l.drifts.map((d) => `${d.x},${d.y}:${d.dir[0]}`).join(' ')}`);
    console.log(def.map.map((r) => '  ' + JSON.stringify(r) + ',').join('\n'));
  } else {
    console.log(`BAD ${def.name}: ${def.map.map((r) => '  ' + JSON.stringify(r) + ',').join('\n')}\n  -> ${v.errors.join(',')}`);
  }
}

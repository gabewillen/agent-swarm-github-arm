// Scratch design loop for src/data/levels.js: builds levels strictly
// (row builder asserts widths) and validates against the real validator.
import { parseLevel, validateLevel } from '../src/core/level.js';



import { LEVELS } from './levels-draft-levels.mjs';



for (const lvl of LEVELS) {
  const widths = [...new Set(lvl.map.map((r) => r.length))];
  const v = validateLevel(lvl);
  let parsed = '';
  try {
    const l = parseLevel(lvl);
    parsed = `drifts=${l.drifts.length} spawns=${l.spawns.length} ${l.width}x${l.height}`;
  } catch (e) {
    parsed = `parse: ${e.message}`;
  }
  console.log(`${lvl.name}: widths=${widths.join(',')} ${parsed} holds=${lvl.map.some((r) => r.includes('H'))}`);
  if (!v.ok) console.log('   errors:', v.errors.join(','));
}

console.log('\n--- final maps ---');
for (const lvl of LEVELS) console.log(JSON.stringify(lvl));

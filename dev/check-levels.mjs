// Quorum Run input (DESIGN.md §12) — dev checks: validate every shipped
// level and print floor regions per interesting cell. Not part of src/.

import { validateLevel, parseLevel } from '../src/core/level.js';
import { LEVELS } from '../src/data/levels.js';

for (const def of LEVELS) {
  const result = validateLevel(def);
  if (!result.ok) {
    console.log(`${def.name}: ${result.errors.join(',')}`);
    continue;
  }
  const level = parseLevel(def);
  console.log(`${def.name}: ok (${level.width}x${level.height}, ${level.spawns.length} spawns, ${level.drifts.length} drifts)`);
}

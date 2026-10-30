// My own check: report per-level validity of src/data/levels.js.
import { LEVELS } from '../src/data/levels.js';
import { validateLevel, parseLevel } from '../src/core/level.js';

let bad = 0;
let withDrift = 0;
let withHold = 0;
for (const def of LEVELS) {
  const { ok, errors } = validateLevel(def);
  const l = ok ? parseLevel(def) : null;
  const d = l ? l.drifts.length : -1;
  const h = def.map.join('').split('H').length - 1;
  if (d > 0) withDrift++;
  if (h > 0) withHold++;
  if (!ok) bad++;
  console.log(
    `${ok ? 'ok  ' : 'BAD '} ${def.name.padEnd(18)} w=${l ? l.width : def.map[0].length} h=${l ? l.height : def.map.length}` +
    ` drift=${d} holds=${h} spawns=${l ? l.spawns.length : '-'} quorum=${def.quorum} par=${def.par} ${errors.join(',')}`,
  );
  if (ok && l.width * l.height > 32 * 24) console.log('   size issue');
}
console.log(`levels=${LEVELS.length} bad=${bad} withDrift=${withDrift} withHold=${withHold}`);
if (LEVELS.length < 10 || bad || withDrift < 6 || withHold < 4) console.log('CHECK FAILED');
else console.log('levels ok');

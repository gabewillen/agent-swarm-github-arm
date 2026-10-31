// agent-1 selftest (not part of the acceptance suite): plays whole games
// with the bot over the shipped levels and asserts the invariants every
// step, looking for cross-module mismatches the section tests cannot see.
import { checkState } from '../../src/core/invariants.js';
import { init, step } from '../../src/core/game.js';
import { botInput } from '../../src/core/bot.js';
import { LEVELS } from '../../src/data/levels.js';

let failures = 0;
function fail(msg) {
  failures += 1;
  console.log('FAIL', msg);
}

const ends = [];
for (let seed = 1; seed <= 12; seed++) {
  let s = init(seed * 7919, { levels: LEVELS });
  for (let i = 0; i < 4000; i++) {
    const input = botInput(s);
    const next = step(s, input);
    const bad = checkState(next);
    if (bad.length > 0) {
      fail(`seed ${seed} step ${i}: checkState ${bad.join(',')} (status ${next.status})`);
      break;
    }
    if (next.status !== 'playing') {
      ends.push(`${seed}: ${next.status} score ${next.score} level ${next.levelIndex} ticks ${next.tick}`);
      s = next;
      break;
    }
    s = next;
  }
  if (s.status === 'playing') {
    fail(`seed ${seed}: still playing after 4000 ticks at level ${s.levelIndex} (stall?)`);
  }
}
console.log(ends.join('\n'));
console.log(failures === 0 ? 'SELFTEST OK' : `SELFTEST FAILURES: ${failures}`);

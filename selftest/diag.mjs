// Diagnostic: play the corridor level and print what the bot is doing.
import { init, step } from './fakegame.mjs';
import { botInput } from '../src/core/bot.js';
import { CORRIDORS } from './levels.mjs';

const seed = Number(process.argv[2] ?? 1);
let s = init(seed, { levels: [CORRIDORS] });
for (let i = 0; i < 900 && s.status === 'playing'; i++) {
  const input = botInput(s);
  const prevScore = s.score;
  s = step(s, input);
  if (i % 25 === 0 || s.events.some((e) => ['quorum', 'won', 'lost', 'drop', 'hit'].includes(e))) {
    console.log(
      `t${String(i).padStart(3)} @(${s.player.x},${s.player.y}) car${JSON.stringify(s.carried)} pat${
        s.patches.length ? s.patches.map((p) => `${p.x},${p.y}:${p.color}`).join(' ') : '-'
      } m${s.merges}/4 op${s.open ? 1 : 0} sc${s.score} live${s.lives} inv${s.invuln} drifts[${
        s.drifts.map((d) => `${d.x},${d.y}${d.dir[0]}`).join(' ')
      }] conf[${s.conflicts.map((c) => `${c.x},${c.y}:${c.ttl}`).join(' ')}] ev[${s.events}] imove=${input.move}`
    );
  }
}
console.log('end:', s.status, 'score', s.score, 'merges', s.merges, 'carried', s.carried.length, 'patches', s.patches.length, 'lvlTicks', s.levelTicks);

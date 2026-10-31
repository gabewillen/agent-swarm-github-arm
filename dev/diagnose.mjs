// Diagnostic: run the bot through every dev level with many seeds and report
// ship rate, hit/drop counts, and ticks taken.
import { init, step } from './quorum.js';
import { botInput } from '../src/core/bot.js';
import { DEVLEVELS } from './levels-dev.js';

function broken(s) {
  const wall = (x, y) => {
    const r = s.level.tiles[y];
    return r === undefined || x < 0 || x >= r.length || r[x] === '#';
  };
  if (!['playing', 'won', 'lost'].includes(s.status)) return 'status';
  if (wall(s.player.x, s.player.y)) return 'player in wall';
  if (s.carried.length > 3) return 'carry';
  if (!Number.isInteger(s.lives) || s.lives < 0 || s.lives > 3) return 'lives';
  if (!Number.isInteger(s.score) || s.score < 0) return 'score';
  if (s.patches.some((p) => !s.level.spawns.some((q) => q.x === p.x && q.y === p.y))) return 'patch off spawn';
  if (s.drifts.some((d) => wall(d.x, d.y))) return 'drift in wall';
  return null;
}

for (const def of DEVLEVELS) {
  let ships = 0, deaths = 0, hits = 0, drops = 0, conflicts = 0, scoreSum = 0;
  for (let seed = 1; seed <= 20; seed++) {
    let s = init(seed, { levels: [def] });
    let i = 0;
    for (; i < 2000 && s.status === 'playing'; i++) {
      const input = botInput(s);
      s = step(s, input);
      const why = broken(s);
      if (why) { console.log(`BROKEN ${def.name} seed ${seed} tick ${i}: ${why}`); break; }
      for (const e of s.events) {
        if (e === 'hit') hits++;
        else if (e === 'drop') drops++;
        else if (e === 'conflict') conflicts++;
      }
    }
    if (s.status === 'won') ships++;
    if (s.status === 'lost') deaths++;
    scoreSum += s.score;
  }
  console.log(
    `${def.name.padEnd(22)} ships ${(ships / 2).toFixed(1)}% deaths ${(deaths / 2).toFixed(1)}% `
    + `hits ${hits} drops ${drops} conflicts ${conflicts} avg score ${(scoreSum / 20).toFixed(0)}`,
  );
}

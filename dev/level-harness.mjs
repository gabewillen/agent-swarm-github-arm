// Dev harness for src/data/levels.js (NOT an acceptance test). Checks the
// DESIGN.md §4 rules with a local copy of the validator and an optimistic
// BFS solver: the fewest steps a player needs to merge the quorum from the
// level's initial patches and reach the open exit, ignoring drifts and
// respawns. Use it to set pars: par = ceil(1.7 * optimal) + some slack.
import { LEVELS } from '../src/data/levels.js';

function validate(def) {
  const errors = [];
  const good = (v) => typeof v === 'string' && v.length > 0;
  const nums = ['quorum', 'par', 'driftPeriod', 'spawnEvery'];
  if (!good(def.name) || nums.some((f) => !Number.isInteger(def[f]) || def[f] < 1) ||
    !Array.isArray(def.map) || def.map.length === 0 || def.map.some((r) => typeof r !== 'string')) {
    return ['bad_fields'];
  }
  const rows = def.map;
  if (new Set(rows.map((r) => r.length)).size > 1) errors.push('ragged');
  if (rows.length > 24 || rows[0].length > 32) errors.push('too_big');
  const chars = /^[#.@PMXH^v<>]$/;
  for (const r of rows) for (const c of r) if (!chars.test(c)) { errors.push('bad_char'); break; }
  let at = 0, ex = 0;
  rows.forEach((r, y) => [...r].forEach((c, x) => {
    const border = y === 0 || y === rows.length - 1 || x === 0 || x === r.length - 1;
    if (border && c !== '#') errors.push('no_border');
    if (c === '@') at++;
    if (c === 'X') ex++;
  }));
  if (at !== 1) errors.push('player_count');
  if (ex !== 1) errors.push('exit_count');
  if (!rows.some((r) => r.includes('M'))) errors.push('no_merge');
  if (!rows.some((r) => r.includes('P'))) errors.push('no_spawn');
  if (at === 1) {
    // Reachability BFS from @ through everything that is not '#'.
    bfs: {
      const start = { x: rows.findIndex((r) => r.includes('@')).toString(), y: -1 };
      rows.forEach((r, y) => { if (r.includes('@')) { start.x = r.indexOf('@'); start.y = y; } });
      const seen = new Set([`${start.x},${start.y}`]);
      const q = [start];
      while (q.length) {
        const { x, y } = q.pop();
        for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
          const nx = x + dx, ny = y + dy, c = rows[ny]?.[nx];
          if (c && c !== '#' && !seen.has(`${nx},${ny}`)) { seen.add(`${nx},${ny}`); q.push({ x: nx, y: ny }); }
        }
      }
      const need = [];
      rows.forEach((r, y) => [...r].forEach((c, x) => { if ('PMX'.includes(c)) need.push(`${x},${y}`); }));
      if (need.some((k) => !seen.has(k))) errors.push('unreachable');
    }
  }
  return errors;
}

// Optimistic step count: ignore drifts and respawns; patches start on the
// spawn points; doors and the exit open once merges reach the quorum.
function optimal(def) {
  const rows = def.map;
  let start, exit, mergesAt = [];
  const patches = [];
  rows.forEach((r, y) => [...r].forEach((c, x) => {
    if (c === '@') start = { x, y };
    if (c === 'X') exit = { x, y };
    if (c === 'M') mergesAt.push({ x, y });
    if (c === 'P') patches.push({ x, y });
  }));
  const solid = (x, y) => !rows[y] || !rows[y][x] || rows[y][x] === '#';
  const open = (merges) => merges >= def.quorum;
  const passable = (x, y, merges) => {
    const c = rows[y]?.[x];
    return c && c !== '#' && (c !== 'H' || open(merges)) && (c !== 'X' || open(merges));
  };
  // State: position, multiset of taken spawns ( bitmask), carried (0..CARRY_MAX), merges.
  const t = (x, y, taken, carried, merges) => `${x},${y},${taken},${carried},${merges}`;
  const seen = new Set([t(start.x, start.y, 0, 0, 0)]);
  let q = [{ x: start.x, y: start.y, taken: 0, carried: 0, merges: 0 }];
  const onMerge = new Set(mergesAt.map((m) => `${m.x},${m.y}`));
  for (let steps = 0; q.length; steps++) {
    const next = [];
    const push = (st) => { const k = t(st.x, st.y, st.taken, st.carried, st.merges); if (!seen.has(k)) { seen.add(k); next.push(st); } };
    for (const s of q) {
      if (open(s.merges) && s.x === exit.x && s.y === exit.y) return steps;
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0], [0, 0]]) {
        const nx = s.x + dx, ny = s.y + dy;
        if (dx || dy ? !passable(nx, ny, s.merges) : false) continue;
        let st = { ...s, x: nx, y: ny };
        const k1 = `${nx},${ny}`;
        // Pickup
        const idx = patches.findIndex((p, i) => !(st.taken & (1 << i)) && p.x === nx && p.y === ny);
        if (idx >= 0 && st.carried < 3) {
          push({ ...st, carried: st.carried + 1, taken: st.taken | (1 << idx) });
        }
        // Merge on a pad (anywhere they can stand is fine to model; real
        // pads merge when standing on them, holding n patches).
        if (onMerge.has(k1) && st.carried > 0) {
          push({ ...st, carried: 0, merges: Math.min(def.quorum, st.merges + st.carried) });
        }
        push(st);
      }
    }
    q = next;
  }
  return Infinity;
}

const CARRY = 3;
for (const def of LEVELS) {
  const errors = validate(def);
  const n = optimal(def);
  const spawnCount = def.map.join('').split('P').length - 1;
  const drifts = def.map.join('').split(/[<>^v]/).length - 1;
  const holds = def.map.join('').split('H').length - 1;
  console.log(
    `${def.name.padEnd(16)} drifts=${drifts} holds=${holds} spawns=${spawnCount} quorum=${def.quorum} ` +
    `driftPeriod=${def.driftPeriod} spawnEvery=${def.spawnEvery} optimal(optimistic)=${n === Infinity ? 'unsolvable' : n} ` +
    `par=${def.par} par/optimal=${(def.par / n).toFixed(2)} ${errors.length ? 'ERRORS: ' + errors.join(',') : 'valid'}`,
  );
  if (n === Infinity) {
    console.log(`  >>> ${def.name}: not solvable without respawns (quorum=${def.quorum} > patches=${spawnCount}?)`);
  }
}
console.log(`\nlevels: ${LEVELS.length} (test wants >= 10), sums: drifts=${LEVELS.filter((l) => /[<>^v]/.test(l.map.join(''))).length} (>=6), holds=${LEVELS.filter((l) => l.map.some((r) => r.includes('H'))).length} (>=4)`);

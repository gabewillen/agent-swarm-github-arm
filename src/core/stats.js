// Quorum Run — run statistics (DESIGN.md §22).
// statsInit() is the blank table, statsUpdate(stats, prev, next, input) folds
// one step into a new table without changing its argument, and statsLines()
// renders the lines the UI shows.

export function statsInit() {
  return {
    ticks: 0, moves: 0, pickups: 0, merges: 0, patchesMerged: 0,
    bestMerge: 0, hits: 0, drops: 0, conflicts: 0, levels: 0,
  };
}

// One step's events, counted one for one into these fields.
const EVENT_OF = [
  ['pickups', 'pickup'],
  ['merges', 'merge'],
  ['hits', 'hit'],
  ['drops', 'drop'],
  ['conflicts', 'conflict'],
];

export function statsUpdate(stats, prev, next, input) {
  const out = { ...statsInit() };
  if (stats && typeof stats === 'object') {
    for (const key of Object.keys(out)) {
      if (typeof stats[key] === 'number' && Number.isFinite(stats[key])) out[key] = stats[key];
    }
  }

  // Ticks passed this step.
  const prevTick = prev && typeof prev.tick === 'number' ? prev.tick : 0;
  const nextTick = next && typeof next.tick === 'number' ? next.tick : 0;
  const dt = nextTick - prevTick;
  out.ticks = (out.ticks || 0) + dt;

  const events = next && Array.isArray(next.events) ? next.events : [];

  // Moves: the input gave a move, a tick passed, and the player ended
  // exactly one cell from where it was.
  const prevPlayer = prev ? prev.player : null;
  const nextPlayer = next ? next.player : null;
  let distance = Infinity;
  if (prevPlayer && nextPlayer &&
      Number.isInteger(prevPlayer.x) && Number.isInteger(prevPlayer.y) &&
      Number.isInteger(nextPlayer.x) && Number.isInteger(nextPlayer.y)) {
    distance = Math.abs(nextPlayer.x - prevPlayer.x) + Math.abs(nextPlayer.y - prevPlayer.y);
  }
  if (input && input.move && dt > 0 && distance === 1) {
    out.moves = (out.moves || 0) + 1;
  }

  // Event tallies.
  for (const [key, name] of EVENT_OF) {
    let count = 0;
    for (const event of events) if (event === name) count++;
    if (count) out[key] = (out[key] || 0) + count;
  }

  // A merge banks everything carried and raises the best merge.
  if (events.includes('merge')) {
    const carried = prev && Array.isArray(prev.carried) ? prev.carried.length : 0;
    out.patchesMerged = (out.patchesMerged || 0) + carried;
    out.bestMerge = Math.max(out.bestMerge || 0, carried);
  }

  // Levels: a level shipped, or the whole game won.
  for (const event of events) {
    if (event === 'level' || event === 'won') out.levels = (out.levels || 0) + 1;
  }

  return out;
}

export function statsLines(stats) {
  const s = stats && typeof stats === 'object' ? stats : {};
  const at = (key) => (typeof s[key] === 'number' && Number.isFinite(s[key]) ? s[key] : 0);
  return [
    `MOVES ${at('moves')}`,
    `MERGES ${at('merges')}`,
    `BEST ${at('bestMerge')}`,
    `HITS ${at('hits')}`,
    `LEVELS ${at('levels')}`,
  ];
}

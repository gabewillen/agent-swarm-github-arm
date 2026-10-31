// Run statistics (DESIGN.md §22). Pure: statsUpdate never changes its
// arguments and never mutates the stats it is given.

export function statsInit() {
  return {
    ticks: 0, moves: 0, pickups: 0, merges: 0, patchesMerged: 0,
    bestMerge: 0, hits: 0, drops: 0, conflicts: 0, levels: 0,
  };
}

const count = (events, name) => events.reduce((n, e) => (e === name ? n + 1 : n), 0);

export function statsUpdate(stats, prev, next, input) {
  const events = Array.isArray(next.events) ? next.events : [];
  const grown = typeof next.tick === 'number' && typeof prev.tick === 'number';
  const ticked = grown && next.tick - prev.tick > 0;

  // A move counts when a move was given, a tick passed, and the player ended
  // exactly one cell (by Manhattan distance) from where it was.
  let moves = stats.moves;
  if (ticked && input && input.move != null && prev.player && next.player) {
    const dist = Math.abs(next.player.x - prev.player.x) + Math.abs(next.player.y - prev.player.y);
    if (dist === 1) moves += 1;
  }

  const merged = count(events, 'merge');
  let patchesMerged = stats.patchesMerged;
  let bestMerge = stats.bestMerge;
  if (merged > 0) {
    const carried = Array.isArray(prev.carried) ? prev.carried.length : 0;
    patchesMerged += carried;
    bestMerge = Math.max(bestMerge, carried);
  }

  return {
    ticks: stats.ticks + (grown ? next.tick - prev.tick : 0),
    moves,
    pickups: stats.pickups + count(events, 'pickup'),
    merges: stats.merges + merged,
    patchesMerged,
    bestMerge,
    hits: stats.hits + count(events, 'hit'),
    drops: stats.drops + count(events, 'drop'),
    conflicts: stats.conflicts + count(events, 'conflict'),
    levels: stats.levels + count(events, 'level') + count(events, 'won'),
  };
}

export function statsLines(stats) {
  return [
    `MOVES ${stats.moves}`,
    `MERGES ${stats.merges}`,
    `BEST ${stats.bestMerge}`,
    `HITS ${stats.hits}`,
    `LEVELS ${stats.levels}`,
  ];
}

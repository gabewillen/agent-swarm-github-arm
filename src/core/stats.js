// Run statistics (DESIGN.md §22): counters the HUD can show. Pure.

export function statsInit() {
  return {
    ticks: 0, moves: 0, pickups: 0, merges: 0, patchesMerged: 0,
    bestMerge: 0, hits: 0, drops: 0, conflicts: 0, levels: 0,
  };
}

const count = (events, name) => events.filter((e) => e === name).length;

// statsUpdate stats, prev, next, input) folds one step into stats and
// returns new stats: ticks, moves, pickups, merges, patchesMerged,
// bestMerge, hits, drops, conflicts, and shipped levels.
export function statsUpdate(stats, prev, next, input) {
  const events = Array.isArray(next.events) ? next.events : [];
  const ticks = next.tick - prev.tick;
  const moveGiven = !!input && typeof input.move === 'string' && input.move !== '';
  const dx = Math.abs((next.player?.x ?? 0) - (prev.player?.x ?? 0));
  const dy = Math.abs((next.player?.y ?? 0) - (prev.player?.y ?? 0));
  const merged = count(events, 'merge');
  const hand = prev.carried?.length ?? 0;
  return {
    ...stats,
    ticks: stats.ticks + ticks,
    moves: stats.moves + (moveGiven && ticks > 0 && dx + dy === 1 ? 1 : 0),
    pickups: stats.pickups + count(events, 'pickup'),
    merges: stats.merges + merged,
    patchesMerged: stats.patchesMerged + (merged > 0 ? hand : 0),
    bestMerge: merged > 0 ? Math.max(stats.bestMerge, hand) : stats.bestMerge,
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

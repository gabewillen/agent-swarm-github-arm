// Run statistics (DESIGN.md §22). Pure; reads one step's states and input
// and returns new stats without touching its arguments.

export function statsInit() {
  return {
    ticks: 0, moves: 0, pickups: 0, merges: 0, patchesMerged: 0,
    bestMerge: 0, hits: 0, drops: 0, conflicts: 0, levels: 0,
  };
}

function countOf(events, name) {
  let n = 0;
  for (const event of events) if (event === name) n++;
  return n;
}

export function statsUpdate(stats, prev, next, input) {
  const out = { ...stats };
  const events = next && Array.isArray(next.events) ? next.events : [];
  const diff = ((next && next.tick) || 0) - ((prev && prev.tick) || 0);

  out.ticks += diff;
  if (diff > 0 && input && input.move && prev && prev.player && next && next.player) {
    const dx = next.player.x - prev.player.x;
    const dy = next.player.y - prev.player.y;
    if (Math.abs(dx) + Math.abs(dy) === 1) out.moves += 1;
  }

  out.pickups += countOf(events, 'pickup');
  const merges = countOf(events, 'merge');
  out.merges += merges;
  out.hits += countOf(events, 'hit');
  out.drops += countOf(events, 'drop');
  out.conflicts += countOf(events, 'conflict');
  out.levels += countOf(events, 'level') + countOf(events, 'won');

  if (merges > 0) {
    const n = prev && Array.isArray(prev.carried) ? prev.carried.length : 0;
    out.patchesMerged += n;
    out.bestMerge = Math.max(out.bestMerge, n);
  }

  return out;
}

export function statsLines(stats) {
  return [
    `MOVES ${stats.moves}`, `MERGES ${stats.merges}`, `BEST ${stats.bestMerge}`,
    `HITS ${stats.hits}`, `LEVELS ${stats.levels}`,
  ];
}

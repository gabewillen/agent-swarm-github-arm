// §22 Run statistics: statsInit(), statsUpdate(stats, prev, next, input)
// and statsLines(stats). statsUpdate is pure: it never changes its
// argument and returns the stats of one step.

export function statsInit() {
  return {
    ticks: 0,
    moves: 0,
    pickups: 0,
    merges: 0,
    patchesMerged: 0,
    bestMerge: 0,
    hits: 0,
    drops: 0,
    conflicts: 0,
    levels: 0,
  };
}

export function statsUpdate(stats, prev, next, input) {
  const out = typeof stats === 'object' && stats !== null ? { ...statsInit(), ...stats } : statsInit();

  const prevTick = prev && Number.isInteger(prev.tick) ? prev.tick : 0;
  const nextTick = next && Number.isInteger(next.tick) ? next.tick : 0;
  const ticked = nextTick - prevTick;
  out.ticks += ticked;

  // A move: an input move was given, a tick passed, and the player ended
  // exactly one cell (orthogonally) from where it was.
  const moved = !!input && input.move != null;
  if (moved && ticked > 0) {
    const a = prev && prev.player ? prev.player : null;
    const b = next && next.player ? next.player : null;
    if (a && b) {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      if (Math.abs(dx) + Math.abs(dy) === 1) out.moves += 1;
    }
  }

  const events = next && Array.isArray(next.events) ? next.events : [];
  for (const event of events) {
    if (event === 'pickup') {
      out.pickups += 1;
    } else if (event === 'merge') {
      out.merges += 1;
      const size = prev && Array.isArray(prev.carried) ? prev.carried.length : 0;
      out.patchesMerged += size;
      if (size > out.bestMerge) out.bestMerge = size;
    } else if (event === 'hit') {
      out.hits += 1;
    } else if (event === 'drop') {
      out.drops += 1;
    } else if (event === 'conflict') {
      out.conflicts += 1;
    } else if (event === 'level' || event === 'won') {
      out.levels += 1;
    }
  }

  return out;
}

export function statsLines(stats) {
  const s = stats || {};
  return [
    `MOVES ${s.moves ?? 0}`,
    `MERGES ${s.merges ?? 0}`,
    `BEST ${s.bestMerge ?? 0}`,
    `HITS ${s.hits ?? 0}`,
    `LEVELS ${s.levels ?? 0}`,
  ];
}

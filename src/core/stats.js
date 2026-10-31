// Quorum Run run statistics (DESIGN.md §22).
// One game run's counters, carried across levels: statsInit starts them at
// zero, statsUpdate folds one step into them from the step's previous and
// next states and its input, and statsLines renders five of them as HUD
// text. Pure: statsUpdate returns new stats and never changes its
// arguments.

// The counters, in the design's order.
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

// New stats after one step from prev to next played with input.
export function statsUpdate(stats, prev, next, input) {
  const out = { ...stats };
  const prevTick = prev && typeof prev.tick === 'number' ? prev.tick : 0;
  const nextTick = next && typeof next.tick === 'number' ? next.tick : 0;
  const ticks = nextTick - prevTick;
  out.ticks += ticks;

  const events = next && Array.isArray(next.events) ? next.events : [];
  const count = (name) => events.reduce((n, e) => (e === name ? n + 1 : n), 0);

  // A move: the input gave a move, a tick passed, and the player ended
  // exactly one cell from where it was.
  const move = input && input.move ? input.move : null;
  const before = prev && prev.player ? prev.player : null;
  const after = next && next.player ? next.player : null;
  if (move && ticks > 0 && before && after) {
    const dx = Math.abs(after.x - before.x);
    const dy = Math.abs(after.y - before.y);
    if (dx + dy === 1) out.moves += 1;
  }

  out.pickups += count('pickup');
  out.merges += count('merge');
  out.hits += count('hit');
  out.drops += count('drop');
  out.conflicts += count('conflict');

  // A merge counts the carried patches that went into it, and keeps the
  // biggest merge.
  const merges = count('merge');
  if (merges > 0) {
    const carried = prev && Array.isArray(prev.carried) ? prev.carried.length : 0;
    out.patchesMerged += carried * merges;
    out.bestMerge = Math.max(out.bestMerge, carried);
  }

  // A shipped level is a `level` event, the game's end a `won`.
  out.levels += count('level') + count('won');

  return out;
}

// The stats screen's lines.
export function statsLines(stats) {
  return [
    `MOVES ${stats.moves}`,
    `MERGES ${stats.merges}`,
    `BEST ${stats.bestMerge}`,
    `HITS ${stats.hits}`,
    `LEVELS ${stats.levels}`,
  ];
}

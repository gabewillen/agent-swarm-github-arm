// Run statistics (DESIGN.md §22). statsInit is all zero, statsUpdate folds
// one step (prev to next, the input that made it) into new stats, and
// statsLines renders the five shown numbers. Pure: statsUpdate reads its
// argument and returns a new object.
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

// Every event of a name in the step's events list.
function countOf(events, name) {
  let n = 0;
  for (const event of events) if (event === name) n++;
  return n;
}

export function statsUpdate(stats, prev, next, input) {
  const events = Array.isArray(next && next.events) ? next.events : [];
  const prevTick = prev && typeof prev.tick === 'number' ? prev.tick : 0;
  const nextTick = next && typeof next.tick === 'number' ? next.tick : prevTick;
  const ticksGrown = nextTick - prevTick;

  // A move counts when the input gave a move, a tick passed, and the
  // player ended exactly one cell (up, down, left, or right) from where
  // it was.
  const gaveMove = Boolean(input) && Boolean(input.move);
  const prevPlayer = (prev && prev.player) || { x: 0, y: 0 };
  const nextPlayer = (next && next.player) || { x: 0, y: 0 };
  const dx = nextPlayer.x - prevPlayer.x;
  const dy = nextPlayer.y - prevPlayer.y;
  const tookAStep =
    gaveMove && ticksGrown > 0 && Math.abs(dx) + Math.abs(dy) === 1;

  // What a merge carries is what this player carried when the step began.
  const merges = countOf(events, 'merge');
  const held = Array.isArray(prev && prev.carried) ? prev.carried.length : 0;

  return {
    ...stats,
    ticks: (stats.ticks || 0) + ticksGrown,
    moves: (stats.moves || 0) + (tookAStep ? 1 : 0),
    pickups: (stats.pickups || 0) + countOf(events, 'pickup'),
    merges: (stats.merges || 0) + merges,
    patchesMerged: (stats.patchesMerged || 0) + merges * held,
    bestMerge: Math.max(stats.bestMerge || 0, merges > 0 ? held : 0),
    hits: (stats.hits || 0) + countOf(events, 'hit'),
    drops: (stats.drops || 0) + countOf(events, 'drop'),
    conflicts: (stats.conflicts || 0) + countOf(events, 'conflict'),
    levels: (stats.levels || 0) + countOf(events, 'level') + countOf(events, 'won'),
  };
}

export function statsLines(stats) {
  const s = stats || {};
  return [
    `MOVES ${s.moves || 0}`,
    `MERGES ${s.merges || 0}`,
    `BEST ${s.bestMerge || 0}`,
    `HITS ${s.hits || 0}`,
    `LEVELS ${s.levels || 0}`,
  ];
}

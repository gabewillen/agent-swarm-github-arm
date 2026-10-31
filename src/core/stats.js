// Run statistics (DESIGN.md §22).
//
// statsUpdate reads one step, prev to next, and returns new stats; it
// never changes its argument or the states. Pure.

// The counter, all zero.
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

// How many times name appears in events (a missing list has none).
function count(events, name) {
  let n = 0;
  if (Array.isArray(events)) {
    for (const event of events) if (event === name) n++;
  }
  return n;
}

// The counter to build on, for a field that must be a finite number.
function have(stats, key) {
  const value = stats?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function statsUpdate(stats, prev, next, input) {
  const out = { ...stats };

  const tickDelta = have(next, 'tick') - have(prev, 'tick');
  out.ticks = have(stats, 'ticks') + tickDelta;

  // moves: input.move was given, a tick passed, and the player ended
  // exactly one cell from where it was.
  const move = input?.move;
  const from = prev?.player;
  const to = next?.player;
  if (move && tickDelta > 0 && from && to &&
      Number.isFinite(from.x) && Number.isFinite(from.y) &&
      Number.isFinite(to.x) && Number.isFinite(to.y) &&
      Math.abs(to.x - from.x) + Math.abs(to.y - from.y) === 1) {
    out.moves = have(stats, 'moves') + 1;
  }

  out.pickups = have(stats, 'pickups') + count(next?.events, 'pickup');
  out.merges = have(stats, 'merges') + count(next?.events, 'merge');
  out.hits = have(stats, 'hits') + count(next?.events, 'hit');
  out.drops = have(stats, 'drops') + count(next?.events, 'drop');
  out.conflicts = have(stats, 'conflicts') + count(next?.events, 'conflict');

  const merges = count(next?.events, 'merge');
  if (merges > 0) {
    const carried = prev?.carried;
    const n = Array.isArray(carried) ? carried.length : 0;
    out.patchesMerged = have(stats, 'patchesMerged') + n * merges;
    out.bestMerge = Math.max(have(stats, 'bestMerge'), n);
  }

  out.levels = have(stats, 'levels') + count(next?.events, 'level') + count(next?.events, 'won');

  return out;
}

// The statistics as HUD lines.
export function statsLines(stats) {
  return [
    `MOVES ${have(stats, 'moves')}`,
    `MERGES ${have(stats, 'merges')}`,
    `BEST ${have(stats, 'bestMerge')}`,
    `HITS ${have(stats, 'hits')}`,
    `LEVELS ${have(stats, 'levels')}`,
  ];
}

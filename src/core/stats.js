// Quorum Run: run statistics (DESIGN.md §22).
//
// A stats object is a running tally: ticks, moves, pickups, merges, the
// patches those merges carried and the biggest single merge, hits, drops,
// conflicts, and levels entered or shipped. statsUpdate folds one step
// into it and never changes the stats, the states, or the input it is
// given.

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
  const out = { ...stats };

  const events =
    next !== null && typeof next === 'object' && Array.isArray(next.events) ? next.events : [];
  const count = (name) => events.reduce((n, e) => n + (e === name ? 1 : 0), 0);

  // Ticks: the step's growth of the global tick counter; a pause or a
  // step outside play passes no tick and adds none.
  const delta =
    ((next !== null && typeof next === 'object' ? next.tick : 0) ?? 0) -
    ((prev !== null && typeof prev === 'object' ? prev.tick : 0) ?? 0);
  out.ticks += delta;

  // A move counts when a move was given, a tick passed, and the player
  // ended exactly one cell (one up, down, left, or right step) from where
  // it was. A blocked step, a pause, a restart after a hit, and a level
  // load do not move the player like that.
  const moveGiven = input !== null && typeof input === 'object' && input.move != null;
  const from = prev !== null && typeof prev === 'object' ? prev.player : null;
  const to = next !== null && typeof next === 'object' ? next.player : null;
  const oneCell =
    from !== null && to !== null && moveDistance(from, to) === 1;
  if (moveGiven && delta > 0 && oneCell) out.moves += 1;

  // Events, by how often each happened.
  const pickups = count('pickup');
  const merges = count('merge');
  out.pickups += pickups;
  out.merges += merges;
  out.hits += count('hit');
  out.drops += count('drop');
  out.conflicts += count('conflict');

  // A merge ships the patches the player carried into it.
  if (merges > 0) {
    const held = carriedCount(prev);
    out.patchesMerged += held * merges;
    if (held > out.bestMerge) out.bestMerge = held;
  }

  // A level arrives on a level load and on winning the last one.
  out.levels += count('level') + count('won');
  return out;
}

function moveDistance(from, to) {
  if (from === null || typeof from !== 'object' || to === null || typeof to !== 'object') {
    return Infinity;
  }
  if (!Number.isInteger(from.x) || !Number.isInteger(from.y)) return Infinity;
  if (!Number.isInteger(to.x) || !Number.isInteger(to.y)) return Infinity;
  return Math.abs(to.x - from.x) + Math.abs(to.y - from.y);
}

function carriedCount(state) {
  if (state === null || typeof state !== 'object' || !Array.isArray(state.carried)) return 0;
  return state.carried.length;
}

export function statsLines(stats) {
  const s = stats ?? {};
  return [
    `MOVES ${s.moves ?? 0}`,
    `MERGES ${s.merges ?? 0}`,
    `BEST ${s.bestMerge ?? 0}`,
    `HITS ${s.hits ?? 0}`,
    `LEVELS ${s.levels ?? 0}`,
  ];
}

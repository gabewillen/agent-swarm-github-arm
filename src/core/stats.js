// Run statistics (DESIGN.md §22).
//
// statsInit() returns the zeroed counters of a run; statsUpdate(stats,
// prev, next, input) returns new statistics for one step, read from the
// step's two states and its input; statsLines(stats) renders the lines
// the stats overlay shows. Pure: no argument is ever changed.

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

// How many times `name` appears in an events list (§7). A missing or
// malformed list counts none.
function count(events, name) {
  let n = 0;
  if (Array.isArray(events)) for (const event of events) if (event === name) n += 1;
  return n;
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export function statsUpdate(stats, prev, next, input) {
  const before = stats && typeof stats === 'object' ? stats : statsInit();
  const from = prev && typeof prev === 'object' ? prev : {};
  const to = next && typeof next === 'object' ? next : {};
  const events = Array.isArray(to.events) ? to.events : [];

  // §6 step 4: ticks grow while playing and unpaused, never otherwise.
  const tickDelta = num(to.tick) - num(from.tick);

  // A move: the input gave a move, a tick passed, and the player ended
  // exactly one cell from where it was.
  const gaveMove = input !== null && typeof input === 'object' && typeof input.move === 'string';
  const ONE_CELL = (to.player && from.player)
    ? Math.abs(num(to.player.x) - num(from.player.x)) + Math.abs(num(to.player.y) - num(from.player.y))
    : 0;
  const movedOne = gaveMove && tickDelta > 0 && ONE_CELL === 1;

  const oldTicks = num(before.ticks);
  const oldMoves = num(before.moves);
  const oldPickups = num(before.pickups);
  const oldMerges = num(before.merges);
  const oldPatchesMerged = num(before.patchesMerged);
  const oldBestMerge = num(before.bestMerge);
  const oldHits = num(before.hits);
  const oldDrops = num(before.drops);
  const oldConflicts = num(before.conflicts);
  const oldLevels = num(before.levels);

  const newlyCarried = Array.isArray(from.carried) ? from.carried.length : 0;
  const merged = count(events, 'merge');

  return {
    ...before,
    ticks: oldTicks + tickDelta,
    moves: oldMoves + (movedOne ? 1 : 0),
    pickups: oldPickups + count(events, 'pickup'),
    merges: oldMerges + merged,
    patchesMerged: oldPatchesMerged + (merged > 0 ? newlyCarried : 0),
    bestMerge: merged > 0 ? Math.max(oldBestMerge, newlyCarried) : oldBestMerge,
    hits: oldHits + count(events, 'hit'),
    drops: oldDrops + count(events, 'drop'),
    conflicts: oldConflicts + count(events, 'conflict'),
    levels: oldLevels + count(events, 'level') + count(events, 'won'),
  };
}

export function statsLines(stats) {
  const s = stats && typeof stats === 'object' ? stats : {};
  return [
    `MOVES ${s.moves}`,
    `MERGES ${s.merges}`,
    `BEST ${s.bestMerge}`,
    `HITS ${s.hits}`,
    `LEVELS ${s.levels}`,
  ];
}

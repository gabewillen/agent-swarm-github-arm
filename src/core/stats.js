// §22 Run statistics. `statsInit` is the zero table, `statsUpdate(stats,
// prev, next, input)` folds one step (prev to next, `next.events` its
// events) into new stats and never changes its argument, and `statsLines`
// renders the five lines the UI shows after a run.
//
// No imports: the counts come from the states and the input alone.

export function statsInit() {
  return {
    ticks: 0, moves: 0, pickups: 0, merges: 0, patchesMerged: 0,
    bestMerge: 0, hits: 0, drops: 0, conflicts: 0, levels: 0,
  };
}

export function statsUpdate(stats, prev, next, input) {
  const base = { ...statsInit(), ...(stats && typeof stats === 'object' ? stats : {}) };
  const events = next && Array.isArray(next.events) ? next.events : [];
  const count = (code) => events.filter((e) => e === code).length;

  // How many ticks this step advanced (a pause or an ended game makes none).
  const ended = next && Number.isFinite(next.tick) ? next.tick : 0;
  const began = prev && Number.isFinite(prev.tick) ? prev.tick : 0;
  const ticked = ended - began;

  // A move was given, a tick passed, and the player ended exactly one cell
  // from where it was: Manhattan distance 1 means it went somewhere.
  const players = next && prev && next.player && prev.player;
  let moved = 0;
  if (input && input.move && ticked > 0 && players) {
    const dx = Math.abs(next.player.x - prev.player.x);
    const dy = Math.abs(next.player.y - prev.player.y);
    if (dx + dy === 1) moved = 1;
  }

  const merges = count('merge');
  const carriedLen = prev && Array.isArray(prev.carried) ? prev.carried.length : 0;

  return {
    ...base,
    ticks: base.ticks + ticked,
    moves: base.moves + moved,
    pickups: base.pickups + count('pickup'),
    merges: base.merges + merges,
    patchesMerged: base.patchesMerged + merges * carriedLen,
    bestMerge: merges > 0 ? Math.max(base.bestMerge, carriedLen) : base.bestMerge,
    hits: base.hits + count('hit'),
    drops: base.drops + count('drop'),
    conflicts: base.conflicts + count('conflict'),
    levels: base.levels + count('level') + count('won'),
  };
}

export function statsLines(stats) {
  const s = stats && typeof stats === 'object' ? stats : statsInit();
  return [
    `MOVES ${s.moves ?? 0}`,
    `MERGES ${s.merges ?? 0}`,
    `BEST ${s.bestMerge ?? 0}`,
    `HITS ${s.hits ?? 0}`,
    `LEVELS ${s.levels ?? 0}`,
  ];
}

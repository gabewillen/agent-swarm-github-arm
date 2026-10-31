// Run statistics (DESIGN.md §22). Pure functions over plain state
// objects: `statsUpdate` counts what happened in one step and returns
// the new stats, never changing its argument or the states.

export function statsInit() {
  return {
    ticks: 0, moves: 0, pickups: 0, merges: 0, patchesMerged: 0,
    bestMerge: 0, hits: 0, drops: 0, conflicts: 0, levels: 0,
  };
}

// How many of an event name an events list holds.
function countEvents(events, name) {
  let n = 0;
  if (Array.isArray(events)) {
    for (const e of events) if (e === name) n += 1;
  }
  return n;
}

// A player position as [x, y], null when it is not plain numbers.
function position(player) {
  if (player && Number.isFinite(player.x) && Number.isFinite(player.y)) {
    return [player.x, player.y];
  }
  return null;
}

export function statsUpdate(stats, prev, next, input) {
  const events = next && Array.isArray(next.events) ? next.events : [];

  // Ticks: by how much the tick grew in the step.
  const nextTick = next && Number.isFinite(next.tick) ? next.tick : 0;
  const prevTick = prev && Number.isFinite(prev.tick) ? prev.tick : 0;
  const dTick = nextTick - prevTick;

  // Moves: input.move was given, a tick passed, and the player ended
  // exactly one cell from where it was.
  const moveGiven = !!input && !!input.move;
  const from = position(prev && prev.player);
  const to = position(next && next.player);
  const oneCell = from !== null && to !== null
    && Math.abs(to[0] - from[0]) + Math.abs(to[1] - from[1]) === 1;
  const moves = moveGiven && dTick === 1 && oneCell ? 1 : 0;

  // Merges: patchesMerged by prev.carried.length per merge, and
  // bestMerge at least that.
  const mergeCount = countEvents(events, 'merge');
  const carried = prev && Array.isArray(prev.carried) ? prev.carried : [];

  return {
    ticks: (stats.ticks || 0) + dTick,
    moves: (stats.moves || 0) + moves,
    pickups: (stats.pickups || 0) + countEvents(events, 'pickup'),
    merges: (stats.merges || 0) + mergeCount,
    patchesMerged: (stats.patchesMerged || 0)
      + (mergeCount > 0 ? carried.length * mergeCount : 0),
    bestMerge: Math.max(stats.bestMerge || 0, mergeCount > 0 ? carried.length : 0),
    hits: (stats.hits || 0) + countEvents(events, 'hit'),
    drops: (stats.drops || 0) + countEvents(events, 'drop'),
    conflicts: (stats.conflicts || 0) + countEvents(events, 'conflict'),
    levels: (stats.levels || 0) + countEvents(events, 'level') + countEvents(events, 'won'),
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

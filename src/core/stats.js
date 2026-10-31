// Run statistics (DESIGN.md §22).
// `statsUpdate` folds one step into the counters; pure, it never changes
// any of its arguments. `statsLines` renders the counters for the HUD.

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

function countEvents(events, name) {
  let n = 0;
  for (const e of events) if (e === name) n += 1;
  return n;
}

export function statsUpdate(stats, prev, next, input) {
  const s = { ...(stats || statsInit()) };
  const prevTick = (prev && typeof prev === 'object') ? prev.tick : 0;
  const nextTick = (next && typeof next === 'object') ? next.tick : 0;
  const deltaTicks = nextTick - prevTick;

  // Ticks grow by the step's tick delta, whatever the input did.
  s.ticks += Math.max(0, deltaTicks);

  const events = (next && Array.isArray(next.events)) ? next.events : [];

  // A move counts when a move was given, a tick passed, and the player
  // ended exactly one cell (Manhattan) from where it was.
  const prevPlayer = (prev && typeof prev === 'object' && prev.player) ? prev.player : null;
  const nextPlayer = (next && typeof next === 'object' && next.player) ? next.player : null;
  if (input && input.move && deltaTicks > 0 && prevPlayer && nextPlayer) {
    const dist = Math.abs(nextPlayer.x - prevPlayer.x) + Math.abs(nextPlayer.y - prevPlayer.y);
    if (dist === 1) s.moves += 1;
  }

  // Events count by how often they happened.
  s.pickups += countEvents(events, 'pickup');
  s.hits += countEvents(events, 'hit');
  s.drops += countEvents(events, 'drop');
  s.conflicts += countEvents(events, 'conflict');
  s.levels += countEvents(events, 'level') + countEvents(events, 'won');

  // A merge counts the patches carried before it.
  const carried = (prev && Array.isArray(prev.carried)) ? prev.carried : [];
  const merges = countEvents(events, 'merge');
  if (merges > 0) {
    s.merges += merges;
    const merged = carried.length * merges;
    s.patchesMerged += merged;
    if (carried.length > s.bestMerge) s.bestMerge = carried.length;
  }

  return s;
}

export function statsLines(stats) {
  const st = (stats && typeof stats === 'object') ? stats : statsInit();
  return [
    `MOVES ${st.moves}`,
    `MERGES ${st.merges}`,
    `BEST ${st.bestMerge}`,
    `HITS ${st.hits}`,
    `LEVELS ${st.levels}`,
  ];
}

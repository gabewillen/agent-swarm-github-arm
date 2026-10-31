// Run statistics (DESIGN.md §22). Pure accounting over one step at a time:
// `statsUpdate(stats, prev, next, input)` reads the step that took `prev` to
// `next`, keeps every field it does not change, and never changes any
// argument. All of the counters are numbers so the shape stays plain JSON.

export function statsInit() {
  return {
    ticks: 0, moves: 0, pickups: 0, merges: 0, patchesMerged: 0,
    bestMerge: 0, hits: 0, drops: 0, conflicts: 0, levels: 0,
  };
}

// How many times `ev` appears in `next.events` (0 when there are none).
function count(events, ev) {
  return Array.isArray(events) ? events.filter((e) => e === ev).length : 0;
}

// A number to add onto, or 0 when it is missing or not a number.
function num(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

// The starting point for one more step's accounting: a copy of `stats` with
// every counter a number.
function onto(stats) {
  return {
    ticks: num(stats?.ticks), moves: num(stats?.moves), pickups: num(stats?.pickups),
    merges: num(stats?.merges), patchesMerged: num(stats?.patchesMerged),
    bestMerge: num(stats?.bestMerge), hits: num(stats?.hits), drops: num(stats?.drops),
    conflicts: num(stats?.conflicts), levels: num(stats?.levels),
  };
}

export function statsUpdate(stats, prev, next, input) {
  const out = onto(stats);
  const events = next?.events;

  out.ticks += num(next?.tick) - num(prev?.tick);

  // A move counts when the input moved, a tick passed, and the player ended
  // exactly one cell from where it was.
  if (typeof input?.move === 'string') {
    const dx = num(next?.player?.x) - num(prev?.player?.x);
    const dy = num(next?.player?.y) - num(prev?.player?.y);
    if (out.ticks > 0 && Math.abs(dx) + Math.abs(dy) === 1) out.moves += 1;
  }

  out.pickups += count(events, 'pickup');
  out.merges += count(events, 'merge');
  out.hits += count(events, 'hit');
  out.drops += count(events, 'drop');
  out.conflicts += count(events, 'conflict');
  out.levels += count(events, 'level') + count(events, 'won');

  if (count(events, 'merge') > 0) {
    const n = Array.isArray(prev?.carried) ? prev.carried.length : 0;
    out.patchesMerged += n;
    if (n > out.bestMerge) out.bestMerge = n;
  }

  return out;
}

export function statsLines(stats) {
  return [
    `MOVES ${num(stats?.moves)}`,
    `MERGES ${num(stats?.merges)}`,
    `BEST ${num(stats?.bestMerge)}`,
    `HITS ${num(stats?.hits)}`,
    `LEVELS ${num(stats?.levels)}`,
  ];
}

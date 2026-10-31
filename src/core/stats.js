// Quorum Run — run statistics (DESIGN.md §22).
// statsInit() is the all-zero counter block; statsUpdate() reads one step
// (prev to next) and returns new statistics; nothing here changes an
// argument, and statsUpdate's result is a fresh object every time.

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

const isObj = (o) => !!o && typeof o === 'object';

export function statsUpdate(stats, prev, next, input) {
  // Start from the nine fields, whatever the caller's statistics hold.
  const out = { ...statsInit(), ...(isObj(stats) ? stats : {}) };

  const prevTick = prev && typeof prev.tick === 'number' ? prev.tick : 0;
  const nextTick = next && typeof next.tick === 'number' ? next.tick : 0;
  const ticks = nextTick - prevTick;
  out.ticks += ticks;

  // A move: the input carried a move, a tick passed, and the player ended
  // exactly one cell (Manhattan) from where it was.
  const move = input && input.move;
  const pp = isObj(prev) && isObj(prev.player) ? prev.player : null;
  const np = isObj(next) && isObj(next.player) ? next.player : null;
  if (
    move && ticks > 0 && pp && np &&
    typeof pp.x === 'number' && typeof pp.y === 'number' &&
    typeof np.x === 'number' && typeof np.y === 'number'
  ) {
    const dx = np.x - pp.x;
    const dy = np.y - pp.y;
    if (Math.abs(dx) + Math.abs(dy) === 1) out.moves += 1;
  }

  const events = isObj(next) && Array.isArray(next.events) ? next.events : [];
  const count = (name) => events.filter((e) => e === name).length;

  out.pickups += count('pickup');

  const merges = count('merge');
  out.merges += merges;
  if (merges > 0) {
    const carried = isObj(prev) && Array.isArray(prev.carried) ? prev.carried : null;
    if (carried && carried.length > 0) {
      const n = carried.length;
      out.patchesMerged += n * merges;
      if (n > out.bestMerge) out.bestMerge = n;
    }
  }

  out.hits += count('hit');
  out.drops += count('drop');
  out.conflicts += count('conflict');
  out.levels += count('level') + count('won');

  return out;
}

export function statsLines(stats) {
  const s = isObj(stats) ? stats : {};
  return [
    `MOVES ${s.moves}`,
    `MERGES ${s.merges}`,
    `BEST ${s.bestMerge}`,
    `HITS ${s.hits}`,
    `LEVELS ${s.levels}`,
  ];
}

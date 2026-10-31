// §22: run statistics. statsInit() starts every counter at zero and
// statsUpdate(stats, prev, next, input) folds one step into them, returning
// new stats and changing neither the stats, prev, nor next.
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
  const p = prev && typeof prev === 'object' ? prev : {};
  const n = next && typeof next === 'object' ? next : {};
  const events = Array.isArray(n.events) ? n.events : [];
  const countOf = (name) => {
    let seen = 0;
    for (const e of events) if (e === name) seen++;
    return seen;
  };

  // Ticks grow by however many the step took (a pause takes none).
  const tickDelta =
    (typeof n.tick === 'number' ? n.tick : 0) -
    (typeof p.tick === 'number' ? p.tick : 0);
  out.ticks += tickDelta;

  // A move: an input move was given, a tick passed, and the player ended
  // exactly one cell (one axial step) from where it was — a blocked move,
  // a pause, or a jump back to the start is not one.
  const fromHere = p.player && typeof p.player === 'object' ? p.player : {};
  const toHere = n.player && typeof n.player === 'object' ? n.player : {};
  const oneCell =
    Math.abs(toHere.x - fromHere.x) + Math.abs(toHere.y - fromHere.y) === 1;
  if (input && input.move != null && tickDelta > 0 && oneCell) out.moves += 1;

  out.pickups += countOf('pickup');
  out.merges += countOf('merge');
  out.hits += countOf('hit');
  out.drops += countOf('drop');
  out.conflicts += countOf('conflict');

  // A merge commits the whole hand: every merged patch counts, and the
  // best single merge is at least the size of the hand that made it.
  const merged = countOf('merge');
  if (merged > 0) {
    const hand = Array.isArray(p.carried) ? p.carried.length : 0;
    out.patchesMerged += merged * hand;
    out.bestMerge = Math.max(out.bestMerge, hand);
  }

  out.levels += countOf('level') + countOf('won');
  return out;
}

export function statsLines(stats) {
  const s = stats && typeof stats === 'object' ? stats : {};
  return [
    `MOVES ${s.moves ?? 0}`,
    `MERGES ${s.merges ?? 0}`,
    `BEST ${s.bestMerge ?? 0}`,
    `HITS ${s.hits ?? 0}`,
    `LEVELS ${s.levels ?? 0}`,
  ];
}

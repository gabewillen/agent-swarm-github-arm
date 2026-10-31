// Run statistics (DESIGN.md §22): counters updated step by step from the
// states `step` returns. Pure: statsUpdate reads prev and next and the
// step's input and never changes its arguments.

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

// The game tick a state holds, 0 when it has none.
function tickOf(state) {
  return state && Number.isFinite(state.tick) ? state.tick : 0;
}

// New stats for one step, prev to next, taken with the step's input.
export function statsUpdate(stats, prev, next, input) {
  const out = { ...statsInit(), ...stats };

  // Ticks grow by the tick delta of the step.
  const deltaTicks = tickOf(next) - tickOf(prev);
  out.ticks += deltaTicks;

  // A move: the input gave one, a tick passed, and the player ended
  // exactly one cell from where it was. A blocked move covers no cell, a
  // pause grows no tick, and a respawn lands far away, so only a real
  // step of the player counts.
  if (input && input.move && deltaTicks > 0) {
    const a = prev && prev.player;
    const b = next && next.player;
    if (a && b && Number.isFinite(a.x) && Number.isFinite(a.y) &&
        Number.isFinite(b.x) && Number.isFinite(b.y) &&
        Math.abs(b.x - a.x) + Math.abs(b.y - a.y) === 1) {
      out.moves += 1;
    }
  }

  // Events: the counters grow by the count of each event.
  const events = next && Array.isArray(next.events) ? next.events : [];
  const count = (name) => {
    let n = 0;
    for (const event of events) if (event === name) n++;
    return n;
  };
  out.pickups += count('pickup');
  out.merges += count('merge');
  out.hits += count('hit');
  out.drops += count('drop');
  out.conflicts += count('conflict');
  out.levels += count('level') + count('won');

  // A merge carries and merges the patches prev.carried held.
  const carried = prev && Array.isArray(prev.carried) ? prev.carried.length : 0;
  const merges = count('merge');
  if (merges > 0 && carried > 0) {
    out.patchesMerged += carried * merges;
    out.bestMerge = Math.max(out.bestMerge, carried);
  }

  return out;
}

// The stats panel: one line per counter §22 lists.
export function statsLines(stats) {
  const s = stats || {};
  return [
    `MOVES ${s.moves ?? 0}`,
    `MERGES ${s.merges ?? 0}`,
    `BEST ${s.bestMerge ?? 0}`,
    `HITS ${s.hits ?? 0}`,
    `LEVELS ${s.levels ?? 0}`,
  ];
}

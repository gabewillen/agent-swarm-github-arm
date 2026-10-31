// Quorum Run run statistics (DESIGN.md §22).
//
// Pure counters over the core's steps: statsInit makes a zeroed table,
// statsUpdate folds one step (prev to next) into it, and statsLines
// renders five of the counters as text. None of them change their
// arguments.

const KEYS = ['ticks', 'moves', 'pickups', 'merges', 'patchesMerged', 'bestMerge', 'hits', 'drops', 'conflicts', 'levels'];

// A fresh stats table, every counter at zero.
export function statsInit() {
  return {
    ticks: 0, moves: 0, pickups: 0, merges: 0, patchesMerged: 0,
    bestMerge: 0, hits: 0, drops: 0, conflicts: 0, levels: 0,
  };
}

// A point's integer coordinates, or null when it has none.
function pointOf(p) {
  if (!p || typeof p !== 'object') return null;
  const { x, y } = p;
  if (!Number.isInteger(x) || !Number.isInteger(y)) return null;
  return { x, y };
}

// How many times an event name appears in the step's events.
function countOf(events, name) {
  let n = 0;
  for (const event of events) {
    if (event === name) n += 1;
  }
  return n;
}

// The stats after one step (prev to next, input as given), returned as
// a new table: the argument holds, and prev and next are only read.
export function statsUpdate(stats, prev, next, input) {
  const out = { ...statsInit() };
  const prior = stats && typeof stats === 'object' ? stats : {};
  for (const key of KEYS) {
    const value = prior[key];
    if (typeof value === 'number' && Number.isFinite(value)) out[key] = value;
  }

  const events = next && typeof next === 'object' && Array.isArray(next.events) ? next.events : [];
  const prevTick = prev && typeof prev === 'object' && Number.isFinite(prev.tick) ? prev.tick : 0;
  const nextTick = next && typeof next === 'object' && Number.isFinite(next.tick) ? next.tick : 0;
  const tickDelta = nextTick - prevTick;
  out.ticks = out.ticks + tickDelta;

  // A move counts when input.move was given, a tick passed, and the
  // player ended exactly one cell (Manhattan) from where it was.
  const from = prev ? pointOf(prev.player) : null;
  const to = next ? pointOf(next.player) : null;
  const oneCell = from !== null && to !== null && Math.abs(to.x - from.x) + Math.abs(to.y - from.y) === 1;
  if (input && input.move && tickDelta > 0 && oneCell) out.moves += 1;

  // Event counters, one per event.
  out.pickups += countOf(events, 'pickup');
  out.merges += countOf(events, 'merge');
  out.hits += countOf(events, 'hit');
  out.drops += countOf(events, 'drop');
  out.conflicts += countOf(events, 'conflict');

  // Every merge merges the patches carried at the step's start.
  for (const event of events) {
    if (event === 'merge') {
      const n = prev && Array.isArray(prev.carried) ? prev.carried.length : 0;
      out.patchesMerged += n;
      out.bestMerge = Math.max(out.bestMerge, n);
    }
  }

  // A shipped level: either the next loads or the game is won.
  out.levels += countOf(events, 'level') + countOf(events, 'won');

  return out;
}

// The stats as HUD-style lines of text.
export function statsLines(stats) {
  const s = stats && typeof stats === 'object' ? stats : {};
  const num = (value) => (typeof value === 'number' && Number.isFinite(value) ? String(value) : '0');
  return [
    `MOVES ${num(s.moves)}`,
    `MERGES ${num(s.merges)}`,
    `BEST ${num(s.bestMerge)}`,
    `HITS ${num(s.hits)}`,
    `LEVELS ${num(s.levels)}`,
  ];
}

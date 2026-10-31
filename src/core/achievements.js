// Achievements (DESIGN.md §21): the fixed list of ten achievements and the
// checker that decides, from one step to the next, which are newly earned.
// Pure data in, pure data out: no state is changed, nothing is imported.

// The ten achievements, in the order §21 fixes.
export const ACHIEVEMENTS = [
  { id: 'first_pickup', title: 'First Pickup', description: 'Pick up a patch for the first time.' },
  { id: 'first_merge', title: 'First Merge', description: 'Merge a patch on a merge pad for the first time.' },
  { id: 'full_hands', title: 'Full Hands', description: 'Merge three patches at once.' },
  { id: 'monochrome', title: 'Monochrome', description: 'Merge three patches of one colour at once.' },
  { id: 'quorum', title: 'Quorum', description: 'Reach a level\'s quorum of merged patches.' },
  { id: 'shipped', title: 'Shipped', description: 'Ship a level through its exit.' },
  { id: 'flawless', title: 'Flawless', description: 'Ship a level, or win, with all three lives kept.' },
  { id: 'conflict', title: 'Standoff', description: 'Watch two drifts leave a conflict.' },
  { id: 'survivor', title: 'Survivor', description: 'Reach the fourth level.' },
  { id: 'champion', title: 'Champion', description: 'Win the game.' },
];

// The lives a game starts with (§2 START_LIVES), which `flawless` compares
// against. Kept local so this module loads on its own.
const START_LIVES = 3;

// Which achievements one step earns, keyed by id. `next.events` are that
// step's events; `full_hands` and `monochrome` read the hands before the
// merge, `prev.carried` (§21).
function earned(prev, next) {
  const events = next.events || [];
  const merge = events.includes('merge');
  const levelEvent = events.includes('level');
  const won = events.includes('won');
  const shipped = levelEvent || won; // winning ships the last level too
  const carried = prev.carried || [];
  return {
    first_pickup: events.includes('pickup'),
    first_merge: merge,
    full_hands: merge && carried.length >= 3,
    monochrome: merge && carried.length >= 3 && carried.every((c) => c === carried[0]),
    quorum: events.includes('quorum'),
    shipped,
    flawless: shipped && next.lives === START_LIVES,
    conflict: events.includes('conflict'),
    survivor: shipped && next.levelIndex >= 3,
    champion: won,
  };
}

// `checkAchievements(prev, next, unlocked)` returns the ids of the
// achievements the step from `prev` to `next` newly earns, skipping every
// id already in `unlocked`, in `ACHIEVEMENTS` order.
export function checkAchievements(prev, next, unlocked) {
  const got = earned(prev, next);
  const have = new Set(Array.isArray(unlocked) ? unlocked : []);
  return ACHIEVEMENTS.filter((a) => got[a.id] && !have.has(a.id)).map((a) => a.id);
}

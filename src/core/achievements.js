// Achievements (DESIGN.md §21): the fixed list and the checker that reads
// one step of play (the state before and after a `step` call) and reports
// the ids it newly earns. Pure data and pure function, no imports.

// The two §2 constants this section leans on. They are pinned by the
// design, and this leaf module keeps them local so it loads on its own.
const START_LIVES = 3; // §2: lives at `init`; flawless needs all of them
const CARRY_MAX = 3; // §2: patches the player can carry at once

// The fourth level's index is what `survivor` watches for.
const SURVIVOR_INDEX = 3;

export const ACHIEVEMENTS = [
  { id: 'first_pickup', title: 'First Pickup', description: 'Pick up your first patch.' },
  { id: 'first_merge', title: 'First Merge', description: 'Merge patches on a merge pad.' },
  { id: 'full_hands', title: 'Full Hands', description: 'Merge ' + CARRY_MAX + ' patches at once.' },
  { id: 'monochrome', title: 'Monochrome', description: 'Merge ' + CARRY_MAX + ' patches of one colour at once.' },
  { id: 'quorum', title: 'Quorum', description: "Reach a level's quorum of merged patches." },
  { id: 'shipped', title: 'Shipped', description: 'Ship a level through its exit.' },
  { id: 'flawless', title: 'Flawless', description: 'Ship a level, or win, with all lives left.' },
  { id: 'conflict', title: 'Conflict', description: 'See two drifts collide into a block.' },
  { id: 'survivor', title: 'Survivor', description: 'Reach the fourth level.' },
  { id: 'champion', title: 'Champion', description: 'Win the game.' },
];

const has = (events, name) => Array.isArray(events) && events.includes(name);

// One predicate per id, in ACHIEVEMENTS order; each reads the one step
// `prev` to `next` (next.events are that step's events). `full_hands` and
// `monochrome` read prev.carried, the hand being carried into the merge.
const earns = (prev, next) => {
  const events = next && next.events ? next.events : [];
  const carried = prev && Array.isArray(prev.carried) ? prev.carried : [];
  const shipped = has(events, 'level') || has(events, 'won');
  const bigMerge = has(events, 'merge') && carried.length >= CARRY_MAX;
  const oneColour = bigMerge && carried.every((c) => c === carried[0]);
  const prevIndex = prev && Number.isInteger(prev.levelIndex) ? prev.levelIndex : 0;
  const nextIndex = next && Number.isInteger(next.levelIndex) ? next.levelIndex : 0;
  return {
    first_pickup: () => has(events, 'pickup'),
    first_merge: () => has(events, 'merge'),
    full_hands: () => bigMerge,
    monochrome: () => oneColour,
    quorum: () => has(events, 'quorum'),
    shipped: () => shipped,
    flawless: () => shipped && next.lives === START_LIVES,
    conflict: () => has(events, 'conflict'),
    survivor: () => nextIndex >= SURVIVOR_INDEX && prevIndex < SURVIVOR_INDEX,
    champion: () => has(events, 'won'),
  };
};

export function checkAchievements(prev, next, unlocked) {
  const had = Array.isArray(unlocked) ? unlocked : [];
  const test = earns(prev, next);
  const earned = [];
  for (const a of ACHIEVEMENTS) {
    if (!had.includes(a.id) && test[a.id]()) earned.push(a.id);
  }
  return earned;
}

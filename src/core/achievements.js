// §21 — Achievements. `ACHIEVEMENTS` lists every achievement in the order
// ids are earned in; `checkAchievements(prev, next, unlocked)` reads one
// step and returns the ids it newly earns that are not in `unlocked`,
// in `ACHIEVEMENTS` order.
//
// This module is pure and dependency-free: the numbers below are the
// values DESIGN.md fixes for `CARRY_MAX` (3) and `START_LIVES` (3).

export const ACHIEVEMENTS = [
  { id: 'first_pickup', title: 'First pickup', description: 'Pick up your first patch.' },
  { id: 'first_merge', title: 'First merge', description: 'Merge your first patch on a merge pad.' },
  { id: 'full_hands', title: 'Full hands', description: 'Merge three patches at once.' },
  { id: 'monochrome', title: 'Monochrome', description: 'Merge three patches of one colour at once.' },
  { id: 'quorum', title: 'Quorum', description: 'Reach a level quorum of merged patches.' },
  { id: 'shipped', title: 'Shipped', description: 'Ship a level.' },
  { id: 'flawless', title: 'Flawless', description: 'Ship a level, or win, with all your lives.' },
  { id: 'conflict', title: 'Conflict zone', description: 'See a drift conflict.' },
  { id: 'survivor', title: 'Survivor', description: 'Reach the fourth level.' },
  { id: 'champion', title: 'Champion', description: 'Win the game.' },
];

// One test per id, in `ACHIEVEMENTS` order. Each takes the step it reads:
// `events`, a `has(event)` helper, the hand before the merge (`hand`),
// whether every patch in it had one colour (`monochromeHand`), the shipped
// and winning flags, and the next state itself.
const earns = {
  first_pickup: ({ has }) => has('pickup'),
  first_merge: ({ has }) => has('merge'),
  full_hands: ({ has, hand }) => has('merge') && hand >= 3,
  monochrome: ({ has, hand, monoHand }) => has('merge') && hand >= 3 && monoHand,
  quorum: ({ has }) => has('quorum'),
  shipped: ({ shipped }) => shipped,
  flawless: ({ shipped, next }) => shipped && next.lives === 3,
  conflict: ({ has }) => has('conflict'),
  survivor: ({ shipped, next }) => shipped && (next.levelIndex >>> 0) >= 3,
  champion: ({ won }) => won,
};

export function checkAchievements(prev, next, unlocked) {
  if (!next || typeof next !== 'object') return [];
  const events = Array.isArray(next.events) ? next.events : [];
  const has = (event) => events.includes(event);
  const carried = prev && Array.isArray(prev.carried) ? prev.carried : [];
  const hand = carried.length;
  const monoHand = hand > 0 && carried.every((c) => c === carried[0]);
  const won = has('won');
  const shipped = has('level') || won;
  const context = { events, has, hand, monoHand, shipped, won, next };
  const earned = [];
  for (const { id } of ACHIEVEMENTS) {
    if (Array.isArray(unlocked) && unlocked.includes(id)) continue;
    if (earns[id](context)) earned.push(id);
  }
  return earned;
}

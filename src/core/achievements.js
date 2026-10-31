// Achievements (DESIGN.md §21).
// `checkAchievements(prev, next, unlocked)` reads one step from `prev` to
// `next` (`next.events` are that step's events) and returns the ids it newly
// earns that are not in the array `unlocked`, in `ACHIEVEMENTS` order.
// For full_hands and monochrome it reads `prev.carried`: `next` has already
// emptied the hands on a merge.

import { CARRY_MAX, START_LIVES } from './constants.js';

export const ACHIEVEMENTS = [
  { id: 'first_pickup', title: 'First Pickup', description: 'Pick up your first patch.' },
  { id: 'first_merge', title: 'First Merge', description: 'Merge patches on a merge pad.' },
  { id: 'full_hands', title: 'Full Hands', description: 'Merge three patches at once.' },
  { id: 'monochrome', title: 'Monochrome', description: 'Merge three patches of one colour at once.' },
  { id: 'quorum', title: 'Quorum', description: "Reach a level's quorum." },
  { id: 'shipped', title: 'Shipped', description: 'Ship a level through its exit.' },
  { id: 'flawless', title: 'Flawless', description: 'Ship a level without having lost a life.' },
  { id: 'conflict', title: 'Pile-Up', description: 'Watch two drifts collide.' },
  { id: 'survivor', title: 'Survivor', description: 'Reach the fourth level.' },
  { id: 'champion', title: 'Champion', description: 'Win the whole run.' },
];

// The ids one step from `prev` to `next` earns, ignoring what is unlocked.
// Shipping a level is a `level` event; winning is a `won` event, and both
// are shipping the level you were on (§6 step 9).
function earnedThisStep(prev, next) {
  const events = next.events || [];
  const ids = new Set();
  if (events.includes('pickup')) ids.add('first_pickup');
  if (events.includes('merge')) {
    ids.add('first_merge');
    const carried = prev.carried || [];
    if (carried.length >= CARRY_MAX) {
      ids.add('full_hands');
      if (carried.every((c) => c === carried[0])) ids.add('monochrome');
    }
  }
  if (events.includes('quorum')) ids.add('quorum');
  if (events.includes('conflict')) ids.add('conflict');
  if (events.includes('won')) ids.add('champion');
  const shipping = events.includes('level') || events.includes('won');
  if (shipping) {
    ids.add('shipped');
    if (next.lives === START_LIVES) ids.add('flawless');
    if (next.levelIndex >= 3) ids.add('survivor');
  }
  return ids;
}

export function checkAchievements(prev, next, unlocked) {
  const have = new Set(unlocked || []);
  const one = earnedThisStep(prev, next);
  return ACHIEVEMENTS.filter((a) => one.has(a.id) && !have.has(a.id)).map((a) => a.id);
}

// Quorum Run — achievements (DESIGN.md §21).
// ACHIEVEMENTS lists the ten ids in their fixed order; checkAchievements
// reads one step (prev → next) and returns the ids newly earned, in
// ACHIEVEMENTS order, minus everything already in `unlocked`.

import { CARRY_MAX, START_LIVES } from './constants.js';

export const ACHIEVEMENTS = [
  { id: 'first_pickup', title: 'First Patch', description: 'Pick up your first patch.' },
  { id: 'first_merge', title: 'It All Fits', description: 'Merge patches on a merge pad.' },
  { id: 'full_hands', title: 'Full Hands', description: 'Merge three patches at once.' },
  { id: 'monochrome', title: 'Monochrome', description: 'Merge three patches of one colour at once.' },
  { id: 'quorum', title: 'Quorum', description: 'Reach a level\u2019s quorum of merged patches.' },
  { id: 'shipped', title: 'Shipped', description: 'Ship a level by taking its exit.' },
  { id: 'flawless', title: 'Flawless', description: 'Ship a level, or win, with all three lives.' },
  { id: 'conflict', title: 'Standoff', description: 'Watch two drifts collide into a conflict.' },
  { id: 'survivor', title: 'Survivor', description: 'Reach the fourth level.' },
  { id: 'champion', title: 'Champion', description: 'Win the game.' },
];

const IDS = ACHIEVEMENTS.map((a) => a.id);

// Read one step and return the newly earned, not yet unlocked ids.
export function checkAchievements(prev, next, unlocked) {
  const events = next && Array.isArray(next.events) ? next.events : [];
  const carried = prev && Array.isArray(prev.carried) ? prev.carried : [];
  const has = (event) => events.includes(event);

  const earned = new Set();
  if (has('pickup')) earned.add('first_pickup');
  if (has('merge')) {
    earned.add('first_merge');
    if (carried.length >= CARRY_MAX) {
      earned.add('full_hands');
      if (carried[0] === carried[1] && carried[1] === carried[2]) earned.add('monochrome');
    }
  }
  if (has('quorum')) earned.add('quorum');
  if (has('level') || has('won')) {
    earned.add('shipped');
    if (next.lives === START_LIVES) earned.add('flawless');
  }
  if (has('conflict')) earned.add('conflict');
  if (has('level') && next.levelIndex >= 3) earned.add('survivor');
  if (has('won')) earned.add('champion');

  const known = new Set(unlocked);
  return IDS.filter((id) => earned.has(id) && !known.has(id));
}

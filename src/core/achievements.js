// Quorum Run achievements (DESIGN.md §21). The ids, their order, and the
// one-step awarding rule are the contract; the titles and descriptions are
// the flavour. Pure data and pure checks: nothing here reads a clock,
// rolls dice, or touches a browser object.

import { START_LIVES } from './constants.js';

// The ten achievements, in exactly this order, each { id, title, description }.
export const ACHIEVEMENTS = [
  { id: 'first_pickup', title: 'Courier', description: 'Pick up a patch.' },
  { id: 'first_merge', title: 'First Merge', description: 'Merge patches on a merge pad.' },
  { id: 'full_hands', title: 'Full Hands', description: 'Merge 3 patches at once.' },
  { id: 'monochrome', title: 'Monochrome', description: 'Merge 3 patches of one colour at once.' },
  { id: 'quorum', title: 'Quorum', description: 'Reach a level\'s quorum of merged patches.' },
  { id: 'shipped', title: 'Shipped', description: 'Ship a level through its exit.' },
  { id: 'flawless', title: 'Flawless', description: `Ship a level, or win, with all ${START_LIVES} lives.` },
  { id: 'conflict', title: 'Witness', description: 'See a conflict left by two drifts.' },
  { id: 'survivor', title: 'Survivor', description: 'Reach the fourth level (index 3).' },
  { id: 'champion', title: 'Champion', description: 'Win the game.' },
];
for (const a of ACHIEVEMENTS) Object.freeze(a);
Object.freeze(ACHIEVEMENTS);

// Reads one step, prev -> next, where next.events lists what the step did
// (§7). Returns the ids it newly earns that are not already in `unlocked`,
// in ACHIEVEMENTS order. full_hands and monochrome read prev.carried: a
// merge pays out the pile the player walked in with.
export function checkAchievements(prev, next, unlocked) {
  const events = next && Array.isArray(next.events) ? next.events : [];
  const has = (name) => events.includes(name);
  const carried = prev && Array.isArray(prev.carried) ? prev.carried : [];
  const bigMerge = has('merge') && carried.length >= 3;
  const oneColour = bigMerge && carried.every((color) => color === carried[0]);
  const arrived = has('level') || has('won'); // shipped a level, or won the game

  const earned = new Set();
  if (has('pickup')) earned.add('first_pickup');
  if (has('merge')) earned.add('first_merge');
  if (bigMerge) earned.add('full_hands');
  if (oneColour) earned.add('monochrome');
  if (has('quorum')) earned.add('quorum');
  if (arrived) earned.add('shipped');
  if (arrived && next.lives === START_LIVES) earned.add('flawless');
  if (has('conflict')) earned.add('conflict');
  if (has('level') && next.levelIndex >= 3) earned.add('survivor');
  if (has('won')) earned.add('champion');

  const held = Array.isArray(unlocked) ? unlocked : [];
  return ACHIEVEMENTS.filter((a) => earned.has(a.id) && !held.includes(a.id)).map((a) => a.id);
}

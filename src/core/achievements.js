// Quorum Run: achievements (DESIGN.md §21).
//
// Ten unlockables, listed in the order they can be earned in a run.
// `checkAchievements(prev, next, unlocked)` reads one step, prev to next,
// and returns the ids it newly earns that are not already unlocked, in
// ACHIEVEMENTS order. For merging at once it reads `prev.carried`, the
// patches the merge takes in.

import { START_LIVES } from './constants.js';

export const ACHIEVEMENTS = [
  {
    id: 'first_pickup',
    title: 'First fetch',
    description: 'Pick up your first patch.',
  },
  {
    id: 'first_merge',
    title: 'Merged',
    description: 'Merge a patch on a merge pad.',
  },
  {
    id: 'full_hands',
    title: 'Full hands',
    description: 'Carry three patches and merge them all at once.',
  },
  {
    id: 'monochrome',
    title: 'Monochrome',
    description: 'Merge three patches of one colour at once.',
  },
  {
    id: 'quorum',
    title: 'Quorum',
    description: 'Merge enough patches to open a level.',
  },
  {
    id: 'shipped',
    title: 'Shipped',
    description: 'Take the exit and ship a level.',
  },
  {
    id: 'flawless',
    title: 'Flawless',
    description: 'Ship a level, or win the game, without losing a life.',
  },
  {
    id: 'conflict',
    title: 'Standoff',
    description: 'Watch two drifts collide and leave a conflict.',
  },
  {
    id: 'survivor',
    title: 'Survivor',
    description: 'Reach the fourth level.',
  },
  {
    id: 'champion',
    title: 'Champion',
    description: 'Win the game.',
  },
];

const has = (events, name) => Array.isArray(events) && events.includes(name);

export function checkAchievements(prev, next, unlocked) {
  const done = (id) => Array.isArray(unlocked) && unlocked.includes(id);
  const earned = new Set();
  const events = next && Array.isArray(next.events) ? next.events : [];

  // first_pickup and first_merge: the first of each.
  if (has(events, 'pickup')) earned.add('first_pickup');
  if (has(events, 'merge')) earned.add('first_merge');

  // full_hands and monochrome read prev.carried: the patches this merge
  // takes in. Carrying is capped at CARRY_MAX (3), so three at once.
  if (has(events, 'merge') && prev && Array.isArray(prev.carried) && prev.carried.length === 3) {
    earned.add('full_hands');
    const first = prev.carried[0];
    if (prev.carried.every((c) => c === first)) earned.add('monochrome');
  }

  if (has(events, 'quorum')) earned.add('quorum');
  // Winning the game means shipping the last level, so `won` ships too.
  if (has(events, 'level') || has(events, 'won')) earned.add('shipped');
  if ((has(events, 'level') || has(events, 'won')) && next && next.lives === START_LIVES) {
    earned.add('flawless');
  }
  if (has(events, 'conflict')) earned.add('conflict');
  if (has(events, 'level') && next && next.levelIndex === 3) earned.add('survivor');
  if (has(events, 'won')) earned.add('champion');

  return ACHIEVEMENTS.filter((a) => earned.has(a.id) && !done(a.id)).map((a) => a.id);
}

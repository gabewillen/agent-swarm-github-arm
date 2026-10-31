// Achievements (DESIGN.md §21): the ten unlockables, and checkAchievements,
// which reads one step (prev to next, next.events are that step's events)
// and returns the ids it newly earns that the given unlocked list doesn't
// hold, in ACHIEVEMENTS order. Pure core code: no DOM, no clock, no
// randomness — it only reads the states it is given.

import { START_LIVES } from './constants.js';

export const ACHIEVEMENTS = [
  { id: 'first_pickup', title: 'Hands Full', description: 'Pick up your first patch.' },
  { id: 'first_merge', title: 'First Merge', description: 'Merge patches on a merge pad.' },
  { id: 'full_hands', title: 'Full Hands', description: 'Merge three patches at once.' },
  { id: 'monochrome', title: 'Monochrome', description: 'Merge three patches of one colour at once.' },
  { id: 'quorum', title: 'Quorum', description: 'Reach a level\'s quorum of merged patches.' },
  { id: 'shipped', title: 'Shipped', description: 'Ship a level through its exit.' },
  { id: 'flawless', title: 'Flawless', description: 'Ship a level, or win, with all lives left.' },
  { id: 'conflict', title: 'Crossed Drifts', description: 'See two drifts collide into a conflict.' },
  { id: 'survivor', title: 'Survivor', description: 'Reach the fourth level.' },
  { id: 'champion', title: 'Champion', description: 'Win the game.' },
];

export function checkAchievements(prev, next, unlocked) {
  const have = new Set(unlocked);
  const events = next && Array.isArray(next.events) ? next.events : [];
  const carried = prev && Array.isArray(prev.carried) ? prev.carried : [];
  const merge = events.includes('merge');
  const shipped = events.includes('level') || events.includes('won');
  const lives = next ? next.lives : undefined;
  const levelIndex = next ? next.levelIndex : 0;
  const earned = [];
  const earn = (earned_, id) => {
    if (earned_ && !have.has(id)) earned.push(id);
  };
  earn(events.includes('pickup'), 'first_pickup');
  earn(merge, 'first_merge');
  earn(merge && carried.length >= 3, 'full_hands');
  earn(merge && carried.length >= 3 && carried.every((c) => c === carried[0]), 'monochrome');
  earn(events.includes('quorum'), 'quorum');
  earn(shipped, 'shipped');
  earn(shipped && lives === START_LIVES, 'flawless');
  earn(events.includes('conflict'), 'conflict');
  earn(shipped && levelIndex >= 3, 'survivor');
  earn(events.includes('won'), 'champion');
  return earned;
}

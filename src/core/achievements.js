// Achievements (DESIGN.md §21): ten unlockables, each a plain entry, and
// a one-step check. checkAchievements(prev, next, unlocked) reads a single
// step from prev to next — next.events are that step's events — and
// returns the earned ids that are not yet in unlocked, in ACHIEVEMENTS
// order. It changes nothing and depends on nothing but its arguments.

import { START_LIVES } from './constants.js';

// ACHIEVEMENTS order is the report order; the ids are the contract.
export const ACHIEVEMENTS = [
  { id: 'first_pickup', title: 'Ears wet', description: 'Pick up your first patch.' },
  { id: 'first_merge', title: 'Merged', description: 'Merge a patch on a pad.' },
  { id: 'full_hands', title: 'Full hands', description: 'Merge three patches at once.' },
  { id: 'monochrome', title: 'Monochrome', description: 'Merge three patches of one colour at once.' },
  { id: 'quorum', title: 'Quorum', description: 'Reach a level\'s quorum of merges.' },
  { id: 'shipped', title: 'Shipped', description: 'Ship a level through its exit.' },
  { id: 'flawless', title: 'Flawless', description: 'Ship a level, or win, with all your lives.' },
  { id: 'conflict', title: 'Cross breeze', description: 'See two drifts collide.' },
  { id: 'survivor', title: 'Survivor', description: 'Reach the fourth level.' },
  { id: 'champion', title: 'Champion', description: 'Win the game.' },
];

// Whether an event list holds one event.
function has(events, event) {
  return Array.isArray(events) && events.includes(event);
}

// The ids one step earns, in ACHIEVEMENTS order.
function earned(prev, next) {
  const out = [];
  const events = next && next.events;
  const carried = prev && Array.isArray(prev.carried) ? prev.carried : [];
  const level = (next && typeof next.levelIndex === 'number') ? next.levelIndex : 0;
  const lives = (next && typeof next.lives === 'number') ? next.lives : 0;
  if (has(events, 'pickup')) out.push('first_pickup');
  if (has(events, 'merge')) {
    out.push('first_merge');
    if (carried.length >= 3) out.push('full_hands');
    if (carried.length >= 3 && new Set(carried).size === 1) out.push('monochrome');
  }
  if (has(events, 'quorum')) out.push('quorum');
  if (has(events, 'level') || has(events, 'won')) {
    out.push('shipped');
    if (lives >= START_LIVES) out.push('flawless');
  }
  if (has(events, 'conflict')) out.push('conflict');
  if (has(events, 'level') && level >= 3) out.push('survivor');
  if (has(events, 'won')) out.push('champion');
  return out;
}

// checkAchievements(prev, next, unlocked): what this step newly earns.
export function checkAchievements(prev, next, unlocked) {
  const have = new Set(Array.isArray(unlocked) ? unlocked : []);
  return earned(prev, next).filter((id) => !have.has(id));
}

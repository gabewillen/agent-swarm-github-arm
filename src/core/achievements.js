// Achievements (DESIGN.md §21): the list of trophies and the check that
// reads one step. Pure: nothing here changes its arguments.
import { CARRY_MAX, START_LIVES } from './constants.js';

export const ACHIEVEMENTS = [
  { id: 'first_pickup', title: 'First patch', description: 'Pick up your first patch.' },
  { id: 'first_merge', title: 'First merge', description: 'Merge a patch on a merge pad.' },
  { id: 'full_hands', title: 'Full hands', description: 'Merge three patches at once.' },
  { id: 'monochrome', title: 'Monochrome', description: 'Merge three patches of one colour at once.' },
  { id: 'quorum', title: 'Quorum', description: 'Reach a level\'s quorum of merged patches.' },
  { id: 'shipped', title: 'Shipped', description: 'Ship a level through its exit.' },
  { id: 'flawless', title: 'Flawless', description: 'Ship a level, or win, with all your lives.' },
  { id: 'conflict', title: 'Stand-off', description: 'Watch two drifts run into each other.' },
  { id: 'survivor', title: 'Survivor', description: 'Reach the fourth level.' },
  { id: 'champion', title: 'Champion', description: 'Win the game.' },
];

const has = (events, e) => events.includes(e);

export function checkAchievements(prev, next, unlocked) {
  const earned = new Set();
  const events = next && Array.isArray(next.events) ? next.events : [];
  if (has(events, 'pickup')) earned.add('first_pickup');
  if (has(events, 'merge')) {
    earned.add('first_merge');
    const carried = prev && Array.isArray(prev.carried) ? prev.carried : [];
    if (carried.length === CARRY_MAX) {
      earned.add('full_hands');
      if (carried.every((c) => c === carried[0])) earned.add('monochrome');
    }
  }
  if (has(events, 'quorum')) earned.add('quorum');
  const shipped = has(events, 'level') || has(events, 'won');
  if (shipped) {
    earned.add('shipped');
    if (next.lives === START_LIVES) earned.add('flawless');
    if (next.levelIndex >= 3) earned.add('survivor');
  }
  if (has(events, 'conflict')) earned.add('conflict');
  if (has(events, 'won')) earned.add('champion');
  return ACHIEVEMENTS.filter((a) => earned.has(a.id) && !unlocked.includes(a.id)).map((a) => a.id);
}

import { START_LIVES } from './constants.js';

// §21 Achievements. ACHIEVEMENTS is the catalogue in earning order;
// checkAchievements(prev, next, unlocked) reads one step (prev -> next,
// next.events are that step's events) and returns the ids newly earned.
// full_hands and monochrome read prev.carried (the hands at the merge).

export const ACHIEVEMENTS = [
  { id: 'first_pickup', title: 'First pickup', description: 'Pick up your first patch.' },
  { id: 'first_merge', title: 'First merge', description: 'Merge the patches you carry on a merge pad.' },
  { id: 'full_hands', title: 'Full hands', description: 'Merge three patches at once.' },
  { id: 'monochrome', title: 'Monochrome', description: 'Merge three patches of one colour at once.' },
  { id: 'quorum', title: 'Quorum', description: 'Reach a level\'s quorum of merged patches.' },
  { id: 'shipped', title: 'Shipped', description: 'Ship a level through its exit.' },
  { id: 'flawless', title: 'Flawless', description: 'Ship a level, or win, with all lives intact.' },
  { id: 'conflict', title: 'Conflict', description: 'Witness a pair of drifts collide.' },
  { id: 'survivor', title: 'Survivor', description: 'Reach the fourth level.' },
  { id: 'champion', title: 'Champion', description: 'Win the whole game.' },
];

function eventsOf(next) {
  return next && Array.isArray(next.events) ? next.events : [];
}

function carriedOf(prev) {
  return prev && Array.isArray(prev.carried) ? prev.carried : [];
}

export function checkAchievements(prev, next, unlocked) {
  const have = new Set(Array.isArray(unlocked) ? unlocked : []);
  const events = eventsOf(next);
  const earned = new Set();
  const add = (id) => {
    if (!have.has(id)) earned.add(id);
  };

  if (events.includes('pickup')) add('first_pickup');

  if (events.includes('merge')) {
    add('first_merge');
    const carried = carriedOf(prev);
    if (carried.length === 3) {
      add('full_hands');
      if (carried.every((c) => c === carried[0])) add('monochrome');
    }
  }

  if (events.includes('quorum')) add('quorum');

  if (events.includes('level') || events.includes('won')) {
    add('shipped');
    if (next.lives === START_LIVES) add('flawless');
  }

  if (events.includes('conflict')) add('conflict');

  if (events.includes('level') && next.levelIndex >= 3) add('survivor');

  if (events.includes('won')) {
    add('champion');
    if (next.levelIndex >= 3) add('survivor');
  }

  return ACHIEVEMENTS.map((a) => a.id).filter((id) => earned.has(id));
}

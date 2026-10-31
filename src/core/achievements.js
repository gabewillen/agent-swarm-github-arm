// Achievements (§21). ACHIEVEMENTS lists the ten achievements in the fixed
// order the tests and the UI rely on; checkAchievements(prev, next, unlocked)
// reads one step, from prev to next, using next.events (that step's events)
// and prev.carried (what the player was carrying before a merge), and returns
// the ids it newly earns that are not already in unlocked, in ACHIEVEMENTS
// order. Pure: it changes nothing it is given.
import { START_LIVES } from './constants.js';

export const ACHIEVEMENTS = [
  {
    id: 'first_pickup',
    title: 'First pickup',
    description: 'Pick up your first patch.',
  },
  {
    id: 'first_merge',
    title: 'First merge',
    description: 'Merge a patch on a merge pad.',
  },
  {
    id: 'full_hands',
    title: 'Full hands',
    description: 'Merge three patches at once.',
  },
  {
    id: 'monochrome',
    title: 'Monochrome',
    description: 'Merge three patches of one colour at once.',
  },
  {
    id: 'quorum',
    title: 'Quorum',
    description: 'Reach a level\u2019s quorum of merged patches.',
  },
  {
    id: 'shipped',
    title: 'Shipped',
    description: 'Ship a level by reaching its open exit.',
  },
  {
    id: 'flawless',
    title: 'Flawless',
    description: 'Ship a level, or win, with all lives left.',
  },
  {
    id: 'conflict',
    title: 'Conflict',
    description: 'See two drifts collide.',
  },
  {
    id: 'survivor',
    title: 'Survivor',
    description: 'Reach the fourth level (index 3).',
  },
  {
    id: 'champion',
    title: 'Champion',
    description: 'Win the game.',
  },
];

export function checkAchievements(prev, next, unlocked) {
  const events = next && Array.isArray(next.events) ? next.events : [];
  const has = (name) => events.includes(name);

  // What the player carried into the step decides full_hands and
  // monochrome: on a merge, they were all merged at once.
  const carried = prev && Array.isArray(prev.carried) ? prev.carried : null;
  const carriedCount = carried ? carried.length : 0;
  const oneColor = carried && carriedCount >= 3
    ? carried.every((color) => color === carried[0])
    : false;

  const shippedStep = has('level') || has('won');
  const earned = {
    first_pickup: has('pickup'),
    first_merge: has('merge'),
    full_hands: has('merge') && carriedCount >= 3,
    monochrome: has('merge') && oneColor,
    quorum: has('quorum'),
    shipped: shippedStep,
    flawless: shippedStep && next.lives === START_LIVES,
    conflict: has('conflict'),
    survivor: shippedStep && typeof next.levelIndex === 'number' && next.levelIndex >= 3,
    champion: has('won'),
  };

  const held = Array.isArray(unlocked) ? new Set(unlocked) : new Set();
  return ACHIEVEMENTS.filter((a) => earned[a.id] && !held.has(a.id))
    .map((a) => a.id);
}

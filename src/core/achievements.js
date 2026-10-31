// Achievements (DESIGN.md §21): the ten achievements and how one step earns them.

import { CARRY_MAX, START_LIVES } from './constants.js';

export const ACHIEVEMENTS = [
  { id: 'first_pickup', title: 'First pickup', description: 'Pick up your first patch.' },
  { id: 'first_merge', title: 'First merge', description: 'Merge patches on a merge pad.' },
  { id: 'full_hands', title: 'Full hands', description: 'Merge three patches at once.' },
  { id: 'monochrome', title: 'Monochrome', description: 'Merge three patches of one colour at once.' },
  { id: 'quorum', title: 'Quorum', description: "Reach a level's quorum of merged patches." },
  { id: 'shipped', title: 'Shipped', description: 'Ship a level by reaching its exit.' },
  { id: 'flawless', title: 'Flawless', description: 'Ship a level, or win, with all three lives.' },
  { id: 'conflict', title: 'Crossed paths', description: 'See two drifts collide into a conflict.' },
  { id: 'survivor', title: 'Survivor', description: 'Reach the fourth level.' },
  { id: 'champion', title: 'Champion', description: 'Win the game.' },
];

const has = (events, name) => events.includes(name);

// Returns the ids the step prev -> next newly earns, in ACHIEVEMENTS order.
export function checkAchievements(prev, next, unlocked) {
  const events = Array.isArray(next && next.events) ? next.events : [];
  const carried = Array.isArray(prev && prev.carried) ? prev.carried : [];
  const merge = has(events, 'merge');
  const shipped = has(events, 'level') || has(events, 'won');
  const earned = {
    first_pickup: has(events, 'pickup'),
    first_merge: merge,
    full_hands: merge && carried.length >= CARRY_MAX,
    monochrome: merge && carried.length >= CARRY_MAX && carried.every((c) => c === carried[0]),
    quorum: has(events, 'quorum'),
    shipped,
    flawless: shipped && next.lives === START_LIVES,
    conflict: has(events, 'conflict'),
    survivor: next.levelIndex >= 3,
    champion: has(events, 'won'),
  };
  const have = Array.isArray(unlocked) ? unlocked : [];
  return ACHIEVEMENTS.map((a) => a.id).filter((id) => earned[id] && !have.includes(id));
}

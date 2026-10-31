// Achievements of Quorum Run (DESIGN.md §21): the list of achievements and
// the checker that reads one step of play (prev to next) and returns the
// ids newly earned, skipping the ones already unlocked.

import { START_LIVES } from './constants.js';

// Every achievement, in the order they are reported. full_hands and
// monochrome read the hands before the step; the rest follow the events
// the step reported.
export const ACHIEVEMENTS = [
  { id: 'first_pickup', title: 'First Pickup', description: 'Pick up a patch for the first time.' },
  { id: 'first_merge', title: 'First Merge', description: 'Merge patches on a merge pad for the first time.' },
  { id: 'full_hands', title: 'Full Hands', description: 'Merge three patches at once.' },
  { id: 'monochrome', title: 'Monochrome', description: 'Merge three patches of one colour at once.' },
  { id: 'quorum', title: 'Quorum', description: 'Reach a level\'s quorum of merged patches.' },
  { id: 'shipped', title: 'Shipped', description: 'Ship a level through its exit.' },
  { id: 'flawless', title: 'Flawless', description: 'Ship a level, or win, with all lives intact.' },
  { id: 'conflict', title: 'Conflict', description: 'See a conflict where two drifts met.' },
  { id: 'survivor', title: 'Survivor', description: 'Reach the fourth level.' },
  { id: 'champion', title: 'Champion', description: 'Win the whole game.' },
];

// A step's events (an array, possibly absent) hold a name.
function hasEvent(events, name) {
  return Array.isArray(events) && events.includes(name);
}

// The hands before the step, empty when they are not there.
function handsOf(prev) {
  return prev && Array.isArray(prev.carried) ? prev.carried : [];
}

// What a step earns: id to true, for the achievements whose condition the
// step itself shows. A merge of three one-colour patches is also a merge
// of three, so monochrome implies full_hands; the test suite agrees.
function earnedIn(prev, next) {
  const events = next ? next.events : null;
  const merge = hasEvent(events, 'merge');
  const hands = handsOf(prev);
  const same = merge && hands.length >= 3 && hands.every((c) => c === hands[0]);
  const shipped = hasEvent(events, 'level') || hasEvent(events, 'won');
  const lives = next && next.lives;
  const index = next && next.levelIndex;
  return new Map([
    ['first_pickup', hasEvent(events, 'pickup')],
    ['first_merge', merge],
    ['full_hands', merge && hands.length >= 3],
    ['monochrome', same],
    ['quorum', hasEvent(events, 'quorum')],
    ['shipped', shipped],
    ['flawless', shipped && lives === START_LIVES],
    ['conflict', hasEvent(events, 'conflict')],
    ['survivor', hasEvent(events, 'level') && index >= 3],
    ['champion', hasEvent(events, 'won')],
  ]);
}

// The ids a step newly earns, in ACHIEVEMENTS order, none of them already
// in `unlocked`. Pure: `prev`, `next`, and `unlocked` are read, never
// changed, and a fresh array comes back.
export function checkAchievements(prev, next, unlocked) {
  const have = Array.isArray(unlocked) ? new Set(unlocked) : new Set();
  const earned = earnedIn(prev, next);
  const out = [];
  for (const { id } of ACHIEVEMENTS) {
    if (!have.has(id) && earned.get(id)) out.push(id);
  }
  return out;
}

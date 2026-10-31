// Achievements (§21): the ten badges a run can earn, checked one step at
// a time. `ACHIEVEMENTS` is the catalogue, in the order ids are reported;
// `checkAchievements(prev, next, unlocked)` reads one step from `prev` to
// `next` (`next.events` are that step's events) and returns the ids it
// newly earns that are not yet in `unlocked`.
//
// Pure and dependency-free: a step tells achievements everything through
// the state's own fields — its events, `prev.carried`, `next.lives`, and
// `next.levelIndex`. The thresholds it quotes are the constants of §2:
// CARRY_MAX 3 carried patches, START_LIVES 3 lives.

export const ACHIEVEMENTS = [
  { id: 'first_pickup', title: 'First Pickup', description: 'Pick up a patch.' },
  { id: 'first_merge', title: 'First Merge', description: 'Merge patches on a merge pad.' },
  { id: 'full_hands', title: 'Full Hands', description: 'Merge 3 patches at once.' },
  { id: 'monochrome', title: 'Monochrome', description: 'Merge 3 patches of one colour at once.' },
  { id: 'quorum', title: 'Quorum', description: 'Reach a level quorum.' },
  { id: 'shipped', title: 'Shipped', description: 'Ship a level through its exit.' },
  { id: 'flawless', title: 'Flawless', description: 'Ship a level or win with all 3 lives.' },
  { id: 'conflict', title: 'Traffic Jam', description: 'See two drifts leave a conflict.' },
  { id: 'survivor', title: 'Survivor', description: 'Reach the fourth level.' },
  { id: 'champion', title: 'Champion', description: 'Win the whole game.' },
];

const FULL_HANDS = 3; // CARRY_MAX: this many patches carried and merged at once
const FULL_LIVES = 3; // START_LIVES: this many lives left when shipping or winning

export function checkAchievements(prev, next, unlocked) {
  const events = (next && next.events) || [];
  const carried = (prev && prev.carried) || [];
  const merge = events.includes('merge');
  const level = events.includes('level');
  const won = events.includes('won');
  const earned = {
    first_pickup: events.includes('pickup'),
    first_merge: merge,
    full_hands: merge && carried.length === FULL_HANDS,
    monochrome: merge && carried.length === FULL_HANDS &&
      carried.every((c) => c === carried[0]),
    quorum: events.includes('quorum'),
    shipped: level || won,
    flawless: (level || won) && (next && next.lives) === FULL_LIVES,
    conflict: events.includes('conflict'),
    survivor: level && next && next.levelIndex >= 3,
    champion: won,
  };
  const have = Array.isArray(unlocked) ? unlocked : [];
  return ACHIEVEMENTS
    .filter((a) => earned[a.id] && !have.includes(a.id))
    .map((a) => a.id);
}

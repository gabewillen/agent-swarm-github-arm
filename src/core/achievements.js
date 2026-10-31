// Achievements (DESIGN.md §21): the ten unlockables and the one-step
// rule that reads `prev` to `next` (a step's events are in `next.events`)
// and returns the ids it newly earns, in ACHIEVEMENTS order, skipping any
// id already in `unlocked`.
//
// `START_LIVES` comes from constants.js, always a peer of this module in
// spirit; while that file has not landed, this module still loads and
// falls back to the §2 contract value.

let LIVES_MAX = 3;
try {
  ({ START_LIVES: LIVES_MAX } = await import('./constants.js'));
} catch {
  // constants.js is not importable; keep the contract value of §2.
}

export const ACHIEVEMENTS = [
  { id: 'first_pickup', title: 'First pickup', description: 'Pick up a patch.' },
  { id: 'first_merge', title: 'First merge', description: 'Merge patches on a merge pad.' },
  { id: 'full_hands', title: 'Full hands', description: 'Merge three patches at once.' },
  { id: 'monochrome', title: 'Monochrome', description: 'Merge three patches of one colour at once.' },
  { id: 'quorum', title: 'Quorum', description: 'Reach a level\'s quorum.' },
  { id: 'shipped', title: 'Shipped', description: 'Ship a level.' },
  { id: 'flawless', title: 'Flawless', description: 'Ship a level, or win, with every life intact.' },
  { id: 'conflict', title: 'Conflict', description: 'See two drifts collide.' },
  { id: 'survivor', title: 'Survivor', description: 'Reach the fourth level.' },
  { id: 'champion', title: 'Champion', description: 'Win the game.' },
];

export function checkAchievements(prev, next, unlocked) {
  const events = next && Array.isArray(next.events) ? next.events : [];
  const has = (name) => events.includes(name);
  const had = Array.isArray(unlocked) ? unlocked : [];
  const carried = prev && Array.isArray(prev.carried) ? prev.carried : [];
  const count = carried.length;
  const uniform = count >= 3 && carried.every((c) => c === carried[0]);
  const shippedThisStep = has('level') || has('won');
  const lives = next ? next.lives : undefined;
  const levelReached = next ? next.levelIndex : undefined;
  return ACHIEVEMENTS.filter(({ id }) => {
    if (had.includes(id)) return false;
    switch (id) {
      case 'first_pickup':
        return has('pickup');
      case 'first_merge':
        return has('merge');
      case 'full_hands':
        return has('merge') && count >= 3;
      case 'monochrome':
        return has('merge') && uniform;
      case 'quorum':
        return has('quorum');
      case 'shipped':
        return shippedThisStep;
      case 'flawless':
        return shippedThisStep && lives === LIVES_MAX;
      case 'conflict':
        return has('conflict');
      case 'survivor':
        return shippedThisStep && levelReached >= 3;
      case 'champion':
        return has('won');
      default:
        return false;
    }
  }).map(({ id }) => id);
}

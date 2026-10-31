// The shipped levels (DESIGN.md §10): at least 10 valid definitions,
// first to last in rising difficulty — no drift on the first, drifts most
// of the way, hold doors from the middle on.

// P is a patch spawn, '.' floor, '#' wall, '@' start, 'M' merge pad,
// 'X' exit, 'H' hold door, ^ > v < drift starts.

// 1. A room with four spawn points and a pad: learn pickup and merge.
export const LEVELS = [
  {
    name: 'First merge', quorum: 2, par: 80, driftPeriod: 2, spawnEvery: 20,
    map: [
      '#########',
      '#P.....P#',
      '#.M...@.#',
      '#P.....P#',
      '#...X...#',
      '#########',
    ],
  },

  // 2. One drift patrols the row the pads sit on.
  {
    name: 'Cold courier', quorum: 3, par: 110, driftPeriod: 3, spawnEvery: 18,
    map: [
      '###########',
      '#@..P...P.#',
      '#.<M.....X#',
      '#.........#',
      '#..P..M.P.#',
      '###########',
    ],
  },

  // 3. A long hall with two drifts walking it.
  {
    name: 'The long hall', quorum: 3, par: 130, driftPeriod: 2, spawnEvery: 16,
    map: [
      '#############',
      '#@..P.....M.#',
      '#.^.>....X..#',
      '#P...M..P..>#',
      '#############',
    ],
  },

  // 4. Hold doors gate the pads and the exit; still no drifts.
  {
    name: 'Held gates', quorum: 3, par: 120, driftPeriod: 2, spawnEvery: 14,
    map: [
      '###########',
      '#@..P..H.P#',
      '#.M.....H.#',
      '#..P.M..X.#',
      '###########',
    ],
  },

  // 5. A ring of drifts circles the pads.
  {
    name: 'Roundabout', quorum: 4, par: 140, driftPeriod: 2, spawnEvery: 14,
    map: [
      '###########',
      '#@P.M.H..P#',
      '#...v.....#',
      '#P.>.....<#',
      '#...^.M..X#',
      '###########',
    ],
  },

  // 6. Drifts pinch the corridors between spawns and pads.
  {
    name: 'Pinch point', quorum: 4, par: 150, driftPeriod: 2, spawnEvery: 14,
    map: [
      '#############',
      '#@..P..^....#',
      '#.M......P..#',
      '#.......v...#',
      '#..P..M...X.#',
      '#############',
    ],
  },

  // 7. A vault: two holds gate the route, two drifts walk the hall.
  {
    name: 'The vault', quorum: 5, par: 160, driftPeriod: 2, spawnEvery: 12,
    map: [
      '#############',
      '#@P.H.M.H..P#',
      '#...........#',
      '#.>.<..X....#',
      '#############',
    ],
  },

  // 8. Rush hour: four drifts on a wide floor.
  {
    name: 'Rush hour', quorum: 5, par: 160, driftPeriod: 2, spawnEvery: 12,
    map: [
      '###############',
      '#@P.M.....P..>#',
      '#.............#',
      '#.>...^...v..P#',
      '#....M....X...#',
      '###############',
    ],
  },

  // 9. Lockstep: holds and drifts together, tight pars.
  {
    name: 'Lockstep', quorum: 5, par: 170, driftPeriod: 2, spawnEvery: 12,
    map: [
      '#############',
      '#@P.H...<.H.#',
      '#..v..M.....#',
      '#>......H.X.#',
      '#..P..M....P#',
      '#############',
    ],
  },

  // 10. The gauntlet: five drifts and a distant exit.
  {
    name: 'The gauntlet', quorum: 6, par: 180, driftPeriod: 2, spawnEvery: 12,
    map: [
      '###############',
      '#@P..H.M....P.#',
      '#..v>.<.>v....#',
      '#P....X..M....#',
      '###############',
    ],
  },
];

// The shipped levels (DESIGN.md §10): first to last in rising difficulty.
// The first has no drift; later levels add drifts and hold doors that gate
// exits behind short-cuts. Every quorum is at most 20 and every par at
// least 30.
export const LEVELS = [
  {
    name: 'First merge', quorum: 3, par: 140, driftPeriod: 2, spawnEvery: 14,
    map: [
      '#######',
      '#@P.P.#',
      '#.M.X.#',
      '#P....#',
      '#######',
    ],
  },
  {
    name: 'Side paths', quorum: 4, par: 160, driftPeriod: 2, spawnEvery: 14,
    map: [
      '#########',
      '#@..P..M#',
      '#.#####.#',
      '#P.....X#',
      '#P.P....#',
      '#########',
    ],
  },
  {
    name: 'Patrol', quorum: 2, par: 120, driftPeriod: 2, spawnEvery: 12,
    map: [
      '#######',
      '#@P.X.#',
      '#P.M..#',
      '#v....#',
      '#######',
    ],
  },
  {
    name: 'The gate', quorum: 2, par: 130, driftPeriod: 2, spawnEvery: 14,
    map: [
      '#######',
      '#@P.MP#',
      '#>#H###',
      '#.#.X##',
      '#######',
    ],
  },
  {
    name: 'Crossings', quorum: 4, par: 150, driftPeriod: 2, spawnEvery: 12,
    map: [
      '#########',
      '#@P..M..#',
      '#.##H#.X#',
      '#<...>..#',
      '#P.P....#',
      '#########',
    ],
  },
  {
    name: 'Roundabout', quorum: 5, par: 180, driftPeriod: 2, spawnEvery: 12,
    map: [
      '##########',
      '#@P.M..X.#',
      '#..>.<...#',
      '#P...v...#',
      '#..^..M..#',
      '##########',
    ],
  },
  {
    name: 'Bottleneck', quorum: 5, par: 170, driftPeriod: 2, spawnEvery: 14,
    map: [
      '##########',
      '#@.P..M..#',
      '#.###H##.#',
      '#P.>.H..X#',
      '#.###^##.#',
      '#..P.....#',
      '##########',
    ],
  },
  {
    name: 'Gauntlet', quorum: 6, par: 190, driftPeriod: 2, spawnEvery: 12,
    map: [
      '###########',
      '#@P..M..P.#',
      '#.#H####.>#',
      '#P..X.....#',
      '#...>.M.P.#',
      '#<........#',
      '###########',
    ],
  },
  {
    name: 'Pinwheel', quorum: 7, par: 210, driftPeriod: 2, spawnEvery: 12,
    map: [
      '###########',
      '#@P.M..^.##',
      '#.#####.P.#',
      '#.>#H###..#',
      '#P..X..H.>#',
      '#.<####...#',
      '#..M...P..#',
      '###########',
    ],
  },
  {
    name: 'Convergence', quorum: 8, par: 240, driftPeriod: 2, spawnEvery: 12,
    map: [
      '#############',
      '#@P.P..>#<..#',
      '#.M.....#..X#',
      '#>.P..>.#..>#',
      '#P...<..H.P.#',
      '#.....>.#...#',
      '#############',
    ],
  },
];

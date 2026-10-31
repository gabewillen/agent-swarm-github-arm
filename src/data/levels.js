// The shipped levels (DESIGN.md §10): at least ten valid definitions with
// distinct names, from a drift-free first level up to busier ones, some with
// hold doors that gate a region until the quorum lands.
const LEVELS = [
  {
    name: 'First merge',
    quorum: 2, par: 90, driftPeriod: 2, spawnEvery: 20,
    map: [
      '###########',
      '#@.P...M..#',
      '#....P....#',
      '#..X......#',
      '###########',
    ],
  },
  {
    name: 'Corridor courier',
    quorum: 3, par: 110, driftPeriod: 3, spawnEvery: 24,
    map: [
      '############',
      '#@..P.P..M.#',
      '#..........#',
      '#..X....P..#',
      '############',
    ],
  },
  {
    name: 'Hold the door',
    quorum: 2, par: 120, driftPeriod: 4, spawnEvery: 20,
    map: [
      '###########',
      '#@P.H.M.P.#',
      '#...H.....#',
      '#..X..P...#',
      '###########',
    ],
  },
  {
    name: 'Drift along',
    quorum: 3, par: 130, driftPeriod: 3, spawnEvery: 18,
    map: [
      '############',
      '#@.P.M.P..>#',
      '#..........#',
      '#...X....P.#',
      '#..........#',
      '############',
    ],
  },
  {
    name: 'Cross traffic',
    quorum: 3, par: 140, driftPeriod: 2, spawnEvery: 20,
    map: [
      '############',
      '#@P..M..P..#',
      '#...<.....>#',
      '#....X.....#',
      '#..P.......#',
      '############',
    ],
  },
  {
    name: 'Two wings',
    quorum: 4, par: 150, driftPeriod: 4, spawnEvery: 22,
    map: [
      '#############',
      '#@.P.H.P..M.#',
      '#.......H...#',
      '#..P.H....P.#',
      '#....X......#',
      '#############',
    ],
  },
  {
    name: 'Patrol route',
    quorum: 3, par: 140, driftPeriod: 2, spawnEvery: 20,
    map: [
      '#############',
      '#@.P..M..P..#',
      '#..v.....^..#',
      '#....X.P....#',
      '#...........#',
      '#############',
    ],
  },
  {
    name: 'Gatehouse',
    quorum: 4, par: 160, driftPeriod: 3, spawnEvery: 20,
    map: [
      '#############',
      '#@.P.H.M.H.P#',
      '#...H...H...#',
      '#..P..X.....#',
      '#...........#',
      '#############',
    ],
  },
  {
    name: 'Deadlock',
    quorum: 4, par: 170, driftPeriod: 2, spawnEvery: 20,
    map: [
      '#############',
      '#@P.H.M.H.P>#',
      '#...H...H...#',
      '#..P..X..P..#',
      '#...........#',
      '#############',
    ],
  },
  {
    name: 'Grand union',
    quorum: 5, par: 180, driftPeriod: 2, spawnEvery: 18,
    map: [
      '##############',
      '#@P..M..P...^#',
      '#..>.<..v....#',
      '#.....H......#',
      '#..P..X..P...#',
      '##############',
    ],
  },
  {
    name: 'Last dispatch',
    quorum: 6, par: 210, driftPeriod: 2, spawnEvery: 16,
    map: [
      '##############',
      '#@.P.H.M.H.P.#',
      '#......>.....#',
      '#..v.H...H.v.#',
      '#..P..X..P...#',
      '##############',
    ],
  },
];
export { LEVELS };

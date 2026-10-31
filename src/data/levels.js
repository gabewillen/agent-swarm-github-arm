// The shipped levels (DESIGN.md §10), first to last in rising difficulty:
// the first has no drift, drifts and hold doors arrive one idea at a time,
// and quorums grow as the couriers' routes lengthen.
export const LEVELS = [
  // 1. Two patches, a pad, an exit: learn pickup, merge, ship.
  {
    name: 'First merge',
    quorum: 2,
    par: 120,
    driftPeriod: 2,
    spawnEvery: 24,
    map: [
      '#########',
      '#@PP.MX.#',
      '#.......#',
      '#########',
    ],
  },

  // 2. One drift patrols the far end of the aisle.
  {
    name: 'Patrol',
    quorum: 3,
    par: 130,
    driftPeriod: 2,
    spawnEvery: 20,
    map: [
      '#############',
      '#@PPPM.X..>.#',
      '#...........#',
      '#############',
    ],
  },

  // 3. A hold door gates the exit chamber.
  {
    name: 'Hold the gate',
    quorum: 3,
    par: 140,
    driftPeriod: 2,
    spawnEvery: 20,
    map: [
      '#############',
      '#@PP.M#..X..#',
      '#....>#.....#',
      '#.....H.....#',
      '#############',
    ],
  },

  // 4. Two pads split the routing decision.
  {
    name: 'Twin pads',
    quorum: 4,
    par: 150,
    driftPeriod: 2,
    spawnEvery: 18,
    map: [
      '###############',
      '#@P.....M...X.#',
      '#...P.....>...#',
      '#..M..........#',
      '###############',
    ],
  },

  // 5. A long haul across a split hall.
  {
    name: 'Long haul',
    quorum: 5,
    par: 160,
    driftPeriod: 2,
    spawnEvery: 16,
    map: [
      '#################',
      '#@PP....M....X..#',
      '#.>.....#...<...#',
      '#.......#.......#',
      '#################',
    ],
  },

  // 6. The commons: a hold joins the working yard to the shipway.
  {
    name: 'The commons',
    quorum: 5,
    par: 160,
    driftPeriod: 2,
    spawnEvery: 16,
    map: [
      '###############',
      '#@PP.M#..X....#',
      '#..P..#..>....#',
      '#.....H..P....#',
      '#.....#.......#',
      '###############',
    ],
  },

  // 7. Crossfire: three drifts and two chained holds to the exit.
  {
    name: 'Crossfire',
    quorum: 6,
    par: 180,
    driftPeriod: 2,
    spawnEvery: 14,
    map: [
      '#################',
      '#@PM.#....#...X.#',
      '#....#>...H....<#',
      '#P...H....#...^.#',
      '#....#....#.....#',
      '#################',
    ],
  },

  // 8. Underkeep: holds gate the yard and, behind it, the shipway.
  {
    name: 'Underkeep',
    quorum: 7,
    par: 190,
    driftPeriod: 2,
    spawnEvery: 14,
    map: [
      '###################',
      '#@P.P#P.....#...X.#',
      '#....#.>....H..<..#',
      '#.M..H......#.....#',
      '#....#....<.#.....#',
      '#....#......#..^..#',
      '#..v.#......#.....#',
      '###################',
    ],
  },

  // 9. The gauntlet: four drifts share the long hall.
  {
    name: 'The gauntlet',
    quorum: 8,
    par: 200,
    driftPeriod: 2,
    spawnEvery: 12,
    map: [
      '#####################',
      '#@P.M#....P...#..X..#',
      '#....#.>..P...H.....#',
      '#.P..H...<....#.....#',
      '#....#....P...#.....#',
      '#.v..#..^.....#.....#',
      '#....#........#.....#',
      '#####################',
    ],
  },

  // 10. Endgame: two holds gate the mid yard and the shipway.
  {
    name: 'Endgame',
    quorum: 10,
    par: 220,
    driftPeriod: 2,
    spawnEvery: 12,
    map: [
      '#######################',
      '#@P...#...M...P.#..X..#',
      '#..v..#.>..P....#.....#',
      '#.....#.......<.H.....#',
      '#.....H.........#.....#',
      '#.....#..P......#.>...#',
      '#.....#....v.P..#.....#',
      '#.....................#',
      '#######################',
    ],
  },
];

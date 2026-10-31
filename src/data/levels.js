// Quorum Run's shipped levels (DESIGN.md §10): at least ten valid
// definitions, first to last in rising difficulty; the first has no
// drifts, most take drifts, and four gate a region behind a hold door.

export const LEVELS = [
  // A straight corridor: pick both patches, merge, ship.
  {
    name: 'First merge',
    quorum: 2, par: 100, driftPeriod: 2, spawnEvery: 20,
    map: [
      '########',
      '#@PPMX.#',
      '########',
    ],
  },

  // Two pockets to collect from; the pads sit off the main line.
  {
    name: 'Side steps',
    quorum: 3, par: 90, driftPeriod: 2, spawnEvery: 24,
    map: [
      '###########',
      '#@..P.M..X#',
      '#..P...M..#',
      '###########',
    ],
  },

  // One slow patrol sweeping the middle corridor.
  {
    name: 'The patrol',
    quorum: 3, par: 80, driftPeriod: 3, spawnEvery: 24,
    map: [
      '###########',
      '#@P....M.X#',
      '#......#..#',
      '#..>......#',
      '#P...M....#',
      '###########',
    ],
  },

  // The right half opens only through the hold door.
  {
    name: 'Hold up',
    quorum: 3, par: 80, driftPeriod: 4, spawnEvery: 30,
    map: [
      '#############',
      '#@P.M>.#P.MX#',
      '#......H....#',
      '#......#....#',
      '#############',
    ],
  },

  // Four drifts sweep the crossroads.
  {
    name: 'Crossfire',
    quorum: 4, par: 90, driftPeriod: 2, spawnEvery: 26,
    map: [
      '###############',
      '#@P...v....M.X#',
      '#.....#.......#',
      '#..>..#..<....#',
      '#.....#.......#',
      '#.P.M.^....P..#',
      '###############',
    ],
  },

  // A wall with one hold door links two delivery parks.
  {
    name: 'The gauntlet',
    quorum: 4, par: 110, driftPeriod: 2, spawnEvery: 22,
    map: [
      '#################',
      '#@P..M...#P..M.X#',
      '#.......#.......#',
      '#..>....H....<..#',
      '#.......#.......#',
      '#.M.P...#...P.M.#',
      '#################',
    ],
  },

  // A ring corridor around a solid block: drifts circulate.
  {
    name: 'Roundabout',
    quorum: 4, par: 100, driftPeriod: 2, spawnEvery: 20,
    map: [
      '#############',
      '#@.P..>.M.<X#',
      '#.#########.#',
      '#.#########.#',
      '#^#########.#',
      '#P.M......P.#',
      '#############',
    ],
  },

  // Warehouse aisles patrolled by drifts; one hold door links them.
  {
    name: 'Warehouse',
    quorum: 5, par: 120, driftPeriod: 2, spawnEvery: 18,
    map: [
      '##################',
      '#@...P....#..P.MX#',
      '#.........#......#',
      '#..>......H..<...#',
      '#.........#......#',
      '#P...M....#..M.P.#',
      '#.........#......#',
      '#....v...........#',
      '##################',
    ],
  },

  // Tight two-corridor city; drifts pack the middle lanes.
  {
    name: 'Rush hour',
    quorum: 6, par: 100, driftPeriod: 2, spawnEvery: 14,
    map: [
      '#####################',
      '#@P....M.#.....P...X#',
      '#...................#',
      '#..>>....#.......>..#',
      '#........#..........#',
      '#P..M....#....M.P...#',
      '#####################',
    ],
  },

  // Six drifts in four aisles behind three hold doors.
  {
    name: 'Swarm',
    quorum: 6, par: 120, driftPeriod: 1, spawnEvery: 12,
    map: [
      '##########################',
      '#@....#......#......#..X.#',
      '#..P..#..M...#...P..#.M..#',
      '#.>...#.<....#..v...#....#',
      '#.....#......#......#....#',
      '#.....H......H......H....#',
      '#M....#...P..#...M..#....#',
      '#...v.#.>....#......#.^..#',
      '##########################',
    ],
  },
];

// §10: the shipped levels, first to last in rising difficulty. The first
// level has no drifts, six or more patrol with drifts, and four or more are
// gated by hold doors. Every quorum is at most 20 and every par at least 30.
export const LEVELS = [
  {
    name: 'Wake Up', quorum: 3, par: 120, driftPeriod: 2, spawnEvery: 20,
    map: [
      '#########',
      '#@..P..X#',
      '#.P.M.P.#',
      '#...M...#',
      '#########',
    ],
  },
  {
    name: 'The Doorway', quorum: 4, par: 110, driftPeriod: 2, spawnEvery: 20,
    map: [
      '###########',
      '#@.P..#..X#',
      '#..M......#',
      '#.....#...#',
      '###########',
    ],
  },
  {
    name: 'Drift Alley', quorum: 4, par: 100, driftPeriod: 2, spawnEvery: 18,
    map: [
      '#########',
      '#@.P.M.X#',
      '#.......#',
      '#>.....<#',
      '#########',
    ],
  },
  {
    name: 'Holding Pattern', quorum: 5, par: 100, driftPeriod: 3, spawnEvery: 18,
    map: [
      '##########',
      '#@P.M.P#.#',
      '#......#X#',
      '#..<...H.#',
      '##########',
    ],
  },
  {
    name: 'Sweeper', quorum: 5, par: 90, driftPeriod: 2, spawnEvery: 18,
    map: [
      '###########',
      '#@P...^..X#',
      '#.M.....P.#',
      '#.........#',
      '#<........#',
      '###########',
    ],
  },
  {
    name: 'The Vault', quorum: 6, par: 90, driftPeriod: 2, spawnEvery: 16,
    map: [
      '#############',
      '#@.P.....M.X#',
      '#...##H##...#',
      '#<..#.P.#...#',
      '#...#P..#...#',
      '#...#####...#',
      '#############',
    ],
  },
  {
    name: 'Crossings', quorum: 6, par: 80, driftPeriod: 2, spawnEvery: 16,
    map: [
      '#############',
      '#@.P..M...X.#',
      '#...........#',
      '#.^.^.^.^...#',
      '#...........#',
      '#.....M.P...#',
      '#############',
    ],
  },
  {
    name: 'Meridian', quorum: 8, par: 80, driftPeriod: 2, spawnEvery: 14,
    map: [
      '###############',
      '#@P...M..P...X#',
      '#.##.#####.##.#',
      '#.#.....#...#.#',
      '#.<.....v...>.#',
      '#.#..M..#P..#.#',
      '#.###.#####.#.#',
      '#.............#',
      '###############',
    ],
  },
  {
    name: 'Stronghold', quorum: 9, par: 70, driftPeriod: 2, spawnEvery: 14,
    map: [
      '#############',
      '#@.P.M.P...X#',
      '#.HH##.##HH.#',
      '#...#...#...#',
      '#>..#.P.#..>#',
      '#...#.P.#...#',
      '#...HH.HHH..#',
      '#############',
    ],
  },
  {
    name: 'The Gauntlet', quorum: 10, par: 70, driftPeriod: 2, spawnEvery: 12,
    map: [
      '#################',
      '#@.P..M..P..M..X#',
      '#...............#',
      '#.^..^..^..^..^.#',
      '#...............#',
      '#.P..M..P..M....#',
      '#...............#',
      '#.<..<..<..<...>#',
      '#################',
    ],
  },
  {
    name: 'Quorum Court', quorum: 12, par: 60, driftPeriod: 1, spawnEvery: 12,
    map: [
      '###################',
      '#@..P...M...P....X#',
      '#.................#',
      '#.H.HHHH.HHHH.HHH.#',
      '#...#.........#...#',
      '#.^.#.P.....P.#.<.#',
      '#...#....M....#...#',
      '#...#.........#...#',
      '#.###HH.....HH##..#',
      '#.................#',
      '###################',
    ],
  },
];

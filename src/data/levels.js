// The shipped levels (DESIGN.md §10): at least ten valid definitions with
// distinct names, first to last in rising difficulty. The first level has
// no drift; later ones add patrols and hold doors that gate the route.

export const LEVELS = [
  {
    name: 'First merge',
    quorum: 2,
    par: 120,
    driftPeriod: 2,
    spawnEvery: 20,
    map: [
      '#########',
      '#..P....#',
      '#.P...M.#',
      '#..@....#',
      '#.P..##.#',
      '#..X....#',
      '#########',
    ],
  },

  {
    name: 'Patrol row',
    quorum: 2,
    par: 120,
    driftPeriod: 2,
    spawnEvery: 18,
    map: [
      '###########',
      '#.@P....M.#',
      '#.P.......#',
      '#..>.<..X.#',
      '#.P.......#',
      '###########',
    ],
  },

  {
    name: 'Hold the line',
    quorum: 3,
    par: 130,
    driftPeriod: 2,
    spawnEvery: 16,
    map: [
      '###########',
      '#.@P.M#...#',
      '#.....H..X#',
      '#.P...#...#',
      '###########',
    ],
  },

  {
    name: 'Crossfire',
    quorum: 4,
    par: 140,
    driftPeriod: 2,
    spawnEvery: 14,
    map: [
      '#########',
      '#@P.M.X.#',
      '#..H....#',
      '#P>...<P#',
      '#..H....#',
      '#########',
    ],
  },

  {
    name: 'Switchback',
    quorum: 4,
    par: 150,
    driftPeriod: 3,
    spawnEvery: 14,
    map: [
      '###########',
      '#@..P....>#',
      '#.#######.#',
      '#.#P..M.#.#',
      '#.#.#...#.#',
      '#...#X.P..#',
      '###########',
    ],
  },

  {
    name: 'Toll gates',
    quorum: 5,
    par: 160,
    driftPeriod: 2,
    spawnEvery: 14,
    map: [
      '#############',
      '#@.P.M#..P..#',
      '#.....#.###.#',
      '#.P...H..#..#',
      '#.....#.H.X.#',
      '#.P.M.#.###.#',
      '#############',
    ],
  },

  {
    name: 'Driftwood',
    quorum: 6,
    par: 170,
    driftPeriod: 2,
    spawnEvery: 12,
    map: [
      '#############',
      '#.@P....>..M#',
      '#....P#####.#',
      '#.###.......#',
      '#.P.#H..X...#',
      '#.#.###.....#',
      '#...#..v....#',
      '#############',
    ],
  },

  {
    name: 'The gauntlet',
    quorum: 7,
    par: 180,
    driftPeriod: 2,
    spawnEvery: 12,
    map: [
      '###############',
      '#@.P.M#...P..>#',
      '#.....#.#####.#',
      '#.P...H..P..X.#',
      '#.....#.#####.#',
      '#..P..#....P..#',
      '###############',
    ],
  },

  {
    name: 'Gridlock',
    quorum: 8,
    par: 190,
    driftPeriod: 2,
    spawnEvery: 12,
    map: [
      '#############',
      '#@.P.M#..P..#',
      '#.....>.....#',
      '#.P...#.H...#',
      '#.....#.#.X.#',
      '#.P.M.v.###.#',
      '#.......P...#',
      '#############',
    ],
  },

  {
    name: 'Last stand',
    quorum: 10,
    par: 200,
    driftPeriod: 2,
    spawnEvery: 10,
    map: [
      '#################',
      '#@..P...#..P...>#',
      '#.......#.#####.#',
      '#.P.M...v...H.X.#',
      '#.#####.#####.#.#',
      '#.....P.....#.P.#',
      '#.#####.###.#.#.#',
      '#.P...#.H...#...#',
      '#################',
    ],
  },

  {
    name: 'Deep run',
    quorum: 12,
    par: 220,
    driftPeriod: 2,
    spawnEvery: 10,
    map: [
      '#################',
      '#@.P....M#...P.>#',
      '#......#.#####..#',
      '#.PP...H.....X..#',
      '#.#####.#####.###',
      '#.#P....#..P..###',
      '#.#####.####.####',
      '#.P...M#.....P.##',
      '#################',
    ],
  },
];

// The shipped levels, DESIGN.md §10. Names, quorum/par, drifts, and hold
// doors rise along the list: the first level is a quiet room with no
// drifts, then patrols appear, holds start gating whole wings mid-game,
// and the last levels are busy playgrounds.

export const LEVELS = [
  // A quiet room: learn pickup, merge, exit.
  {
    name: 'First merge', quorum: 3, par: 120, driftPeriod: 2, spawnEvery: 20,
    map: [
      '#######',
      '#@.P.M#',
      '#..X..#',
      '#######',
    ],
  },

  // One drift rounds the block; keep out of its lane.
  {
    name: 'Roundabout', quorum: 3, par: 110, driftPeriod: 2, spawnEvery: 16,
    map: [
      '##########',
      '#@.P...M.#',
      '#....>..X#',
      '#..P.....#',
      '##########',
    ],
  },

  // Two merge pads, a walled island with the exit inside.
  {
    name: 'Twin pads', quorum: 4, par: 140, driftPeriod: 2, spawnEvery: 14,
    map: [
      '###########',
      '#@...M....#',
      '#.#####.#.#',
      '#.#..X..#.#',
      '#.#####.#.#',
      '#..P..M..P#',
      '###########',
    ],
  },

  // The exit sits in a vault behind two hold doors; quorum opens them.
  {
    name: 'Vault door', quorum: 4, par: 130, driftPeriod: 2, spawnEvery: 14,
    map: [
      '###########',
      '#@..P..M..#',
      '#.........#',
      '#.##H#H##.#',
      '#.#..X..#.#',
      '#.#.....#.#',
      '###########',
    ],
  },

  // Pillars, two vertical patrols, two pads: cross the lanes carefully.
  {
    name: 'Pillars', quorum: 5, par: 150, driftPeriod: 2, spawnEvery: 12,
    map: [
      '#############',
      '#@....M....P#',
      '#...^...#...#',
      '#..###..#.v.#',
      '#...M...#...#',
      '#P....X....P#',
      '#############',
    ],
  },

  // Three patrols run the plaza's lanes and the border ring.
  {
    name: 'Crossroads', quorum: 5, par: 160, driftPeriod: 2, spawnEvery: 12,
    map: [
      '#############',
      '#@..P....M..#',
      '#...........#',
      '#.##.###.##.#',
      '#..#..v..#..#',
      '#.>#..#..#<.#',
      '#..#..#..#..#',
      '#....X...P..#',
      '#############',
    ],
  },

  // A vault wing holds the exit and a pad; holds open at the quorum.
  {
    name: 'The vault', quorum: 6, par: 170, driftPeriod: 2, spawnEvery: 12,
    map: [
      '###############',
      '#@..P.M....^..#',
      '#..#####.####.#',
      '#.......v....P#',
      '#####H###H#####',
      '#.............#',
      '#..M....X....M#',
      '#......P......#',
      '###############',
    ],
  },

  // Four runs wind around a plinth pad; the exit hides below them.
  {
    name: 'Clockwork', quorum: 6, par: 180, driftPeriod: 2, spawnEvery: 10,
    map: [
      '###############',
      '#@....M......>#',
      '#.............#',
      '#P..#####...v.#',
      '#.>.#..M..#...#',
      '#...##.##...^.#',
      '#.............#',
      '#..P...X...P..#',
      '###############',
    ],
  },

  // A long lane under patrol, then two hold doors into the exit bay.
  {
    name: 'The gauntlet', quorum: 8, par: 200, driftPeriod: 2, spawnEvery: 10,
    map: [
      '###################',
      '#@.P....M...v...P.#',
      '#..<.....>........#',
      '#####H#####H#######',
      '#..M......X...P.M.#',
      '#.................#',
      '###################',
    ],
  },

  // Two wings split by a door wall, five patrols, ten merges to land.
  {
    name: 'Grand finale', quorum: 10, par: 220, driftPeriod: 2, spawnEvery: 10,
    map: [
      '#######################',
      '#@..P...M.....P....>..#',
      '#..v..............<...#',
      '#.....###H#H####.#...##',
      '#.M...P..........P.^.M#',
      '#....>....X....P......#',
      '#.......M...........P.#',
      '#.....................#',
      '#.v...........P.......#',
      '#.....................#',
      '#######################',
    ],
  },
];

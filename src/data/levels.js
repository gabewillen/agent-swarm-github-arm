// Quorum Run: the shipped levels (DESIGN.md §10).
// Pure data: no imports, no logic. Twelve campaign levels, first to last in
// rising difficulty: the first has no drift, the rest add drifts and hold
// doors as the campaign goes on. Every quorum is at most 20 and every par at
// least 30.

export const LEVELS = [
  // 1. First Merge — an open room, no drift, two patches to the pad.
  {
    name: 'First Merge',
    quorum: 2,
    par: 130,
    driftPeriod: 4,
    spawnEvery: 24,
    map: [
      '###########',
      '#@..P.....#',
      '#....#....#',
      '#...M.P...#',
      '#..###....#',
      '#.....X...#',
      '###########',
    ],
  },

  // 2. Two Pads — two rooms with two merge pads; the route decides which pad.
  {
    name: 'Two Pads',
    quorum: 3,
    par: 170,
    driftPeriod: 3,
    spawnEvery: 22,
    map: [
      '#############',
      '#@....P.....#',
      '#.....#.....#',
      '#.M...#...P.#',
      '#.....#.....#',
      '#.....#.....#',
      '#..P..#.....#',
      '#.........X.#',
      '#############',
    ],
  },

  // 3. First Drift — one lazy drift patrols the middle row.
  {
    name: 'First Drift',
    quorum: 3,
    par: 180,
    driftPeriod: 3,
    spawnEvery: 22,
    map: [
      '#############',
      '#@..P.......#',
      '#...........#',
      '#..M..>..P..#',
      '#...........#',
      '#....###....#',
      '#..P.....X..#',
      '#.........P.#',
      '#############',
    ],
  },

  // 4. Patrol Lines — two drifts cross the hall; a hold gates the spawn.
  {
    name: 'Patrol Lines',
    quorum: 4,
    par: 240,
    driftPeriod: 3,
    spawnEvery: 20,
    map: [
      '###############',
      '#@....P...#...#',
      '#.####.#..#.P.#',
      '#.#...........#',
      '#.#..H..M.....#',
      '#....v.#......#',
      '#.##.#.#.##.#.#',
      '#....<.#..M...#',
      '#.##.#.#..#.#.#',
      '#..P........X.#',
      '###############',
    ],
  },

  // 5. Held Ground — the exit waits behind hold doors; drifts sweep the floor.
  {
    name: 'Held Ground',
    quorum: 4,
    par: 240,
    driftPeriod: 3,
    spawnEvery: 20,
    map: [
      '###############',
      '#@...P...P....#',
      '#.#########.M.#',
      '#.#.......#...#',
      '#..H.....H....#',
      '#.#..vv...#...#',
      '#.#########...#',
      '#....P....M...#',
      '#..H.......H..#',
      '#.........X.P.#',
      '###############',
    ],
  },

  // 6. Tightening — three drifts fault the fat hall into corridors.
  {
    name: 'Tightening',
    quorum: 5,
    par: 260,
    driftPeriod: 2,
    spawnEvery: 18,
    map: [
      '#################',
      '#@....P......>..#',
      '#.#####.#####.###',
      '#.#....P.....v..#',
      '#.#.##.#.####.#.#',
      '#....#...M..#...#',
      '###.#.#####..####',
      '#...P.....#....P#',
      '#.#######.#.###.#',
      '#........P..X...#',
      '#.####.####.###.#',
      '#..............<#',
      '#################',
    ],
  },

  // 7. Gatekeeper — hold doors ring the exit; the quorum has to land first.
  {
    name: 'Gatekeeper',
    quorum: 5,
    par: 280,
    driftPeriod: 2,
    spawnEvery: 18,
    map: [
      '#################',
      '#@........P....>#',
      '#.#####.###.#####',
      '#....P....v.....#',
      '#.........##H####',
      '#.........#...#.#',
      '#..M......#M.X.##',
      '#.........#...#.#',
      '#.........#####.#',
      '#............<..#',
      '#.P...M.........#',
      '#..P............#',
      '#################',
    ],
  },

  // 8. The Sweep — four drifts criss-cross a big open floor.
  {
    name: 'The Sweep',
    quorum: 6,
    par: 300,
    driftPeriod: 2,
    spawnEvery: 16,
    map: [
      '###################',
      '#@......P.....P...#',
      '#..##..###..##...M#',
      '#..#.v....#.v.....#',
      '#..#####.#####.##.#',
      '#.P.............>.#',
      '#...M....P........#',
      '#..#####.#####.##.#',
      '#..#.......#....P.#',
      '#..#.v.....#.v....#',
      '#..##..###..##....#',
      '#......P.....X....#',
      '###################',
    ],
  },

  // 9. Crossing Guards — hold doors split the floor; four drifts patrol.
  {
    name: 'Crossing Guards',
    quorum: 6,
    par: 320,
    driftPeriod: 2,
    spawnEvery: 16,
    map: [
      '###################',
      '#@....P..#..P..X..#',
      '#.####..##.#####.##',
      '#....#.....#.....<#',
      '#.##.#####.#.###.##',
      '#.#....M..H.......#',
      '#....v....#.....>.#',
      '#.##.#####.#.###.##',
      '#....#.....#...P..#',
      '###################',
    ],
  },

  // 10. Rush Hour — five drifts, no holds, thin refuges only.
  {
    name: 'Rush Hour',
    quorum: 7,
    par: 340,
    driftPeriod: 2,
    spawnEvery: 14,
    map: [
      '#####################',
      '#@....P....v.....P..#',
      '#..###.####..####.###',
      '#..M............^...#',
      '#..#####.####.#####.#',
      '#.P.....v.....M..<#.#',
      '#..#####.####.#####.#',
      '#........>..........#',
      '#..#####.####.#####.#',
      '#..M.............M..#',
      '#..###.####..####.###',
      '#.......<.......P.X.#',
      '#####################',
    ],
  },

  // 11. The Vault — hold doors guard the vault room; five drifts roam.
  {
    name: 'The Vault',
    quorum: 7,
    par: 360,
    driftPeriod: 2,
    spawnEvery: 14,
    map: [
      '#####################',
      '#@....P.....v.....P.#',
      '#..##.#####..#####.##',
      '#..#.v.....#....M...#',
      '#..#####.####.###.#.#',
      '#.P..........P....<.#',
      '#..#..###.###..######',
      '#..#.v....#..v.H.X.##',
      '#..#####.####..######',
      '#.....>....P........#',
      '#####################',
    ],
  },

  // 12. Finale — the whole swarm: six drifts, holds, a long quorum.
  {
    name: 'Finale',
    quorum: 8,
    par: 400,
    driftPeriod: 2,
    spawnEvery: 12,
    map: [
      '#######################',
      '#@....P.....v......P..#',
      '#..##.####..####.##..##',
      '#..#......M.........<.#',
      '#..#.v##.####.##.v.#..#',
      '#.P....H..M......X.H..#',
      '#..#.####.v.####.###..#',
      '#......^.....>........#',
      '#..##.####..####.##.#.#',
      '#.P....v......<....P..#',
      '#....................M#',
      '#######################',
    ],
  },
];

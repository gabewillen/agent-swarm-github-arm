// The shipped levels (DESIGN.md §10).
//
// Twelve valid definitions with distinct names, first to last in rising
// difficulty: the first two have no drift, levels 3-12 have drifts, and
// levels 6, 8, 10, and 12 gate regions behind hold doors ('H'). Every
// quorum is at most 20 and every par at least 30. Pure data: no imports,
// no side effects, plain JSON throughout.
//
// Design notes: the player must carry patches (up to 3) to a merge pad,
// reach quorum merges, and then leave through the exit. Hold doors only
// become passable once the quorum is met, and drifts can never cross
// them, so hold-gated rooms are calm endgame territory after a loud
// fetch phase. Merge pads sit off the natural shortest path so the route
// matters, and spawn points are spread so patches keep appearing.

export const LEVELS = [
  // 1. Open room, two spawn points, one merge pad. No drift.
  {
    name: 'First Merge',
    quorum: 2,
    par: 120,
    driftPeriod: 2,
    spawnEvery: 20,
    map: [
      '#########',
      '#@..P..M#',
      '#.......#',
      '#..P...X#',
      '#########',
    ],
  },

  // 2. A three-row switchback: patches and pads gate each stretch.
  {
    name: 'Corridor Run',
    quorum: 3,
    par: 200,
    driftPeriod: 2,
    spawnEvery: 18,
    map: [
      '###########',
      '#@P....M..#',
      '#########.#',
      '#M......P.#',
      '#.#########',
      '#..P....X.#',
      '###########',
    ],
  },

  // 3. One drift circuits the open hall; grab patches and dodge it.
  {
    name: 'Crossing Guard',
    quorum: 3,
    par: 200,
    driftPeriod: 3,
    spawnEvery: 18,
    map: [
      '#############',
      '#@..P...P...#',
      '#...........#',
      '#....>......#',
      '#.....M...P.#',
      '#...........#',
      '#..M..X.....#',
      '#############',
    ],
  },

  // 4. Two chambers join at one door; the drift guards the west one.
  {
    name: 'Twin Pads',
    quorum: 4,
    par: 240,
    driftPeriod: 2,
    spawnEvery: 16,
    map: [
      '###############',
      '#@..P.#....P..#',
      '#.....#..##...#',
      '#.>...#....M..#',
      '#........X...M#',
      '#.....#.##....#',
      '#..P..#....P..#',
      '###############',
    ],
  },

  // 5. Pillar breaks the hall in two; two drifts ride the ring.
  {
    name: 'The Windmill',
    quorum: 5,
    par: 260,
    driftPeriod: 2,
    spawnEvery: 16,
    map: [
      '###############',
      '#@.....P..<...#',
      '#.............#',
      '#.>....###..M.#',
      '#......###..P.#',
      '#.M....###....#',
      '#.............#',
      '#..P.......X..#',
      '###############',
    ],
  },

  // 6. A full row of hold doors seals the exit hall until the quorum
  // lands; a drift waits on the far side.
  {
    name: 'The Gate',
    quorum: 5,
    par: 280,
    driftPeriod: 2,
    spawnEvery: 14,
    map: [
      '#################',
      '#@..P.....P...M.#',
      '#...............#',
      '#.>..........<..#',
      '#...............#',
      '#HHHHHHHHHHHHHHH#',
      '#...............#',
      '#....P.....>....#',
      '#...............#',
      '#..............X#',
      '#################',
    ],
  },

  // 7. Vertical alleys feed two patrolled streets; drifts spill into
  // them and snap into conflicts.
  {
    name: 'Drift Alley',
    quorum: 6,
    par: 340,
    driftPeriod: 2,
    spawnEvery: 14,
    map: [
      '###################',
      '#@..P...M.....P...#',
      '####.#####.#####.##',
      '####v#####.#####v##',
      '####.#####.#####.##',
      '####.#####^#####.##',
      '####.#####.#####.##',
      '#.P.M....X..M.....#',
      '###################',
    ],
  },

  // 8. Four drifts ride the north field; everything south of the hold
  // row is quarantined until the quorum lands.
  {
    name: 'Hold the Line',
    quorum: 7,
    par: 400,
    driftPeriod: 2,
    spawnEvery: 12,
    map: [
      '#####################',
      '#@....P......P.....M#',
      '#.........P.........#',
      '#.>.......<.........#',
      '#...................#',
      '#.....^.......P.v...#',
      '#...................#',
      '#...................#',
      '#HHHHHHHHHHHHHHHHHHH#',
      '#..M..P..X....M.....#',
      '#####################',
    ],
  },

  // 9. A plus of pillars, five drifts, four corners to loot.
  {
    name: 'Crosswind',
    quorum: 8,
    par: 420,
    driftPeriod: 2,
    spawnEvery: 14,
    map: [
      '#####################',
      '#@..P.....M...P.....#',
      '#....^.........v....#',
      '#.>.......#.........#',
      '#.M.###...#...###.M.#',
      '#.........#......^..#',
      '#.v.......#.....P...#',
      '#......P...........X#',
      '#####################',
    ],
  },

  // 10. The exit sits in a sealed vault of holds; four drifts prowl the
  // courts around it.
  {
    name: 'The Vault',
    quorum: 9,
    par: 500,
    driftPeriod: 2,
    spawnEvery: 12,
    map: [
      '#######################',
      '#@...P.....P.....P....#',
      '#..>................<.#',
      '#..M...............M..#',
      '#.....................#',
      '#........HHHHH........#',
      '#..>.....H.X.H......<.#',
      '#........HHHHH........#',
      '#.....................#',
      '#..M...............M..#',
      '#..........v..........#',
      '#....P...........P....#',
      '#######################',
    ],
  },

  // 11. Six drifts; the storm hall is wide, the exits are far.
  {
    name: 'Storm Front',
    quorum: 12,
    par: 560,
    driftPeriod: 2,
    spawnEvery: 12,
    map: [
      '#####################',
      '#@..P...M..P....P...#',
      '#..>.........<......#',
      '#.....v........^....#',
      '#...................#',
      '#...P....M......P...#',
      '#.........M.........#',
      '#.>...............<.#',
      '#..................X#',
      '#..P......M.....P...#',
      '#####################',
    ],
  },

  // 12. The finale: pillared hall, eight drifts, and three gated
  // rooms behind hold bands, with the exit in the last one.
  {
    name: 'Master Courier',
    quorum: 15,
    par: 720,
    driftPeriod: 2,
    spawnEvery: 12,
    map: [
      '#########################',
      '#@....P.......M....P....#',
      '#..v.....#.......#...v..#',
      '#.>......#..^....#......#',
      '#........#.......#......#',
      '#..........M............#',
      '#.......M....P..........#',
      '#.>...............<.....#',
      '#..^..........v.........#',
      '#HHHHH###HHHHHH####HHHHH#',
      '#..M..###...M..####..X..#',
      '#.P...###......####.....#',
      '#########################',
    ],
  },
];

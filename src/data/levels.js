// Quorum Run — the shipped levels (DESIGN.md §10).
//
// Thirteen levels, first to last in rising difficulty: the first carries
// no drift at all, eleven carry drifts as hazards, and six use hold doors
// to gate a region until the quorum lands. Quorums rise from 2 to 12 and
// every level keeps at least one merge pad outside its holds so the
// quorum can always land. Every level keeps the §4 shape: closed
// borders, one player start, one exit, at least one merge pad and spawn
// point, and every feature reachable from the start.

export const LEVELS = [
  // 1 — pickup, merge, ship. No drifts.
  {
    name: 'First merge', quorum: 2, par: 120, driftPeriod: 2, spawnEvery: 20,
    map: [
      '#############',
      '#..P.....M..#',
      '#.@.......X.#',
      '#..#..P..M..#',
      '#############',
    ],
  },

  // 2 — two pockets, still no drifts.
  {
    name: 'A second pocket', quorum: 3, par: 150, driftPeriod: 2, spawnEvery: 20,
    map: [
      '###############',
      '#..P..#..M..X.#',
      '#.@...#.......#',
      '#.....#..P....#',
      '#..M..#..#....#',
      '#.............#',
      '###############',
    ],
  },

  // 3 — the first drift, slow.
  {
    name: 'First sentry', quorum: 3, par: 150, driftPeriod: 3, spawnEvery: 20,
    map: [
      '###############',
      '#.@...P....X..#',
      '#....#####....#',
      '#.M...........#',
      '#....###......#',
      '#..P.....>..M.#',
      '###############',
    ],
  },

  // 4 — two sentries; the rooms join at the open middle row.
  {
    name: 'Twin patrols', quorum: 3, par: 170, driftPeriod: 2, spawnEvery: 18,
    map: [
      '#################',
      '#.@..#..P...#..X#',
      '#....#.M....#...#',
      '#.v..#......#.v.#',
      '#....#..P...#...#',
      '#...............#',
      '#.M..#......#P..#',
      '#....#......#...#',
      '#################',
    ],
  },

  // 5 — the yard holds a merge pad and the exit behind the hold; one pad
  // sits outside it so the quorum can land first.
  {
    name: 'Hold the yard', quorum: 4, par: 180, driftPeriod: 2, spawnEvery: 18,
    map: [
      '###################',
      '#.@........#..P...#',
      '#...P...M.........#',
      '#........>.#..M...#',
      '######H############',
      '#..............X..#',
      '#..P..............#',
      '#.........M.......#',
      '###################',
    ],
  },

  // 6 — two holds gate the way down; drifts walk the bands between them.
  {
    name: 'Two gates', quorum: 4, par: 190, driftPeriod: 2, spawnEvery: 16,
    map: [
      '#####################',
      '#.@..P...#..........#',
      '#.......P#.....>....#',
      '#.........M...M.....#',
      '##########H##########',
      '#..v.........v......#',
      '#.M......P......M...#',
      '###########H#########',
      '#.....P.............#',
      '#........X..........#',
      '#####################',
    ],
  },

  // 7 — one long hall under three little rooms.
  {
    name: 'The long hall', quorum: 5, par: 200, driftPeriod: 2, spawnEvery: 16,
    map: [
      '#######################',
      '#.@..P..#.....#....P..#',
      '#.......#..M..#.......#',
      '#..M....#..v..#....P..#',
      '#.......#.....#..M....#',
      '#.....................#',
      '#..>.........<........#',
      '#..P...#.....#..X.....#',
      '#######################',
    ],
  },

  // 8 — fast crossfire in a pillar field.
  {
    name: 'Crossfire', quorum: 5, par: 210, driftPeriod: 1, spawnEvery: 14,
    map: [
      '#########################',
      '#.@....#........P.......#',
      '#......#.M......#..M...##',
      '#..P...#........#.......#',
      '#......#........#.......#',
      '#..v....................#',
      '#.....P.......<.........#',
      '#......#..v.....#..M....#',
      '#....M.......P..........#',
      '#.....................X.#',
      '#########################',
    ],
  },

  // 9 — the vault holds the exit behind a pair of hold doors.
  {
    name: 'Vault door', quorum: 6, par: 220, driftPeriod: 2, spawnEvery: 14,
    map: [
      '#######################',
      '#.@...#.........>.....#',
      '#..P..#....M..........#',
      '#.....P...............#',
      '#########HH############',
      '#.........M...........#',
      '#..>..................#',
      '#.....P..........X....#',
      '#..........P..........#',
      '#######################',
    ],
  },

  // 10 — five fast drifts patrol an open minefield.
  {
    name: 'Minefield', quorum: 7, par: 230, driftPeriod: 1, spawnEvery: 14,
    map: [
      '###########################',
      '#.@....#....P.....#.......#',
      '#......#..........#...v...#',
      '#..M...#....##....#.......#',
      '#......#..........#..M....#',
      '#..v...#....P.....#.......#',
      '#......................P..#',
      '#...#....#..>....#...#....#',
      '#...#....#.......#...#..M.#',
      '#..P#....#...v...#...#....#',
      '#........#.......#........#',
      '#....M...............X....#',
      '###########################',
    ],
  },

  // 11 — three rooms, two holds, a gauntlet of drifts between them.
  // 11 — three bands behind two hold doors; a drift gauntlet in between.
  {
    name: 'The gauntlet', quorum: 8, par: 240, driftPeriod: 1, spawnEvery: 12,
    map: [
      '#############################',
      '#.@...P..........M..........#',
      '#.........v...P....v........#',
      '#..M.........v..............#',
      '#......P............M.......#',
      '#############H###############',
      '#.......v...........v.......#',
      '#..........P................#',
      '#....M..........M...........#',
      '#........v...........v..P...#',
      '##############H##############',
      '#....P..........M...........#',
      '#...........................#',
      '#..M.....P.......X.......M..#',
      '#############################',
    ],
  },

  // 12 — the deep vault: three holds between four halls of drifts.
  // 12 — four halls behind two hold doors; spawns and pads in every band.
  {
    name: 'Deep vault', quorum: 9, par: 250, driftPeriod: 2, spawnEvery: 12,
    map: [
      '###############################',
      '#.@.......#.........#.........#',
      '#.........#...P.....#.....M...#',
      '#...M.....#.........#.........#',
      '#.........#...v.....#......v..#',
      '#.............................#',
      '##########HH###################',
      '#.........#.....P...#.........#',
      '#...>.....#.........#.........#',
      '#.........#.........#.........#',
      '#..M......#.........#.........#',
      '#.............................#',
      '###################HH##########',
      '#.........#...v.....#.........#',
      '#..P......#.........#....M....#',
      '#.................X...........#',
      '###############################',
    ],
  },

  // 13 — the last stand: drifts and holds everywhere.
  // 13 — the last stand: two hold doors into a fast pillored melee.
  {
    name: 'Last stand', quorum: 12, par: 260, driftPeriod: 1, spawnEvery: 12,
    map: [
      '################################',
      '#.@....#..M....#..P.....#......#',
      '#..v...#.......#.v......#..M...#',
      '#..............................#',
      '#..M...#...P...#........#..P...#',
      '#......#.......#....v...#......#',
      '##########HH############HH######',
      '#..P...#..v....#.M......#......#',
      '#......#.......#........#...P..#',
      '#..............................#',
      '#..M...#..v....#........#...P..#',
      '#......#.......#....X...#......#',
      '################################',
    ],
  },
];

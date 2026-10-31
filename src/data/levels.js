// The shipped levels (DESIGN.md §10).
//
// Twelve levels, first to last in rising difficulty: the first has no
// drift, eight have drifts, and Borders six gate regions with hold doors.
// Every merge pad is reachable with the holds closed, so no level can
// dead-end before the quorum lands; exits sit in the open or behind a
// hold gate, and pars are generous but shrink the time bonus as they grow.
//
// Export LEVELS.

export const LEVELS = [
  {
    name: 'First merge', quorum: 2, par: 100, driftPeriod: 2, spawnEvery: 14,
    map: [
      '#########',
      '#@...P.M#',
      '#.......#',
      '#......X#',
      '#########',
    ],
  },
  {
    name: 'Long haul', quorum: 3, par: 160, driftPeriod: 2, spawnEvery: 12,
    map: [
      '#####################',
      '#@..P....M....P...X.#',
      '#####################',
    ],
  },
  {
    name: 'Cornered', quorum: 3, par: 120, driftPeriod: 2, spawnEvery: 14,
    map: [
      '##########',
      '#@..P..M.#',
      '#........#',
      '#.>.....X#',
      '##########',
    ],
  },
  {
    name: 'Gatehouse', quorum: 3, par: 150, driftPeriod: 2, spawnEvery: 14,
    map: [
      '###########',
      '#@..P.M.H.#',
      '#..P..#..X#',
      '###########',
    ],
  },
  {
    name: 'Patrol lines', quorum: 4, par: 150, driftPeriod: 2, spawnEvery: 12,
    map: [
      '###########',
      '#..v...P..#',
      '#.@.M.....#',
      '#...^..P.X#',
      '###########',
    ],
  },
  {
    name: 'The vault', quorum: 5, par: 170, driftPeriod: 2, spawnEvery: 12,
    map: [
      '#############',
      '#@..P.M..#..#',
      '#.....HH...X#',
      '#...P..M.#..#',
      '#############',
    ],
  },
  {
    name: 'Crossfire', quorum: 4, par: 140, driftPeriod: 2, spawnEvery: 10,
    map: [
      '###########',
      '#v.......<#',
      '#.@.M..P..#',
      '#.>....P..#',
      '#.......X.#',
      '###########',
    ],
  },
  {
    name: 'The maze', quorum: 6, par: 200, driftPeriod: 3, spawnEvery: 12,
    map: [
      '###############',
      '#@....#....P..#',
      '#.###.#.####..#',
      '#.#...#....#..#',
      '#.#.#####..#..#',
      '#...#...#..#.M#',
      '###.#.#.##.#.##',
      '#P....#.>..X..#',
      '###############',
    ],
  },
  {
    name: 'Gauntlet', quorum: 6, par: 200, driftPeriod: 2, spawnEvery: 10,
    map: [
      '###################',
      '#@.P...M.#......HX#',
      '#........#..>M...##',
      '#........#......v.#',
      '#.P..........>#P..#',
      '#...........P.....#',
      '###################',
    ],
  },
  {
    name: 'Deep run', quorum: 8, par: 240, driftPeriod: 2, spawnEvery: 10,
    map: [
      '#######################',
      '#@.........#....#.....#',
      '#.P..v.....#.P.....P..#',
      '#..........#.>........#',
      '#...................#.#',
      '#....##.M...........HX#',
      '#..........#........#.#',
      '#..........#....<.....#',
      '#......^...#..P.......#',
      '#..P.......#.M.......P#',
      '#######################',
    ],
  },
  {
    name: 'Deadlock', quorum: 10, par: 280, driftPeriod: 2, spawnEvery: 8,
    map: [
      '#####################',
      '#@..#..>..#.........#',
      '#...#.....#...##...^#',
      '#.P..###..#....#....#',
      '#...........P....>..#',
      '#.v.....P.#...#.P...#',
      '#..#..M...#.M.......#',
      '#...................#',
      '#.......###.....###.#',
      '#..<...............H#',
      '#.....#.....###...###',
      '#................P.X#',
      '#####################',
    ],
  },
  {
    name: 'Quorum run', quorum: 16, par: 320, driftPeriod: 3, spawnEvery: 8,
    map: [
      '#########################',
      '#@......>...#.P.........#',
      '#......#..P.#.......#.#H#',
      '#..P...#.........#...####',
      '#.........P.#....#....#X#',
      '#...........#...>#...#P.#',
      '#.v.##......#......M....#',
      '#.......................#',
      '#...<..........##.......#',
      '#....M...###............#',
      '#..P....................#',
      '#.............M.P.......#',
      '#.......#.........#..P..#',
      '#.........^..#......<...#',
      '#########################',
    ],
  },
];

// The shipped levels (DESIGN.md §10).
//
// At least ten valid definitions, distinct names, first to last in rising
// difficulty: 1 has no drift, everything from 2 on patrols, and hold
// doors gate a region in 4, 5, 6, 8, 10 and 12. Quorum at most 20, par at
// least 30. Layout rules of thumb:
//   - corridors and pockets so a drift can be dodged or timed,
//   - holds that open only on quorum (walls until then, and drifts can
//     never cross them, so held-off ground is drift-free),
//   - one merge pad per level, placed so the pickup-to-merge route is the
//     level itself, and the exit sits on the far side of the journey.
//
// Cells (§4): # wall, . floor, @ player start, P patch spawn, M merge pad,
// X exit, H hold door, ^ > v < drift starts (up, right, down, left).

export const LEVELS = [
  // 1 — an open yard, no drifts: learn pickup, merge, ship.
  {
    name: 'First merge', quorum: 3, par: 140, driftPeriod: 2, spawnEvery: 20,
    map: [
      '###############',
      '#@....P.......#',
      '#.............#',
      '#..P...M...P..#',
      '#.............#',
      '#.......X.....#',
      '###############',
    ],
  },

  // 2 — a ring corridor around a solid block; one drift laps it.
  {
    name: 'The roundabout', quorum: 3, par: 150, driftPeriod: 2, spawnEvery: 18,
    map: [
      '#################',
      '#@...M.....>...P#',
      '#.#############.#',
      '#.#############.#',
      '#.#############.#',
      '#......P...X....#',
      '#################',
    ],
  },

  // 3 — three lanes; two drifts face off down the middle one.
  {
    name: 'Twin patrol', quorum: 4, par: 150, driftPeriod: 2, spawnEvery: 18,
    map: [
      '#################',
      '#@............P.#',
      '######.##########',
      '#P.......>.<....#',
      '###.########.####',
      '#.P....M......X.#',
      '#################',
    ],
  },

  // 4 — a courtyard around a gatehouse: the exit hides behind a hold
  // door, and one drift rides the perimeter.
  {
    name: 'The gatehouse', quorum: 4, par: 160, driftPeriod: 2, spawnEvery: 18,
    map: [
      '###############',
      '#@..P.M..P....#',
      '#.............#',
      '#...###H###...#',
      '#...###X###...#',
      '#..P.......P..#',
      '###############',
    ],
  },

  // 5 — two plazas split by a cross-wall with a single hold door;
  // the merge pad and exit live south, half the patches north.
  {
    name: 'Cross current', quorum: 5, par: 160, driftPeriod: 2, spawnEvery: 16,
    map: [
      '#################',
      '#@....P.....P...#',
      '#...............#',
      '#....>......<...#',
      '########H########',
      '#.......X.......#',
      '#.P.....M.......#',
      '#...............#',
      '#.........v...P.#',
      '#################',
    ],
  },

  // 6 — a storehouse of shelf walls; drifts ride the aisles; the
  // exit wing opens through a hold door on the east wall.
  {
    name: 'Storehouse', quorum: 6, par: 170, driftPeriod: 2, spawnEvery: 16,
    map: [
      '#####################',
      '#@..................#',
      '#..#..#..#..#..#....#',
      '#..P..#.....#..#....#',
      '#..#..#..#..#..#.####',
      '#........M.......H.X#',
      '#..#..#..#..#..#.####',
      '#..#..P..#..P..#....#',
      '#..#..#..#..#..#....#',
      '#...........<.......#',
      '#####################',
    ],
  },

  // 7 — four tight lanes, a drift duel in lane 3, no room to spare.
  {
    name: 'The gauntlet', quorum: 6, par: 170, driftPeriod: 2, spawnEvery: 15,
    map: [
      '###################',
      '#@......M.......P.#',
      '####.#########.####',
      '#.......>..<....P.#',
      '##.########.#######',
      '#P.......M......P.#',
      '######.############',
      '#.P..........<...X#',
      '###################',
    ],
  },

  // 8 — a thick wall with two hold doors in series; the exit waits
  // east, drifting.
  {
    name: 'Double gates', quorum: 7, par: 180, driftPeriod: 2, spawnEvery: 15,
    map: [
      '#####################',
      '#@.....P..###.......#',
      '#..>......###.......#',
      '#..P.M....###.......#',
      '#.........###.......#',
      '#...P.....H.H...X...#',
      '#.........###.<.....#',
      '#..P......###.......#',
      '#.........###.......#',
      '#>...P....###.......#',
      '#####################',
    ],
  },

  // 9 — a spiral of two loops around a centre strip: the merge pad
  // sits at the heart, two drifts ride the loops.
  {
    name: 'The spiral', quorum: 8, par: 190, driftPeriod: 2, spawnEvery: 15,
    map: [
      '###################',
      '#@.>.............X#',
      '#.#######.#######.#',
      '#.#......>..P...#.#',
      '#.#.###########.#.#',
      '#.#.#P...M...P#.#.#',
      '#.#.######.####.#.#',
      '#.#.....P.......#.#',
      '#.###############.#',
      '#.................#',
      '###################',
    ],
  },

  // 10 — a vault boarded on four sides by hold doors, drifts on
  // every plaza between you and it.
  {
    name: 'Vault of four', quorum: 9, par: 200, driftPeriod: 2, spawnEvery: 14,
    map: [
      '#####################',
      '#@...P..........P...#',
      '#..>.............<..#',
      '#...................#',
      '#........#H#........#',
      '#...M....HXH........#',
      '#........#H#........#',
      '#...................#',
      '#..>.............<..#',
      '#...P...........P...#',
      '#####################',
    ],
  },

  // 11 — rush hour: six drifts share a busy plaza of pillars.
  {
    name: 'Commuter rush', quorum: 10, par: 210, driftPeriod: 2, spawnEvery: 14,
    map: [
      '#####################',
      '#@....P.....M.......#',
      '#..#.....#.....#....#',
      '#P.....>.....<....P.#',
      '#..#.....#.....#....#',
      '#......v.....^......#',
      '#..#.....#.....#....#',
      '#....P............P.#',
      '#..#.....#.....#....#',
      '#..>......<.......X.#',
      '#####################',
    ],
  },

  // 12 — the finale: four wards around a spine, the exit pocket
  // behind a hold door, six drifts working the wards.
  {
    name: 'The quorum', quorum: 12, par: 240, driftPeriod: 2, spawnEvery: 12,
    map: [
      '#######################',
      '#@....P....#.....P....#',
      '#..>.......#.....<....#',
      '#....M.....H..........#',
      '#..P....<..#..........#',
      '#..........##.........#',
      '##.#####.#.HX#.#####.##',
      '#..........##.........#',
      '#.>........#....v.....#',
      '#..........#..........#',
      '#.P......<.#...P......#',
      '#..........#..........#',
      '#######################',
    ],
  },
];

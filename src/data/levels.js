// §10: the shipped levels, first to last in rising difficulty. The first has
// no drift; more than six have drifts; several use hold doors to gate a
// region behind the quorum merge.
export const LEVELS = [
  // 1 — a quiet room: two patches, two pads, and the exit.
  {
    name: 'First merge',
    quorum: 2,
    par: 80,
    driftPeriod: 2,
    spawnEvery: 15,
    map: [
      '##########',
      '#@...P.M.#',
      '#P.......#',
      '#....M..X#',
      '##########',
    ],
  },

  // 2 — a lone drift wanders the middle.
  {
    name: 'Warm hands',
    quorum: 2,
    par: 90,
    driftPeriod: 2,
    spawnEvery: 12,
    map: [
      '##########',
      '#@..P...M#',
      '#........#',
      '#..P...X.#',
      '#....^...#',
      '##########',
    ],
  },

  // 3 — a hold door gates the exit room; a drift patrols behind it.
  {
    name: 'The gate',
    quorum: 3,
    par: 140,
    driftPeriod: 2,
    spawnEvery: 12,
    map: [
      '###########',
      '#@.PP.M...#',
      '#####H#####',
      '#..X......#',
      '#.>.......#',
      '###########',
    ],
  },

  // 4 — two pads on opposite corners, two slow drifts.
  {
    name: 'Two pads',
    quorum: 3,
    par: 160,
    driftPeriod: 2,
    spawnEvery: 12,
    map: [
      '##########',
      '#@.P.....#',
      '#.M....P.#',
      '#..M..^..#',
      '#.>....X.#',
      '##########',
    ],
  },

  // 5 — a crowded crossing; the exit behind a hold door.
  {
    name: 'Crossroads',
    quorum: 4,
    par: 200,
    driftPeriod: 2,
    spawnEvery: 14,
    map: [
      '###########',
      '#@.P...P..#',
      '#.M.....>.#',
      '#....^....#',
      '#.<.....P.#',
      '#....H....#',
      '#...X.....#',
      '###########',
    ],
  },

  // 6 — a hall of one's own: harvest safe above, dodge a drift below.
  {
    name: 'Bounce hall',
    quorum: 5,
    par: 240,
    driftPeriod: 2,
    spawnEvery: 10,
    map: [
      '############',
      '#@.P..P...M#',
      '#####H######',
      '#......X..>#',
      '#..........#',
      '############',
    ],
  },

  // 7 — four drifts in an open arena, moving every tick.
  {
    name: 'Crossfire',
    quorum: 6,
    par: 280,
    driftPeriod: 1,
    spawnEvery: 12,
    map: [
      '#############',
      '#@..P....M..#',
      '#........^..#',
      '#.P...X.....#',
      '#...........#',
      '#v......>..<#',
      '#############',
    ],
  },

  // 8 — two hold doors gate the lower room; a drift patrols it.
  {
    name: 'Double gate',
    quorum: 7,
    par: 320,
    driftPeriod: 2,
    spawnEvery: 12,
    map: [
      '##############',
      '#@..P....P...#',
      '######H####H##',
      '#...M.....M..#',
      '#.P...X......#',
      '#...>........#',
      '##############',
    ],
  },

  // 9 — pillars, three drifts, a big quorum to grind out.
  {
    name: 'Pillar field',
    quorum: 9,
    par: 360,
    driftPeriod: 2,
    spawnEvery: 10,
    map: [
      '##############',
      '#@..P.#.P.v..#',
      '#.....#..#...#',
      '#..P...#.....#',
      '#M...#.#.X...#',
      '#.>.......<..#',
      '##############',
    ],
  },

  // 10 — counterflow lanes of fast drifts.
  {
    name: 'Counterflow',
    quorum: 11,
    par: 420,
    driftPeriod: 1,
    spawnEvery: 10,
    map: [
      '##############',
      '#@...P.....P.#',
      '#.>..M....>..#',
      '#............#',
      '#.<...M...<..#',
      '#..........X.#',
      '#..P....P....#',
      '##############',
    ],
  },

  // 11 — two regions over a single hold door; six drifts; a great ledger.
  {
    name: 'Endgame ledger',
    quorum: 15,
    par: 500,
    driftPeriod: 2,
    spawnEvery: 8,
    map: [
      '####################',
      '#@..P.M....#....P..#',
      '#.P........#..M....#',
      '#..........#.......#',
      '#.v........#..P....#',
      '#.........>#......M#',
      '#...^......H...v...#',
      '#..........#....M..#',
      '#..P.......#.....P.#',
      '#..........#..<....#',
      '#>.........#....P..#',
      '#..........#.....X.#',
      '####################',
    ],
  },
];

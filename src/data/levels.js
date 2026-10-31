// Quorum Run — the shipped levels (DESIGN.md §10).
//
// LEVELS holds the campaign: twelve definitions, first to last in rising
// difficulty — no drifts at first, drift patrols and hold-gated regions
// later. Every definition validates against DESIGN.md §4 and loads with
// init(). Patches respawn at free spawn points, so a level is winnable
// whenever its spawn points can be reached and its merge pad is reachable:
// quorum patches can be fetched, merged, and hauled to the exit in time.

export const LEVELS = [
  // Level 1: no drift. Pick up, merge, ship.
  {
    name: 'First merge',
    quorum: 1,
    par: 90,
    driftPeriod: 2,
    spawnEvery: 20,
    map: ['#######', '#@P.M.#', '#.....#', '#..X..#', '#######'],
  },

  // Level 2: no drift, two merges needed, two pads and two points.
  {
    name: 'Second shift',
    quorum: 2,
    par: 140,
    driftPeriod: 2,
    spawnEvery: 22,
    map: ['#########', '#@P...PM#', '#..M..X.#', '#.......#', '#########'],
  },

  // Level 3: no drift, three merges across a wider yard.
  {
    name: 'Three is a quorum',
    quorum: 3,
    par: 200,
    driftPeriod: 2,
    spawnEvery: 18,
    map: [
      '###########',
      '#@.....P..#',
      '#.P..M....#',
      '#....M..X.#',
      '#..P......#',
      '#.........#',
      '###########',
    ],
  },

  // Level 4: one drift patrols the lane under the exit.
  {
    name: 'Lane watch',
    quorum: 2,
    par: 160,
    driftPeriod: 3,
    spawnEvery: 20,
    map: ['#########', '#@..P.M.#', '#.......#', '#..>.X..#', '#...P...#', '#########'],
  },

  // Level 5: the exit hides behind a hold door; a drift roams below.
  {
    name: 'Gatekeeper',
    quorum: 2,
    par: 170,
    driftPeriod: 3,
    spawnEvery: 18,
    map: [
      '###########',
      '#@P.M.....#',
      '#....H....#',
      '#.v..X..P.#',
      '#.........#',
      '###########',
    ],
  },

  // Level 6: two drifts round an obstacle course.
  {
    name: 'Corridor patrol',
    quorum: 3,
    par: 240,
    driftPeriod: 3,
    spawnEvery: 16,
    map: [
      '############',
      '#@...M....>#',
      '#..........#',
      '#....#.....#',
      '#.P..#..X..#',
      '#<.........#',
      '#..P.#.....#',
      '############',
    ],
  },

  // Level 7: two hold doors and a drift below the crossing.
  {
    name: 'Double gate',
    quorum: 4,
    par: 240,
    driftPeriod: 3,
    spawnEvery: 14,
    map: [
      '###########',
      '#@.P.H.M..#',
      '#.....H...#',
      '#..P......#',
      '#.....v...#',
      '#....X....#',
      '###########',
    ],
  },

  // Level 8: a hall of crossing drifts, holds at both doors.
  {
    name: 'Crossfire',
    quorum: 5,
    par: 300,
    driftPeriod: 2,
    spawnEvery: 12,
    map: [
      '#############',
      '#@..M..H....#',
      '#...........#',
      '#....^..v...#',
      '#...........#',
      '#..P....H...#',
      '#....P..X...#',
      '#############',
    ],
  },

  // Level 9: two yards bridged by hold doors only; a drift below.
  {
    name: 'Vaulted yard',
    quorum: 6,
    par: 320,
    driftPeriod: 3,
    spawnEvery: 10,
    map: [
      '############',
      '#@.P.#M..P.#',
      '#....H.....#',
      '#.v..#.....#',
      '#..P.H..X..#',
      '#....#.....#',
      '############',
    ],
  },

  // Level 10: the long haul across patrol rows.
  {
    name: 'Long haul',
    quorum: 8,
    par: 400,
    driftPeriod: 2,
    spawnEvery: 12,
    map: [
      '################',
      '#@...P....P....#',
      '#..H.....H.....#',
      '#.....M........#',
      '#..............#',
      '#.P....v....P..#',
      '#....>....^....#',
      '#........X.....#',
      '################',
    ],
  },

  // Level 11: a walled compound held by doors, one risky gap.
  {
    name: 'The compound',
    quorum: 12,
    par: 460,
    driftPeriod: 2,
    spawnEvery: 10,
    map: [
      '##################',
      '#@P..H.....P.....#',
      '#....#...........#',
      '#..M.#....v......#',
      '#....H...........#',
      '#....#......^....#',
      '#..P.#....M...X..#',
      '#....H...........#',
      '#......P.........#',
      '##################',
    ],
  },

  // Level 12: the gauntlet — four drifts, many loads to merge.
  {
    name: 'The gauntlet',
    quorum: 18,
    par: 520,
    driftPeriod: 2,
    spawnEvery: 8,
    map: [
      '####################',
      '#@....M...P....P...#',
      '#..................#',
      '#...^.v....<...>...#',
      '#..................#',
      '#....M.....M..X....#',
      '#..P....P..........#',
      '####################',
    ],
  },
];

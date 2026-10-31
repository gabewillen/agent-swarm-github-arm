// The shipped campaign (DESIGN.md §10): at least ten valid levels, first to
// last in rising difficulty. The first has no drift, most later ones patrol
// with drifts, and four gate their merge pads or exits behind hold doors.
// Every level has enough spawn points to be won; quorums stay at most 20 and
// pars at least 30.

export const LEVELS = [
  {
    name: 'First merge', quorum: 2, par: 100, driftPeriod: 2, spawnEvery: 16,
    map: [
      '###########',
      '#@........#',
      '#..P..P...#',
      '#....M..X.#',
      '###########',
    ],
  },
  {
    name: 'The patrol', quorum: 3, par: 110, driftPeriod: 2, spawnEvery: 14,
    map: [
      '###########',
      '#@....>...#',
      '#.P...P..M#',
      '#....^....#',
      '#..X......#',
      '###########',
    ],
  },
  {
    name: 'Hold the gate', quorum: 3, par: 120, driftPeriod: 2, spawnEvery: 12,
    map: [
      '###########',
      '#@...H....#',
      '#..P.#.M..#',
      '#....#..X.#',
      '#.P..#....#',
      '###########',
    ],
  },
  {
    name: 'The yard', quorum: 4, par: 140, driftPeriod: 2, spawnEvery: 12,
    map: [
      '###########',
      '#@>...#...#',
      '#.P..#..P.#',
      '#....#....#',
      '#..M.H.>X.#',
      '#....#....#',
      '###########',
    ],
  },
  {
    name: 'Windswept', quorum: 4, par: 150, driftPeriod: 2, spawnEvery: 12,
    map: [
      '###########',
      '#@.P...v..#',
      '#....>.P..#',
      '#.M.......#',
      '#.....H...#',
      '#..P...X..#',
      '###########',
    ],
  },
  {
    name: 'Crossing', quorum: 5, par: 160, driftPeriod: 2, spawnEvery: 12,
    map: [
      '#############',
      '#@....v.....#',
      '#.P..P.P..M.#',
      '#...........#',
      '#.....v.....#',
      '#..P..P...X.#',
      '#############',
    ],
  },
  {
    name: 'The vault', quorum: 5, par: 170, driftPeriod: 2, spawnEvery: 10,
    map: [
      '###########',
      '#@..P..>..#',
      '#....##...#',
      '#.##.H.##.#',
      '#....##...#',
      '#.P.M..PX.#',
      '###########',
    ],
  },
  {
    name: 'Gauntlet', quorum: 6, par: 200, driftPeriod: 1, spawnEvery: 10,
    map: [
      '#############',
      '#..P.#..P..M#',
      '#@..>.v..>..#',
      '#.P..#..P...#',
      '#...........#',
      '#..P.#..P..X#',
      '#############',
    ],
  },
  {
    name: 'Cold loops', quorum: 8, par: 220, driftPeriod: 1, spawnEvery: 10,
    map: [
      '#############',
      '#@..P....H..#',
      '#.>..P.#..M.#',
      '#....v.#..X.#',
      '#.P..P.#....#',
      '#......#..P.#',
      '#############',
    ],
  },
  {
    name: 'Deep quorum', quorum: 10, par: 240, driftPeriod: 1, spawnEvery: 8,
    map: [
      '#############',
      '#@...#...H..#',
      '#.P..#M..X..#',
      '#..>.H...P..#',
      '#.P..#.>....#',
      '#....#.....>#',
      '#..P.#..P...#',
      '#############',
    ],
  },
];

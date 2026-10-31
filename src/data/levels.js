// Quorum Run shipped levels (DESIGN.md §10): first to last in rising
// difficulty. The first level has no drift; drifts and hold doors join in
// as the campaign goes on. Quorums stay at most 20; pars at least 30.

export const LEVELS = [
  {
    name: 'First merge', quorum: 2, par: 120, driftPeriod: 2, spawnEvery: 20,
    map: [
      '#########',
      '#@..P.M.#',
      '#..P..X.#',
      '#.P.....#',
      '#########',
    ],
  },
  {
    name: 'Two corners', quorum: 2, par: 140, driftPeriod: 2, spawnEvery: 16,
    map: [
      '##########',
      '#@.P..M.X#',
      '#.#####..#',
      '#P...>.<.#',
      '##########',
    ],
  },
  {
    name: 'The gate', quorum: 3, par: 150, driftPeriod: 2, spawnEvery: 16,
    map: [
      '#########',
      '#@P.M..H#',
      '#.....#X#',
      '#.P....##',
      '#########',
    ],
  },
  {
    name: 'Toll booth', quorum: 3, par: 160, driftPeriod: 2, spawnEvery: 14,
    map: [
      '##########',
      '#@P.M.>.<#',
      '#.#####H##',
      '#....P#X##',
      '##########',
    ],
  },
  {
    name: 'Crossfire', quorum: 4, par: 170, driftPeriod: 2, spawnEvery: 14,
    map: [
      '##########',
      '#@P..MHX##',
      '#..v..####',
      '#.P...<..#',
      '##########',
    ],
  },
  {
    name: 'Patrol', quorum: 5, par: 180, driftPeriod: 2, spawnEvery: 12,
    map: [
      '#########',
      '#@P.M.X.#',
      '#......>#',
      '#.<....v#',
      '#.P....<#',
      '#########',
    ],
  },
  {
    name: 'Two gates', quorum: 6, par: 190, driftPeriod: 2, spawnEvery: 12,
    map: [
      '###########',
      '#@P.M..HX##',
      '#......####',
      '#.H...<...#',
      '#..v.M....#',
      '###########',
    ],
  },
  {
    name: 'Watchmen', quorum: 7, par: 200, driftPeriod: 2, spawnEvery: 12,
    map: [
      '###########',
      '#@P.M..H^.#',
      '#.v....#X##',
      '#>....<.###',
      '#P...M..###',
      '###########',
    ],
  },
  {
    name: 'Hold court', quorum: 9, par: 220, driftPeriod: 2, spawnEvery: 12,
    map: [
      '###########',
      '#@P.M...H##',
      '#......#X##',
      '#.P....####',
      '#..v.M...>#',
      '#P..#.M...#',
      '###########',
    ],
  },
  {
    name: 'Quorum rush', quorum: 12, par: 260, driftPeriod: 2, spawnEvery: 12,
    map: [
      '#############',
      '#@P.M.H...M.#',
      '#.v.#.##.#v.#',
      '#....<.#H..##',
      '#.>.#.#.#X.##',
      '#P..#...#.v.#',
      '#############',
    ],
  },
];

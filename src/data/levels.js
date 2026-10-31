// Quorum Run's shipped levels (DESIGN.md §10): at least ten valid
// definitions, distinct names, first to last in rising difficulty. The
// first level has no drift; most later ones patrol, and several gate the
// exit behind hold doors. Every level owns at least `quorum` spawn points,
// so it can be shipped from the patches it starts with; pars come from the
// optimistic solver in dev/level-harness.mjs, padded for dodging drifts.

export const LEVELS = [
  // 1: no drift. Pick up a patch on the way, merge, ship.
  {
    name: 'First merge', quorum: 1, par: 30, driftPeriod: 2, spawnEvery: 20,
    map: [
      '###########',
      '#@..P.....#',
      '#.........#',
      '#...M.....#',
      '#.........#',
      '#....X....#',
      '###########',
    ],
  },

  // 2: no drift, but the quorum takes two patches from two corners.
  {
    name: 'Two hands', quorum: 2, par: 30, driftPeriod: 2, spawnEvery: 20,
    map: [
      '#############',
      '#@..P....M..#',
      '#...........#',
      '#..P.....X..#',
      '#...........#',
      '#############',
    ],
  },

  // 3: one drift patrols the middle rows; fetch two patches around it.
  {
    name: 'Crossroads', quorum: 2, par: 40, driftPeriod: 2, spawnEvery: 16,
    map: [
      '#############',
      '#@..P....M..#',
      '#...........#',
      '#.....>.....#',
      '#...........#',
      '#..P.....X..#',
      '#############',
    ],
  },

  // 4: the exit sits in a bay whose sides are hold doors; a drift
  // crosses the room south of it.
  {
    name: 'Pit stop', quorum: 2, par: 45, driftPeriod: 2, spawnEvery: 16,
    map: [
      '#############',
      '#@..P...M...#',
      '#...........#',
      '#..HHHXHH...#',
      '#...........#',
      '#..P..>.....#',
      '#############',
    ],
  },

  // 5: a long walk — down the left arm, across, up the right arm and
  // back again: the merge pad sits on the far side from the exit.
  {
    name: 'The long walk', quorum: 3, par: 80, driftPeriod: 2, spawnEvery: 14,
    map: [
      '###############',
      '#@....#...P...#',
      '#.....#.......#',
      '#..M..#.......#',
      '#.....#.......#',
      '#.....#...P...#',
      '#....P........#',
      '#.....#....X..#',
      '###############',
    ],
  },

  // 6: the vault — the exit hides in a one-cell vault locked behind
  // two hold doors, and a drift owns the row in front of it.
  {
    name: 'The vault', quorum: 3, par: 55, driftPeriod: 2, spawnEvery: 12,
    map: [
      '###############',
      '#@..P...^..P..#',
      '#....#####....#',
      '#..M.H.X.H....#',
      '#....#.#......#',
      '#....P........#',
      '###############',
    ],
  },

  // 7: the merge pad sits inside a walled ring with one doorway; two
  // drifts run the ring's outer lane.
  {
    name: 'Rotation', quorum: 3, par: 70, driftPeriod: 2, spawnEvery: 14,
    map: [
      '##############',
      '#@..P...v..P.#',
      '#..###.###...#',
      '#..#.M...#...#',
      '#..#######...#',
      '#.P..>.>.#..X#',
      '##############',
    ],
  },

  // 8: potholed lanes — patches in pockets, a fast drift on the open
  // row to the exit, and another hunting the right lane.
  {
    name: 'Deer run', quorum: 3, par: 75, driftPeriod: 2, spawnEvery: 12,
    map: [
      '###############',
      '#@.#..P.#.....#',
      '#..#....#..P..#',
      '#..#.M..#.....#',
      '#..#....#P.>..#',
      '#...>.....X...#',
      '###############',
    ],
  },

  // 9: an open square where three drifts bounce; grab, merge, dash.
  {
    name: 'Quorum square', quorum: 4, par: 65, driftPeriod: 2, spawnEvery: 12,
    map: [
      '#################',
      '#@...P...^..P...#',
      '#...............#',
      '#...M....>......#',
      '#.......v.......#',
      '#....P....X.....#',
      '#...P...........#',
      '#################',
    ],
  },

  // 10: the exit vault nested inside a hold-walled room; the front
  // door opens at quorum, and drifts own both approaches.
  {
    name: 'Holdfast', quorum: 4, par: 70, driftPeriod: 2, spawnEvery: 12,
    map: [
      '#################',
      '#@....P.....^..P#',
      '#...HHHHHHHH....#',
      '#...H......H..P.#',
      '#...H...X..H....#',
      '#...HHHHHHHH....#',
      '#..P....M.......#',
      '#........v..^...#',
      '#################',
    ],
  },

  // 11: rush hour — fast drifts on tight lanes, four patches to land.
  {
    name: 'Rush hour', quorum: 4, par: 85, driftPeriod: 1, spawnEvery: 10,
    map: [
      '#################',
      '#@..#...v#...P..#',
      '#...#.>.>#......#',
      '#.#.#...#.#..M..#',
      '#.#.#####.#.....#',
      '#.#.......#..P..#',
      '#.#....>#..P..X.#',
      '#...#####....P..#',
      '#################',
    ],
  },

  // 12: the gauntlet — the whole board patrols and the quorum is big.
  {
    name: 'The gauntlet', quorum: 5, par: 130, driftPeriod: 2, spawnEvery: 10,
    map: [
      '###################',
      '#@....v.....P.....#',
      '#.....#....#....>.#',
      '#..P..#....#......#',
      '#.....#.M..#..v...#',
      '#.HHHH#....######.#',
      '#....^#..P.#....#.#',
      '#..HHH#HHHHH.HHH..#',
      '#.........#.......#',
      '#...P....#M..^.H.X#',
      '#.........#...P.H.#',
      '###################',
    ],
  },
];

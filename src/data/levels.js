// Quorum Run's shipped levels (DESIGN.md §10).
//
// PLACEHOLDER by agent-19: written so that src/core/game.js (and the tests
// that default to LEVELS) can run before area 6's owners land their set.
// All constraints of §10 hold here: at least 10 valid definitions, distinct
// names, rising difficulty, no drift on the first, at least six with
// drifts, at least four with hold doors, quorum <= 20, par >= 30, and a
// spawn point for every patch. Replace freely.

export const LEVELS = [
  {
    name: 'First merge', quorum: 1, par: 60, driftPeriod: 2, spawnEvery: 20,
    map: ['#########', '#@P.M..X#', '#########'],
  },
  {
    name: 'Corner store', quorum: 1, par: 80, driftPeriod: 2, spawnEvery: 20,
    map: ['###########', '#@.P...M..#', '#....X....#', '###########'],
  },
  {
    name: 'Round trip', quorum: 1, par: 120, driftPeriod: 2, spawnEvery: 20,
    map: ['###########', '#@P....M..#', '#.#######.#', '#.....X...#', '###########'],
  },
  {
    name: 'First patrol', quorum: 1, par: 110, driftPeriod: 2, spawnEvery: 18,
    map: ['###########', '#@.P..M..X#', '#....^....#', '###########'],
  },
  {
    name: 'Hold the line', quorum: 1, par: 130, driftPeriod: 2, spawnEvery: 18,
    map: ['############', '#@.P.M.H..X#', '#..........#', '############'],
  },
  {
    name: 'Crossfire', quorum: 1, par: 150, driftPeriod: 2, spawnEvery: 16,
    map: ['############', '#@.P.M.H..X#', '#....^.....#', '#..v.......#', '############'],
  },
  {
    name: 'Four corners', quorum: 2, par: 180, driftPeriod: 2, spawnEvery: 14,
    map: ['#############', '#@.P...M...X#', '#.....>.....#', '#.<.........#', '#...^...v...#', '#############'],
  },
  {
    name: 'Lockdown', quorum: 3, par: 200, driftPeriod: 2, spawnEvery: 14,
    map: ['###############', '#@.P..M..P.H.X#', '#.....^...#...#', '#..H......H...#', '###############'],
  },
  {
    name: 'Long haul', quorum: 3, par: 240, driftPeriod: 2, spawnEvery: 12,
    map: ['################', '#@.P...M....H.X#', '#......^.......#', '#....v....P....#', '#......H.......#', '################'],
  },
  {
    name: 'Storage wars', quorum: 4, par: 260, driftPeriod: 2, spawnEvery: 12,
    map: [
      '##################',
      '#@.P..M.....#...X#',
      '#....^......H....#',
      '#....v..P...#.<..#',
      '##################',
    ],
  },
  {
    name: 'The conveyor', quorum: 4, par: 280, driftPeriod: 1, spawnEvery: 12,
    map: [
      '#################',
      '#@.P.M.....H...X#',
      '#>.........#....#',
      '#...P....v.#....#',
      '#<.........#....#',
      '#..........#....#',
      '#################',
    ],
  },
  {
    name: 'The gauntlet', quorum: 5, par: 320, driftPeriod: 1, spawnEvery: 10,
    map: [
      '####################',
      '#@.P.M...H......X..#',
      '#...v.....^....>...#',
      '#.<.......v........#',
      '#..........H....<..#',
      '#.....^....P.......#',
      '####################',
    ],
  },
];

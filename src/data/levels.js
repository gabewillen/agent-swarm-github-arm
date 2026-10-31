// §10 The shipped levels: at least 10 valid definitions with distinct names,
// first to last in rising difficulty. The first has no drift, most later
// levels patrol with drifts, and from 'Hold the Yard' on, hold doors gate a
// region until the level's quorum has landed. Every quorum is at most 20 and
// every par at least 30.
export const LEVELS = [
  // 1. A quiet classroom: four pickup points around three merge pads, no
  //    drifts, and a short walk to the exit. The tutorial, and easy to ship.
  {
    name: 'Courier School', quorum: 3, par: 60, driftPeriod: 2, spawnEvery: 20,
    map: [
      '#############',
      '#@.P..M....X#',
      '#...M.......#',
      '#..........P#',
      '#..#....#..M#',
      '#..P........#',
      '#......P....#',
      '#...........#',
      '#############',
    ],
  },
  // 2. One drift walks the long room: time the pickups, keep your distance.
  {
    name: 'First Patrol', quorum: 3, par: 80, driftPeriod: 3, spawnEvery: 18,
    map: [
      '###############',
      '#@..P.....P..X#',
      '#....M........#',
      '#.............#',
      '#..#.>.#..M...#',
      '#.............#',
      '#......P......#',
      '#..........M..#',
      '###############',
    ],
  },
  // 3. A hall with two side offices; a drift rules the hall, clerk the offices.
  {
    name: 'The Long Hall', quorum: 4, par: 100, driftPeriod: 2, spawnEvery: 20,
    map: [
      '###################',
      '#@...P.#....P....X#',
      '#......#..M...#...#',
      '#..M...^......#...#',
      '#......#..P...#...#',
      '#...P..#......#...#',
      '#......^.v....#...#',
      '#.............M...#',
      '###################',
    ],
  },
  // 4. A yard behind hold doors: earn the quorum outside, walk in for more.
  {
    name: 'Hold the Yard', quorum: 4, par: 120, driftPeriod: 2, spawnEvery: 16,
    map: [
      '#################',
      '#@....H.........#',
      '#..M..H...P.....#',
      '#..P..H.........#',
      '#..P..H........X#',
      '#......H..P.M...#',
      '#..P..H.........#',
      '#.....>.........#',
      '#...............#',
      '#...............#',
      '#################',
    ],
  },
  // 5. Four drifts cross the open floor in opposite lanes.
  {
    name: 'Crossfire', quorum: 4, par: 130, driftPeriod: 2, spawnEvery: 16,
    map: [
      '#################',
      '#@..P.......P..X#',
      '#......M........#',
      '#..M............#',
      '#..........M....#',
      '#...v.......^...#',
      '#...............#',
      '#..>........<...#',
      '#...............#',
      '#...P.......P...#',
      '#################',
    ],
  },
  // 6. Two offices and a loading dock, all behind hold doors; drifts walk
  //    the public hall.
  {
    name: 'Patent Office', quorum: 5, par: 140, driftPeriod: 2, spawnEvery: 14,
    map: [
      '###################',
      '#@.....H.....P...X#',
      '#......H..........#',
      '#..P...H...M..M...#',
      '#......H..........#',
      '#....^.H......^...#',
      '#......H..........#',
      '#..P...H....P.....#',
      '#..M...H....M.....#',
      '#....<.H....>.<...#',
      '###################',
    ],
  },
  // 7. A spiral walk with a drift in the coil; carry three and they fall far.
  {
    name: 'Spiral Terminal', quorum: 5, par: 150, driftPeriod: 2, spawnEvery: 14,
    map: [
      '###############',
      '#@.P..#######X#',
      '#.....#.......#',
      '#..M..#.v.P...#',
      '#.....#.......#',
      '#..P..#...M...#',
      '#.....#.P.....#',
      '#..M..#.......#',
      '#.....#..v....#',
      '#.....#######.#',
      '#.............#',
      '###############',
    ],
  },
  // 8. A maze of pillars with a drift in every ward.
  {
    name: 'Blackout Grid', quorum: 5, par: 160, driftPeriod: 2, spawnEvery: 12,
    map: [
      '#################',
      '#@..P......P...X#',
      '#...............#',
      '#..##.....##...M#',
      '#...............#',
      '#P...##.....##..#',
      '#...........>...#',
      '#..##.....##....#',
      '#...............#',
      '#.P....##....##.#',
      '#..<........M...#',
      '#......^........#',
      '#################',
    ],
  },
  // 9. A vault: drifts keep off it, and its door only opens for the quorum.
  {
    name: 'The Vault', quorum: 6, par: 170, driftPeriod: 2, spawnEvery: 12,
    map: [
      '###################',
      '#@...P........^..X#',
      '#..M..........H...#',
      '#......M..P....H..#',
      '#.<..........^H...#',
      '#..P..........H...#',
      '#.............H...#',
      '####HHH####HH######',
      '#..M..#....#...P..#',
      '#.....#..>.#..M...#',
      '#..P..#....#......#',
      '#.....######..P...#',
      '###################',
    ],
  },
  // 10. An open loading field at courier pace: drifts in four directions.
  {
    name: 'Deadline', quorum: 6, par: 180, driftPeriod: 2, spawnEvery: 12,
    map: [
      '###################',
      '#@..P....M....P..X#',
      '#.................#',
      '#..^.......M......#',
      '#.................#',
      '#......^.>........#',
      '#.................#',
      '#..M........<.....#',
      '#........P........#',
      '#..v.......^......#',
      '#...P.....P.....M.#',
      '#.................#',
      '###################',
    ],
  },
  // 11. Switchyard: corridors, holds that flip the yard open, drifts walking
  //     their own sidings.
  {
    name: 'Switchyard', quorum: 7, par: 190, driftPeriod: 2, spawnEvery: 12,
    map: [
      '#####################',
      '#@..P.H.....H....P.X#',
      '#.....H.....H.......#',
      '#..M..H..P..H..M....#',
      '#.....H.....H.......#',
      '#..^..H..P..H..^....#',
      '#.....H.....H.......#',
      '#.P...H..M..H.......#',
      '#.....H.....H...P.M.#',
      '#..v..H..<..H..v....#',
      '#.....H.....H.......#',
      '#..P..H.....H...P...#',
      '#####################',
    ],
  },
  // 12. Grand Terminus: the last stretch, ringed in drifts, holds and all.
  {
    name: 'Grand Terminus', quorum: 8, par: 200, driftPeriod: 2, spawnEvery: 10,
    map: [
      '#####################',
      '#@...P...#...P....X.#',
      '#....<...#..>.......#',
      '#..M.....#..M.......#',
      '#........H..........#',
      '#..P.....H..P...M...#',
      '#..^.v...H.....v....#',
      '#........H..........#',
      '#..P.....#..P...^...#',
      '#..M.....#..........#',
      '#....<...#.>.M......#',
      '#........#......P...#',
      '#.....P..#..P......M#',
      '#........#..........#',
      '#####################',
    ],
  },
];

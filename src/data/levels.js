// The shipped campaign of §10: twelve definitions, first to last in rising
// difficulty, all valid per §4. The first level has no drift; by the third
// the player has seen hold doors, then drifts patrol from the fourth on.
// Levels share a shape: corridors that make the route matter, merge pads
// placed at route decisions, and holds that gate a region until the quorum
// lands.
export const LEVELS = [
  {
    // An open room: pick patches, merge two on the pad, ship through the exit.
    name: 'Waiting Room', quorum: 2, par: 90, driftPeriod: 2, spawnEvery: 20,
    map: [
      '###########',
      '#@..P....X#',
      '#.........#',
      '#..P..M...#',
      '#.........#',
      '###########',
    ],
  },
  {
    // Two rooms share a single doorway: gather three, merge in the west, then
    // cross the door to the east counter.
    name: 'Corner Store', quorum: 3, par: 100, driftPeriod: 2, spawnEvery: 20,
    map: [
      '#############',
      '#@....#....X#',
      '#.....#.....#',
      '#..P..#..M..#',
      '#.....#.....#',
      '#.....#.....#',
      '#.P.M.P.....#',
      '#############',
    ],
  },
  {
    // Hold doors gate the middle booth and the exit office behind it; the west
    // room must reach the quorum before any crossing.
    name: 'Checkpoint', quorum: 4, par: 120, driftPeriod: 2, spawnEvery: 18,
    map: [
      '###############',
      '#@....#....#..#',
      '#.P...#.P..#..#',
      '#.....#....#.X#',
      '#..M..H.M..H..#',
      '#.....#....#..#',
      '#.....#.M..#..#',
      '#.P...#....#..#',
      '###############',
    ],
  },
  {
    // Two drifts circle the open floor: time the crossings while collecting.
    name: 'First Patrol', quorum: 5, par: 130, driftPeriod: 3, spawnEvery: 16,
    map: [
      '###############',
      '#@....P...P...#',
      '#.....>.......#',
      '#.P.........P.#',
      '#.....M.M.....#',
      '#.............#',
      '#.....<.......#',
      '#.P...P...X...#',
      '###############',
    ],
  },
  {
    // A plaza inside a patrolled ring: the doors in the ring wall are the only
    // way in, and both merge pads wait in the plaza.
    name: 'Roundabout', quorum: 6, par: 140, driftPeriod: 2, spawnEvery: 16,
    map: [
      '###############',
      '#@.....>...P..#',
      '#.####.######.#',
      '#.#.P.....P.#.#',
      '#.#..M.X.M..#.#',
      '#.#.P.....P.#.#',
      '#.#.........#.#',
      '#.######.####.#',
      '#......<...P..#',
      '###############',
    ],
  },
  {
    // Two drifts lap the great hall while hold doors lead to the north annex
    // (an extra pad) and the south office that holds the exit.
    name: 'The Annex', quorum: 7, par: 150, driftPeriod: 2, spawnEvery: 14,
    map: [
      '#################',
      '#@.........#..P.#',
      '#....>..P..#..M.#',
      '#.P........#....#',
      '#.....M...H.....#',
      '#....<....#.....#',
      '#.........#.....#',
      '#..P....P.H....X#',
      '#.........#.....#',
      '#################',
    ],
  },
  {
    // A serpentine of four lanes joined at alternating ends: every merge pad
    // sits at a route decision, and each lane hosts a wanderer.
    name: 'Switchbacks', quorum: 9, par: 170, driftPeriod: 2, spawnEvery: 14,
    map: [
      '#############',
      '#@..P....M..#',
      '#.....>.....#',
      '#..##########',
      '#..M.....P..#',
      '#....v..P...#',
      '##########..#',
      '#.....<.....#',
      '#.M......P..#',
      '#..##########',
      '#...P...M...#',
      '#..........X#',
      '#############',
    ],
  },
  {
    // A market of pillars with two opposing drift pairs churning the middle
    // aisles; four pads and a long haul to the far corner exit.
    name: 'Market Rush', quorum: 10, par: 180, driftPeriod: 2, spawnEvery: 12,
    map: [
      '###################',
      '#@...vP......v..X.#',
      '#..#...#...#...#..#',
      '#...P....M.....P..#',
      '#..#...#...#...#..#',
      '#.P...M.....M...P.#',
      '#..#...#...#...#..#',
      '#...P.....M.P.....#',
      '#..#...#...#...#..#',
      '#....^..P....^.P..#',
      '###################',
    ],
  },
  {
    // A wall splits the floor in two, held shut by two toll booths; the north
    // hall earns the quorum, then the booths open onto the south yard.
    name: 'Toll Booths', quorum: 12, par: 200, driftPeriod: 2, spawnEvery: 12,
    map: [
      '#################',
      '#@..v...........#',
      '#..P........P...#',
      '#......M........#',
      '#.....P....M....#',
      '#........^......#',
      '#...H.......H...#',
      '#...v...........#',
      '#.......P.......#',
      '#..P..M......X..#',
      '#...............#',
      '#........^......#',
      '#################',
    ],
  },
  {
    // A colonnaded loom: five drifts thread the long aisles between the
    // stalls, and the pads sit where the crossings meet.
    name: 'The Loom', quorum: 13, par: 210, driftPeriod: 2, spawnEvery: 12,
    map: [
      '###################',
      '#@...P....X.......#',
      '#.##....##....##..#',
      '#.##....##....##..#',
      '#....vM.....M^....#',
      '#..P......v....P..#',
      '#.................#',
      '#..P..........P...#',
      '#.##..M.##.M..##..#',
      '#.##....##....##..#',
      '#....v.......^....#',
      '#.........P.......#',
      '###################',
    ],
  },
  {
    // A moat of four open strips rings the keep; the courtyard drifts roam it
    // while the yard must reach the biggest quorum before the gate holds fail.
    name: 'The Citadel', quorum: 16, par: 240, driftPeriod: 2, spawnEvery: 12,
    map: [
      '#####################',
      '#@..P........P......#',
      '#........>.......P..#',
      '#...................#',
      '#....#####H#####....#',
      '#....#.........#....#',
      '#.M..#..P...v..#....#',
      '#....#..M.X.M..#....#',
      '#....#.......P.#....#',
      '#....#.........#...>#',
      '#....#####H#####....#',
      '#...v............M..#',
      '#..P..........P.....#',
      '#..............P...<#',
      '#####################',
    ],
  },
  {
    // The grand depot: shelving splits six aisles, two drift pairs churn the
    // central spine, and the shipping dock waits behind its hold door.
    name: 'Grand Depot', quorum: 18, par: 270, driftPeriod: 2, spawnEvery: 10,
    map: [
      '#######################',
      '#@....v........v......#',
      '#..P........P.....P...#',
      '#.......M.....M.......#',
      '#...####...####...##..#',
      '#.....................#',
      '#..M.....P....M.......#',
      '#.....................#',
      '#.###.....M......###..#',
      '#.....................#',
      '#P....^...>....^....<.#',
      '#.....................#',
      '#......###H###........#',
      '#......#..X..#........#',
      '#......#.....#....P...#',
      '#......#..M..#........#',
      '#######################',
    ],
  },
];

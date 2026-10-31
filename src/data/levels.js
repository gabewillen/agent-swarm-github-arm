// DESIGN.md §10: the shipped levels. Twelve, distinct names, first to
// last in rising difficulty (bigger maps, more drifts, held doors, higher
// quorums). The first has no drift; eight have drifts; six have hold
// doors. Every quorum is at most 20 and every par at least 30. Pure
// data: no imports, no logic. Maps are bordered '#'; each level has
// exactly one '@' and one 'X', and at least one 'M' and 'P'.
export const LEVELS = [
  {
    // The example of §4 itself: fetch, carry, merge, repeat. No drift.
    name: 'First merge', quorum: 3, par: 120, driftPeriod: 2, spawnEvery: 20,
    map: [
      '#######',
      '#@.P.M#',
      '#..X..#',
      '#######',
    ],
  },
  {
    // Two spawn points on opposite sides of an inner wall.
    name: 'Corner shop', quorum: 3, par: 120, driftPeriod: 2, spawnEvery: 14,
    map: [
      '#########',
      '#@P...M.#',
      '#.#####.#',
      '#.P.X...#',
      '#########',
    ],
  },
  {
    // A ring road with an inner cross; the exit hides behind a jog.
    name: 'Ring road', quorum: 4, par: 150, driftPeriod: 2, spawnEvery: 16,
    map: [
      '###########',
      '#P.....#..#',
      '#.###.#.#.#',
      '#.#M..#X..#',
      '#.###.#.#.#',
      '#@.....P..#',
      '###########',
    ],
  },
  {
    // First drifts: one patrols the merge row, one the yard below.
    name: 'Two walkers', quorum: 4, par: 170, driftPeriod: 2, spawnEvery: 14,
    map: [
      '###########',
      '#@..P...P.#',
      '#.........#',
      '#>..M....X#',
      '#.........#',
      '#.P....v..#',
      '###########',
    ],
  },
  {
    // Hold doors in a shared wall: quorum from the annex, then cross.
    name: 'Locked annex', quorum: 5, par: 190, driftPeriod: 3, spawnEvery: 16,
    map: [
      '#############',
      '#@..P.#..P.M#',
      '#.....H.....#',
      '#..M..#....X#',
      '#.....H.....#',
      '#.P...#P....#',
      '#############',
    ],
  },
  {
    // Three drifts cross a wide hall: lanes you time, not walls you dodge.
    name: 'Pressed lanes', quorum: 6, par: 220, driftPeriod: 2, spawnEvery: 12,
    map: [
      '#############',
      '#@.P.v....P.#',
      '#...........#',
      '#.P.....M...#',
      '#...........#',
      '#>..M.....P<#',
      '#...........#',
      '#.P....X....#',
      '#############',
    ],
  },
  {
    // Full-height wall with two holds; a drift in each cell.
    name: 'Holding cells', quorum: 6, par: 240, driftPeriod: 2, spawnEvery: 14,
    map: [
      '#############',
      '#@..P.#..P.M#',
      '#.....H.....#',
      '#..Mv.#<....#',
      '#.....#.....#',
      '#.v...H..P..#',
      '#.....#.....#',
      '#.P...#....X#',
      '#############',
    ],
  },
  {
    // Four drifts fire across the middle: cross the room in pieces.
    name: 'Crossfire', quorum: 6, par: 280, driftPeriod: 2, spawnEvery: 12,
    map: [
      '###############',
      '#@..P....P....#',
      '#.............#',
      '#>...........<#',
      '#.P...M...M...#',
      '#.v.........v.#',
      '#.............#',
      '#..P..X....P..#',
      '###############',
    ],
  },
  {
    // A long wing ferries the quorum; the hold opens the long right wing.
    name: 'Long haul', quorum: 8, par: 320, driftPeriod: 3, spawnEvery: 12,
    map: [
      '#################',
      '#@..P...#.P....M#',
      '#.......#.......#',
      '#.v.....#.......#',
      '#.......H.......#',
      '#.P.....#...P...#',
      '#.......#.......#',
      '#..M....#.M...X.#',
      '#.......#.......#',
      '#.....P.#...v...#',
      '#################',
    ],
  },
  {
    // A pillar lattice in two wings behind a held spine.
    name: 'Gridlock', quorum: 10, par: 380, driftPeriod: 2, spawnEvery: 12,
    map: [
      '###################',
      '#@.....P.#P..M....#',
      '#.v#.#.#.#.#.#....#',
      '#........H........#',
      '#..#.#.#.#.#.#....#',
      '#........#P.v.....#',
      '#..#.#.#.#.#.#....#',
      '#........H....P...#',
      '#..#.#.#.#.#.#....#',
      '#.M.P....#.....X..#',
      '###################',
    ],
  },
  {
    // A held spine with three doors, walled pockets, seven drifts.
    name: 'Corridor wars', quorum: 12, par: 460, driftPeriod: 2, spawnEvery: 10,
    map: [
      '#####################',
      '#@v.......#.v.......#',
      '#.......P.#..P......#',
      '#.........H.......^.#',
      '#.###.###.#.P....M..#',
      '#.........#.........#',
      '#.P...M...H.P...>.P.#',
      '#.........#.........#',
      '#.........#.###.###.#',
      '#.......<.H.........#',
      '#.........#.v.......#',
      '#..Pv.....#...P....X#',
      '#####################',
    ],
  },
  {
    // Three wings behind held spines, eight drifts, fifteen patches: the
    // final haul.
    name: 'Full quorum', quorum: 15, par: 560, driftPeriod: 2, spawnEvery: 10,
    map: [
      '#########################',
      '#@.v....#...v...#...v...#',
      '#.......#.......#.......#',
      '#.P.....HP......#.M.....#',
      '#.......#.......#.......#',
      '#....M..#.....M.#.......#',
      '#.......#.......#.......#',
      '#.......H...v...H.....X.#',
      '#.......#.......#.......#',
      '#.....>.#.P.....#.....P.#',
      '#.......#.......#.......#',
      '#.v.....H....P..#.<.....#',
      '#.......#.......#.......#',
      '#.P...P.#.......#....v..#',
      '#########################',
    ],
  },
];

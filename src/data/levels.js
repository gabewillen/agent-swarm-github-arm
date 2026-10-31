// The shipped campaign levels (DESIGN.md §10): at least ten valid
// definitions with distinct names, first to last in rising difficulty.
// Plain data, no imports, so every other module can load it alone.

export const LEVELS = [
  // No drift: a calm loop of three patches and one merge pad. Learn to
  // pick up, merge, and ship.
  {
    name: 'First merge', quorum: 3, par: 90, driftPeriod: 2, spawnEvery: 20,
    map: [
      '###########',
      '#@..P....X#',
      '#.........#',
      '#..M...P..#',
      '#.........#',
      '#P........#',
      '###########',
    ],
  },

  // No drift: a mid pillar to walk around and one patch short of quorum.
  // Merge in two trips, or wait for a spawn, then ship.
  {
    name: 'Take three', quorum: 4, par: 110, driftPeriod: 2, spawnEvery: 14,
    map: [
      '#############',
      '#@..P....X..#',
      '#...........#',
      '#..P..##.M..#',
      '#.....##....#',
      '#P..........#',
      '#############',
    ],
  },

  // One drift patrols the wide hall. Pillars give cover on the haul to
  // the merge pad.
  {
    name: 'First drift', quorum: 3, par: 120, driftPeriod: 2, spawnEvery: 18,
    map: [
      '#############',
      '#@..P....X..#',
      '#..#.....#..#',
      '#.....v.....#',
      '#..#..M..#..#',
      '#P........P.#',
      '#############',
    ],
  },

  // Two drifts, two rooms, one wide gap in the shared wall. Pick across
  // both rooms and dodge the crossfire.
  {
    name: 'Crossfire', quorum: 4, par: 150, driftPeriod: 2, spawnEvery: 16,
    map: [
      '###############',
      '#@..P...##.P..#',
      '#.......##....#',
      '#..M........v.#',
      '#.......##....#',
      '#..P....##.P..#',
      '#.......##....#',
      '#..X....##..>.#',
      '###############',
    ],
  },

  // A hold door gates the exit pocket: reach quorum out in the open,
  // then step through the gate to ship.
  {
    name: 'The Gate', quorum: 3, par: 140, driftPeriod: 2, spawnEvery: 16,
    map: [
      '#############',
      '#.....X.....#',
      '#####H#######',
      '#.@......vM.#',
      '#.P.....P...#',
      '#....P..#...#',
      '#############',
    ],
  },

  // Two drifts stalk a wide hall whose merge pad sits mid-map; the exit
  // pocket along the top is gated by a hold door.
  {
    name: 'Checkpoint', quorum: 4, par: 160, driftPeriod: 2, spawnEvery: 14,
    map: [
      '#############',
      '#..P.....X..#',
      '#..#####H####',
      '#@..M..v.#..#',
      '#...........#',
      '#....P..P...#',
      '#..P....>.P.#',
      '#############',
    ],
  },

  // A serpentine of three halls: one drift patrols the middle while the
  // patches lie at the turns. Two merge pads let you split the run.
  {
    name: 'Serpent', quorum: 4, par: 170, driftPeriod: 2, spawnEvery: 16,
    map: [
      '###############',
      '#@............#',
      '############.##',
      '#..P........M.#',
      '#.#############',
      '#.....Pv..X...#',
      '##########.####',
      '#M....P.......#',
      '###############',
    ],
  },

  // An open quarry floor punched with pit walls: three drifts wander the
  // field between spawn pockets and the merge pad in the middle.
  {
    name: 'Quarry', quorum: 5, par: 180, driftPeriod: 2, spawnEvery: 12,
    map: [
      '#################',
      '#@..P...v.....P.#',
      '#...............#',
      '#...##.....##...#',
      '#..v#..M..#....P#',
      '#..P#.....#..#..#',
      '#....##.###..v..#',
      '#.....P......X..#',
      '#################',
    ],
  },

  // Two hold doors: the exit pocket and a bonus spawn chamber each hide
  // behind one, while two drifts hunt the hall between them.
  {
    name: 'Gatehouse', quorum: 5, par: 190, driftPeriod: 2, spawnEvery: 14,
    map: [
      '###############',
      '#....P.....P..#',
      '#######H#######',
      '#.@....v......#',
      '#P...#..#.....#',
      '#>..P.P..M..P.#',
      '#######H#######',
      '#......X......#',
      '###############',
    ],
  },

  // The long way: a hall split by wall runs, so every route is a detour;
  // two drifts patrol the crossing gaps between the spawn pockets.
  {
    name: 'The Long Way', quorum: 6, par: 210, driftPeriod: 2, spawnEvery: 12,
    map: [
      '#################',
      '#@..P...v...P..M#',
      '#...............#',
      '#.....#####.....#',
      '#..P..........P.#',
      '#.....#####.....#',
      '#...............#',
      '#..X....v.......#',
      '#################',
    ],
  },

  // The summit: three terraces rise behind hold doors. Carry patches up
  // through each gate while drifts patrol the landings; the exit crowns
  // the top terrace.
  {
    name: 'Summit', quorum: 5, par: 220, driftPeriod: 2, spawnEvery: 12,
    map: [
      '#################',
      '#....X....P.....#',
      '########H########',
      '#...P....v......#',
      '#...............#',
      '#####H###########',
      '#......P.....v..#',
      '#.....M.........#',
      '#..P...........>#',
      '#.@.......P.....#',
      '#################',
    ],
  },

  // Four drifts at a broad crossroads: patches lie in all four arms, the
  // merge pad sits at the crossing, and the exit hides in a walled nook.
  {
    name: 'Crossroads', quorum: 8, par: 240, driftPeriod: 2, spawnEvery: 12,
    map: [
      '#####################',
      '#@P.....v.....P.....#',
      '#...................#',
      '#...##.....#..##....#',
      '#...#..M....#...#...#',
      '#>.v#......P#..v.P#.#',
      '#...#..P....#...##..#',
      '#...##......#..#....#',
      '#....P......v#..P..X#',
      '#...................#',
      '#####################',
    ],
  },
];

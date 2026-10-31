// The shipped campaign (DESIGN.md §10): at least 10 valid level
// definitions, distinct names, first to last in rising difficulty. The
// first level has no drift, at least six have drifts, and at least four
// have hold doors. Every quorum is at most 20 and every par at least 30.
//
// Shapes worth knowing: the merge pads always sit outside any
// hold-gated pocket, so the quorum is reachable before a hold ever
// opens; where a hold gates the exit, the exit sits directly behind the
// hold door in a walled pocket of its own; and the drifts patrol the
// open lanes, so the fast routes stay under surveillance.

export const LEVELS = [
  // Learn the loop: two patches side by side, the pad, then out the exit.
  {
    name: 'First patch',
    quorum: 1,
    par: 60,
    driftPeriod: 2,
    spawnEvery: 20,
    map: [
      '#########',
      '#@PP.M.X#',
      '#.......#',
      '#########',
    ],
  },

  // Two patches, no drifts yet: plan the single double-merge.
  {
    name: 'Pair to the pad',
    quorum: 2,
    par: 90,
    driftPeriod: 2,
    spawnEvery: 20,
    map: [
      '##########',
      '#@P..P.MX#',
      '#........#',
      '##########',
    ],
  },

  // The first hold: the exit waits in a pocket behind a closed door.
  {
    name: 'Hold the door',
    quorum: 2,
    par: 90,
    driftPeriod: 2,
    spawnEvery: 20,
    map: [
      '##########',
      '#@P..PM.H#',
      '########X#',
      '##########',
    ],
  },

  // One patrol in the lower lane; the fast route stays up top.
  {
    name: 'First patrol',
    quorum: 2,
    par: 100,
    driftPeriod: 3,
    spawnEvery: 20,
    map: [
      '##########',
      '#@P..P.MX#',
      '#.<.....<#',
      '##########',
    ],
  },

  // A drifter circles the floor while the quorum mounts.
  {
    name: 'Twin pads',
    quorum: 3,
    par: 130,
    driftPeriod: 3,
    spawnEvery: 18,
    map: [
      '###########',
      '#@P.P.M.PX#',
      '#....>....#',
      '###########',
    ],
  },

  // The patrol works the lane under the corridor to the held exit.
  {
    name: 'The vaulted hall',
    quorum: 3,
    par: 130,
    driftPeriod: 3,
    spawnEvery: 18,
    map: [
      '###########',
      '#@P.P.M..H#',
      '#########X#',
      '#.<.......#',
      '###########',
    ],
  },

  // A ring corridor with two drifts racing each way around it.
  {
    name: 'Crossroads ring',
    quorum: 3,
    par: 150,
    driftPeriod: 3,
    spawnEvery: 18,
    map: [
      '###########',
      '#@P.P.MX..#',
      '#.#######.#',
      '#P..<...>.#',
      '###########',
    ],
  },

  // Open hall, three drifts, and pillars to break the sight lines.
  {
    name: 'Pillar patrol',
    quorum: 4,
    par: 180,
    driftPeriod: 3,
    spawnEvery: 16,
    map: [
      '###########',
      '#@P.M.P..X#',
      '#.#.#.#.#.#',
      '#.<..v.>..#',
      '###########',
    ],
  },

  // A long hold-gated haul past two patrol lanes.
  {
    name: 'Hold and haul',
    quorum: 4,
    par: 210,
    driftPeriod: 3,
    spawnEvery: 16,
    map: [
      '#############',
      '#@P..P.M...H#',
      '#.<.......#X#',
      '#.........###',
      '#....>....###',
      '#############',
    ],
  },

  // Two drifts duel on one lane, leaving conflicts to route around.
  {
    name: 'Dueling patrols',
    quorum: 5,
    par: 240,
    driftPeriod: 2,
    spawnEvery: 16,
    map: [
      '#############',
      '#@P.P.M...PX#',
      '#>.<..v.....#',
      '#...........#',
      '#############',
    ],
  },

  // Three drifts share the lanes below the only route to the door.
  {
    name: 'The gauntlet',
    quorum: 5,
    par: 260,
    driftPeriod: 2,
    spawnEvery: 14,
    map: [
      '#############',
      '#@P.P.M....H#',
      '#.<.......#X#',
      '#.........###',
      '#>.<......###',
      '#############',
    ],
  },

  // Everything at once: gates, four drifts, and a long grind to six.
  {
    name: 'Final quorum',
    quorum: 6,
    par: 300,
    driftPeriod: 2,
    spawnEvery: 14,
    map: [
      '#############',
      '#@P.P.M....H#',
      '#.#########X#',
      '#.<.>.<..>###',
      '#..P........#',
      '#############',
    ],
  },
];

// Draft levels under audit (shared source of truth for the scratch loop).
// build(width, inners) wraps each 13/9/11-char inner row in '#' borders and
// warns loudly on any row whose length does not match the width.

function build(width, inners) {
  const rows = ['', ...inners, ''].map((inner, i) => {
    if (i === 0 || i === inners.length + 1) return '#'.repeat(width);
    if (inner.length !== width - 2) console.warn(`  wide=${width} row=${inner.length} "${inner}"`);
    return '#' + inner + '#';
  });
  return rows;
}

export const LEVELS = [
  // 1 — an open room: learn pickup, merge, exit.
  { name: 'First steps', quorum: 1, par: 120, driftPeriod: 2, spawnEvery: 40,
    map: build(11, ['@P.P.M..X', '.........', '....P....', '.........']) },
  // 2 — carrying two means a trip back: a ring with a far exit.
  { name: 'Two trips', quorum: 2, par: 140, driftPeriod: 2, spawnEvery: 50,
    map: build(11, ['@.P....M.', '.........', '....P....', '.........', 'X....P...']) },
  // 3 — one slow drift crosses the middle of the room.
  { name: 'Slow patrol', quorum: 2, par: 160, driftPeriod: 4, spawnEvery: 60,
    map: build(13, ['@..P......M', '...........', '..P.>......', '...........', '..P......X.']) },
  // 4 — the exit sits in a vault behind one hold door; two drifts above.
  { name: 'The vault', quorum: 3, par: 180, driftPeriod: 3, spawnEvery: 60,
    map: build(13, ['@..P....M..', '..P........', '...>....v..', '...........', '......P....', '#######H###', '...P..P..X.']) },
  // 5 — crossfire between three drifts; the exit vault behind a hold.
  { name: 'Crossfire', quorum: 3, par: 200, driftPeriod: 2, spawnEvery: 70,
    map: build(15, ['@..P....M.P..', '.............', '.....>.P.<...', '>............', '########H####', '..P.........P', '......X......']) },
  // 6 — three patrol corridors; the exit at the end behind a hold.
  { name: 'The gauntlet', quorum: 4, par: 220, driftPeriod: 3, spawnEvery: 80,
    map: build(15, ['@..P....M....', '#####.#######', 'P....>.......', '######.######', '..M.P.<.<....', '#####.#######', 'P.....>......', '######H######', '.....X.....P.']) },
  // 7 — two sealed drift-pens behind hold doors; the exit down an open shaft.
  { name: 'Twin pens', quorum: 4, par: 240, driftPeriod: 4, spawnEvery: 80,
    map: build(15, ['@.PP....M....', '.............', '..P.......P..', '....v..>.....', '#H##.....##H#', '#..#.....#..#', '#P.#.....#.P#', '#P<#.....#<P#', '####..X..####']) },
  // 8 — scattered patches, four guard drifts, exit vault behind a hold.
  { name: 'The hunt', quorum: 5, par: 240, driftPeriod: 3, spawnEvery: 90,
    map: build(15, ['@.P..M...P...', '.....>.....<.', '..#.....#....', '.P.#^.v.#....', '..#.P.....P..', '######H######', '..X...P...P..']) },
  // 9 — a field of partial walls and five drifts; vaulted exit behind a hold.
  { name: 'Last alarm', quorum: 5, par: 280, driftPeriod: 2, spawnEvery: 100,
    map: build(17, ['@..P....M....P.', '.....^.........', '#...#...P###.v#', '......v....>..P', '..M...<......P.', '#######H#######', '.....X....P....']) },
  // 10 — the long maze: the exit vault and two late patches behind holds.
  { name: 'The long way', quorum: 5, par: 300, driftPeriod: 2, spawnEvery: 100,
    map: build(17, ['@..P.....M....P', '####.#####.####', '..P.P...<......', '#.#####.#####.#', 'P....v..v..v...', '#######H#######', '.....X....P....', '#H######.######', '..P....#..P...>']) },
];

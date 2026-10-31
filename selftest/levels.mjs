// Development harness levels mirroring §10's kinds: the acceptance suite's
// three mini maps plus a first level, drift corridors, a hold-gated level,
// a drift-rich arena, and a spawn-pressure room. Not the shipped game data.
const lvl = (name, quorum, par, driftPeriod, spawnEvery, map) => ({
  name,
  quorum,
  par,
  driftPeriod,
  spawnEvery,
  map,
});

export const MINI_PATCH = {
  name: 'only patch', quorum: 1, par: 100, driftPeriod: 1, spawnEvery: 1000,
  map: ['#######', '#@..P.#', '#M...X#', '#######'],
};
export const MINI_FULLHANDS = {
  name: 'full hands', quorum: 5, par: 100, driftPeriod: 1, spawnEvery: 1000,
  map: ['#######', '#M.@.P#', '#....X#', '#######'],
};
export const MINI_EXIT = {
  name: 'open exit', quorum: 1, par: 100, driftPeriod: 1, spawnEvery: 1000,
  map: ['#######', '#P.@.X#', '#M....#', '#######'],
};

export const FIRST = lvl('First merge', 3, 130, 2, 15, [
  '###########',
  '#@....P...#',
  '#.........#',
  '#..###....#',
  '#..#M..P..#',
  '#..###....#',
  '#.....X...#',
  '#.........#',
  '###########',
]);

export const CORRIDORS = lvl('Two watchmen', 4, 120, 2, 14, [
  '#############',
  '#@.....#v..P#',
  '#......#....#',
  '#.M....#....#',
  '#...........#',
  '#......#..P.#',
  '#......#..X.#',
  '#..P...#....#',
  '#############',
]);

export const HOLDS = lvl('Held room', 3, 200, 2, 10, [
  '#############',
  '#@..P...#...#',
  '#.......#.P.#',
  '#...M...#...#',
  '#.......H...#',
  '#.......#.X.#',
  '#..P....H...#',
  '#.......#...#',
  '#############',
]);

export const ARENA = lvl('The gauntlet', 2, 90, 1, 8, [
  '#########',
  '#@v..P..#',
  '#..>...<#',
  '#..^..M.#',
  '#...X..P#',
  '#########',
]);

export const PRESSURE = lvl('Spawn run', 2, 80, 1, 8, [
  '########',
  '#@..P.M#',
  '#P....X#',
  '########',
]);

export const LEVELS = [FIRST, CORRIDORS, HOLDS, ARENA, PRESSURE];
export const MINIES = [MINI_PATCH, MINI_FULLHANDS, MINI_EXIT];

// Minimal level parse (§4) for the development harness: assumes the
// definition's scalar fields are well-formed and only cares about fields
// the fake game steps with.
const DRIFT_CHARS = { '^': 'up', '>': 'right', v: 'down', '<': 'left' };

export function parseLevelLite(def) {
  const map = def.map;
  let width = 0;
  for (const row of map) width = Math.max(width, row.length);
  const tiles = [];
  const spawns = [];
  const drifts = [];
  let start = { x: 0, y: 0 };
  for (let y = 0; y < map.length; y++) {
    const row = map[y];
    let out = '';
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '@') {
        start = { x, y };
        out += '.';
      } else if (ch === 'P') {
        spawns.push({ x, y });
        out += '.';
      } else if (DRIFT_CHARS[ch]) {
        drifts.push({ x, y, dir: DRIFT_CHARS[ch] });
        out += '.';
      } else {
        out += ch;
      }
    }
    // rows are uniform in a valid level; pad defensively
    while (out.length < width) out += '#';
    tiles.push(out);
  }
  return {
    name: def.name,
    quorum: def.quorum,
    par: def.par,
    driftPeriod: def.driftPeriod,
    spawnEvery: def.spawnEvery,
    width,
    height: map.length,
    tiles,
    start,
    spawns,
    drifts,
  };
}

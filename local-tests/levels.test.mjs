// agent-33's own local checks for src/data/levels.js (§10). Not part of the
// acceptance suite; run with: node --test local-tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS } from '../src/data/levels.js';
import { validateLevel, parseLevel } from '../src/core/level.js';

function region(map, start, blockers) {
  const seen = new Set([`${start.x},${start.y}`]);
  const queue = [[start.x, start.y]];
  while (queue.length) {
    const [x, y] = queue.pop();
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (ny < 0 || ny >= map.length || nx < 0 || nx >= map[ny].length) continue;
      if (blockers.has(map[ny][nx]) || seen.has(`${nx},${ny}`)) continue;
      seen.add(`${nx},${ny}`);
      queue.push([nx, ny]);
    }
  }
  return seen;
}

test('every level validates and the roster meets §10', () => {
  assert.ok(LEVELS.length >= 10);
  assert.equal(new Set(LEVELS.map((d) => d.name)).size, LEVELS.length);
  for (const def of LEVELS) {
    assert.deepEqual(validateLevel(def), { ok: true, errors: [] }, def.name);
    assert.ok(def.quorum <= 20 && def.par >= 30, def.name);
    assert.ok(Number.isInteger(def.spawnEvery) && def.spawnEvery > 0, def.name);
  }
  assert.equal(parseLevel(LEVELS[0]).drifts.length, 0, 'the first level has no drift');
  assert.ok(LEVELS.filter((d) => d.map.some((r) => r.includes('H'))).length >= 4);
});

test('drift starts do not collide', () => {
  for (const def of LEVELS) {
    const starts = [];
    def.map.forEach((row, y) => [...row].forEach((c, x) => {
      if ('^>v<'.includes(c)) starts.push(`${x},${y}`);
    }));
    assert.equal(new Set(starts).size, starts.length, def.name);
  }
});

test('pre-open, each level can still be played', () => {
  for (const def of LEVELS) {
    const p = parseLevel(def);
    const reachable = region(def.map, p.start, new Set(['#', 'H', 'X']));
    const on = (cell) => reachable.has(`${cell.x},${cell.y}`);
    const pads = def.map.flatMap((row, y) => [...row].map((c, x) => ({ c, x, y }))
      .filter(({ c }) => c === 'M')).filter((m) => on(m));
    const points = p.spawns.filter((s) => on(s));
    assert.ok(pads.length >= 1, `${def.name}: a merge pad reachable pre-open`);
    assert.ok(points.length >= 1, `${def.name}: a spawn reachable pre-open`);
    const refills = Math.ceil(def.par / def.spawnEvery) + def.quorum;
    assert.ok(def.quorum <= points.length * refills,
      `${def.name}: quorum ${def.quorum} answerable pre-open (${points.length} open spawns)`);
  }
});

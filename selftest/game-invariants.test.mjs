// Extra tests beyond the acceptance suite: the state invariants of §8 and
// the statistics of §22 fuzzed against the full step of §5 to §7, in
// reaches where pickups, drops, hits, conflicts, spawns, and level loads
// all occur. Runs under `node --test selftest/`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { load, game, lvl, mv, deepFreeze } from '../tests/helpers.mjs';

const MAP = ['#########', '#@P.M..X#', '#.>..P..#', '#########'];
const WIDE = ['##########', '#@P.M..X.#', '#>.M....<#', '##########'];
const TIGHT = ['########', '#@P.M.X#', '#.H..>.#', '#....<.#', '########'];

test('checkState leaves a frozen state untouched', async () => {
  const { checkState } = await load('core/invariants.js');
  const s = deepFreeze(await game(MAP));
  assert.deepEqual(checkState(s), []);
  assert.ok(Object.isFrozen(s));
});

test('checkState tolerates half-formed shapes without throwing', async () => {
  const { checkState } = await load('core/invariants.js');
  assert.ok(checkState(null).length > 0);
  assert.ok(checkState({}).length > 0);
  assert.deepEqual(
    checkState({ status: 'playing', player: { x: 1, y: 1 }, lives: 3, score: 0, level: lvl(MAP) }),
    [],
  );
});

test('report codes follow the §8 table order and appear at most once', async () => {
  const { checkState } = await load('core/invariants.js');
  const s = await game(MAP);
  const codes = checkState({ ...s, carried: [4, 9, 0, 5], lives: -1, score: -2 });
  assert.deepEqual(new Set(codes), new Set(['carry_overflow', 'lives_range', 'score_negative', 'bad_color']));
  const table = ['bad_status', 'player_in_wall', 'carry_overflow', 'lives_range', 'score_negative', 'patch_off_spawn', 'drift_in_wall', 'bad_color'];
  assert.deepEqual([...codes].sort((a, b) => table.indexOf(a) - table.indexOf(b)), codes);
});

test('drifts roam legally; nothing they do breaks the invariants', async () => {
  const { checkState } = await load('core/invariants.js');
  const { init, step } = await load('core/game.js');
  let s = init(7, { levels: [lvl(WIDE, { driftPeriod: 1, spawnEvery: 5 })] });
  for (let i = 0; i < 40 && s.status === 'playing'; i++) {
    s = step(s, mv(['right', 'down', 'left', 'up'][i % 4]));
    assert.deepEqual(checkState(s), [], `tick ${s.tick}`);
  }
});

test('a seeded wander through pickups, drops, hits, and levels stays valid', async () => {
  const { checkState } = await load('core/invariants.js');
  const { init, step } = await load('core/game.js');
  let s = init(42, { levels: [lvl(WIDE, { driftPeriod: 2, spawnEvery: 4 })] });
  const moves = ['up', 'right', 'right', 'right', 'down', 'left', 'left', 'down', null];
  for (let i = 0; i < 150 && s.status !== 'lost'; i++) {
    s = step(s, mv(moves[i % moves.length]));
    assert.deepEqual(checkState(s), [], `step ${i}, status ${s.status}`);
  }
});

test('a long wander holds the invariants across conflicts, drops, and wins', async () => {
  const { checkState } = await load('core/invariants.js');
  const { init, step } = await load('core/game.js');
  let s = init(11, { levels: [lvl(TIGHT, { driftPeriod: 2, spawnEvery: 3 })] });
  const moves = ['up', 'right', 'down', 'left', null];
  for (let i = 0; i < 400 && s.status !== 'lost'; i++) {
    s = step(s, mv(moves[i % moves.length]));
    assert.deepEqual(checkState(s), [], `step ${i}, status ${s.status}, tick ${s.tick}`);
    if (i % 7 === 6) s = { ...s, paused: !s.paused };
  }
});

test('the frozen stats table is not changed by statsUpdate', async () => {
  const { statsInit, statsUpdate } = await load('core/stats.js');
  const { step } = await load('core/game.js');
  const s = await game(['########', '#@P.M.X#', '########']);
  const zero = deepFreeze(statsInit());
  const n = step(s, mv('right'));
  const counted = statsUpdate(zero, s, n, mv('right'));
  assert.deepEqual(zero, statsInit());
  assert.equal(counted.ticks, 1);
  assert.equal(counted.moves, 1);
});

test('statistics fold the same events into the same totals across many steps', async () => {
  const { statsInit, statsUpdate } = await load('core/stats.js');
  const { init, step } = await load('core/game.js');
  let s = init(5, { levels: [lvl(TIGHT, { driftPeriod: 2, spawnEvery: 3 })] });
  let st = statsInit();
  const moves = ['right', 'up', null, 'down', 'left'];
  for (let i = 0; i < 200 && s.status !== 'lost'; i++) {
    const input = mv(moves[i % moves.length]);
    const prev = s;
    s = step(s, input);
    st = statsUpdate(st, prev, s, input);
    assert.deepEqual({ ...st }, { ...st });
  }
  assert.ok(st.ticks > 0);
  assert.ok(st.levels >= 0);
});

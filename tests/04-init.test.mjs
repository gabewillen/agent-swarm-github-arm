import test from 'node:test';
import assert from 'node:assert/strict';
import { load, lvl, mulberryInt } from './helpers.mjs';

const MAP = ['#########', '#@.P.M.>#', '#.^..vP.#', '#..<H.X.#', '#########'];
const start = async (seed = 1, opts) => (await load('core/game.js')).init(seed, opts ?? { levels: [lvl(MAP)] });

test('constants match DESIGN.md §2', async () => {
  const c = await load('core/constants.js');
  assert.equal(c.CARRY_MAX, 3);
  assert.equal(c.START_LIVES, 3);
  assert.equal(c.INVULN_TICKS, 6);
  assert.equal(c.CONFLICT_TICKS, 10);
  assert.equal(c.PATCH_BASE, 100);
  assert.equal(c.SAME_COLOR_BONUS, 50);
  assert.equal(c.TIME_BONUS_PER_TICK, 10);
  assert.equal(c.COLORS, 4);
  assert.equal(c.TICK_MS, 120);
  assert.deepEqual(c.DIRS, { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] });
  assert.deepEqual(c.CLOCKWISE, ['up', 'right', 'down', 'left']);
});

test('init starts counters at zero and lives at START_LIVES', async () => {
  const s = await start();
  assert.equal(s.tick, 0);
  assert.equal(s.levelTicks, 0);
  assert.equal(s.score, 0);
  assert.equal(s.lives, 3);
  assert.equal(s.merges, 0);
  assert.equal(s.invuln, 0);
});

test('init state flags', async () => {
  const s = await start();
  assert.equal(s.status, 'playing');
  assert.equal(s.paused, false);
  assert.equal(s.open, false);
  assert.deepEqual(s.events, []);
  assert.deepEqual(s.carried, []);
  assert.deepEqual(s.conflicts, []);
});

test('init places the player at the start', async () => {
  assert.deepEqual((await start()).player, { x: 1, y: 1 });
});

test('init holds the parsed level and the definitions', async () => {
  const s = await start();
  const { parseLevel } = await load('core/level.js');
  assert.deepEqual(s.level, parseLevel(lvl(MAP)));
  assert.deepEqual(s.levels, [lvl(MAP)]);
  assert.equal(s.levelIndex, 0);
});

test('init copies the drifts', async () => {
  const s = await start();
  assert.deepEqual(s.drifts, s.level.drifts);
  assert.notEqual(s.drifts, s.level.drifts);
});

test('init puts one patch on every spawn with colours from the seed', async () => {
  const s = await start(42);
  let seed = 42;
  const colors = [];
  for (let i = 0; i < 2; i++) {
    const r = mulberryInt(seed, 4);
    colors.push(r.value);
    seed = r.seed;
  }
  assert.deepEqual(s.patches, [{ x: 3, y: 1, color: colors[0] }, { x: 6, y: 2, color: colors[1] }]);
  assert.equal(s.seed, seed);
});

test('init takes seed >>> 0', async () => {
  const a = await start(-1);
  const b = await start(0xFFFFFFFF);
  assert.deepEqual(a, b);
});

test('init can start at a later level', async () => {
  const two = lvl(['#######', '#.@P.M#', '#..X..#', '#######'], { name: 'two' });
  const s = await start(1, { levels: [lvl(MAP), two], level: 1 });
  assert.equal(s.levelIndex, 1);
  assert.equal(s.level.name, 'two');
  assert.deepEqual(s.player, { x: 2, y: 1 });
});

test('init defaults to the shipped LEVELS', async () => {
  const { init } = await load('core/game.js');
  const { LEVELS } = await load('data/levels.js');
  const s = init(3);
  assert.deepEqual(s.levels, LEVELS);
  assert.equal(s.level.name, LEVELS[0].name);
});

test('init state is plain JSON', async () => {
  const s = await start(9);
  assert.deepEqual(JSON.parse(JSON.stringify(s)), s);
});

test('tileAt reads terrain and walls outside', async () => {
  const { tileAt } = await load('core/game.js');
  const s = await start();
  assert.equal(tileAt(s, 5, 1), 'M');
  assert.equal(tileAt(s, 6, 3), 'X');
  assert.equal(tileAt(s, 4, 3), 'H');
  assert.equal(tileAt(s, 1, 1), '.');
  assert.equal(tileAt(s, 3, 1), '.');
  assert.equal(tileAt(s, 0, 0), '#');
  assert.equal(tileAt(s, -1, 2), '#');
  assert.equal(tileAt(s, 9, 1), '#');
  assert.equal(tileAt(s, 2, 7), '#');
});

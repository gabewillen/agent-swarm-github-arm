import test from 'node:test';
import assert from 'node:assert/strict';
import { load, lvl } from './helpers.mjs';

const MAP = ['#########', '#@.P.M.>#', '#.^..vP.#', '#..<H.X.#', '#########'];
const parse = async (def) => (await load('core/level.js')).parseLevel(def);

test('parseLevel copies the fields', async () => {
  const l = await parse(lvl(MAP, { name: 'n', quorum: 4, par: 50, driftPeriod: 3, spawnEvery: 9 }));
  assert.equal(l.name, 'n');
  assert.equal(l.quorum, 4);
  assert.equal(l.par, 50);
  assert.equal(l.driftPeriod, 3);
  assert.equal(l.spawnEvery, 9);
});

test('parseLevel gives width and height', async () => {
  const l = await parse(lvl(MAP));
  assert.equal(l.width, 9);
  assert.equal(l.height, 5);
});

test('parseLevel finds the start', async () => {
  assert.deepEqual((await parse(lvl(MAP))).start, { x: 1, y: 1 });
});

test('parseLevel lists spawns in reading order', async () => {
  assert.deepEqual((await parse(lvl(MAP))).spawns, [{ x: 3, y: 1 }, { x: 6, y: 2 }]);
});

test('parseLevel lists drifts in reading order with directions', async () => {
  assert.deepEqual((await parse(lvl(MAP))).drifts, [
    { x: 7, y: 1, dir: 'right' }, { x: 2, y: 2, dir: 'up' }, { x: 5, y: 2, dir: 'down' }, { x: 3, y: 3, dir: 'left' },
  ]);
});

test('parseLevel tiles hold only terrain', async () => {
  assert.deepEqual((await parse(lvl(MAP))).tiles, ['#########', '#....M..#', '#.......#', '#...H.X.#', '#########']);
});

test('parseLevel throws "invalid level" for a bad level', async () => {
  await assert.rejects(async () => parse(lvl(['#######', '#..P.M#', '#..X..#', '#######'])), (e) => e instanceof Error && e.message.startsWith('invalid level'));
});

test('parseLevel throws for bad fields', async () => {
  await assert.rejects(async () => parse(lvl(MAP, { quorum: 0 })), /^Error: invalid level/);
});

test('parseLevel result is plain JSON', async () => {
  const l = await parse(lvl(MAP));
  assert.deepEqual(JSON.parse(JSON.stringify(l)), l);
});

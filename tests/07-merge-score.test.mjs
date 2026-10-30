import test from 'node:test';
import assert from 'node:assert/strict';
import { load, lvl, play } from './helpers.mjs';

// The player at (1,1); patches at (2,1), (3,1), (4,1); merge at (5,1).
const MAP = ['########', '#@PPPM.#', '#X.....#', '########'];

async function withColors(colors, extra = {}) {
  const { init } = await load('core/game.js');
  const s = init(1, { levels: [lvl(MAP, { quorum: 99, ...extra })] });
  return { ...s, patches: s.patches.map((p, i) => ({ ...p, color: colors[i] })) };
}

test('merging one patch scores PATCH_BASE', async () => {
  const s = await withColors([0, 1, 2]);
  const t = await play({ ...s, patches: s.patches.slice(0, 1) }, ['right', 'right', 'right', 'right']);
  assert.equal(t.score, 100);
  assert.equal(t.merges, 1);
  assert.deepEqual(t.carried, []);
  assert.deepEqual(t.events, ['merge']);
});

test('merging two different colours scores 100 * 2 * 2', async () => {
  const s = await withColors([0, 1, 2]);
  const t = await play({ ...s, patches: s.patches.slice(0, 2) }, ['right', 'right', 'right', 'right']);
  assert.equal(t.score, 400);
  assert.equal(t.merges, 2);
});

test('merging three different colours scores 900', async () => {
  const t = await play(await withColors([0, 1, 2]), ['right', 'right', 'right', 'right']);
  assert.equal(t.score, 900);
  assert.equal(t.merges, 3);
  assert.deepEqual(t.events, ['merge']);
});

test('three of one colour add SAME_COLOR_BONUS per patch', async () => {
  const t = await play(await withColors([2, 2, 2]), ['right', 'right', 'right', 'right']);
  assert.equal(t.score, 900 + 150);
});

test('two of one colour add the bonus too', async () => {
  const s = await withColors([3, 3, 1]);
  const t = await play({ ...s, patches: s.patches.slice(0, 2) }, ['right', 'right', 'right', 'right']);
  assert.equal(t.score, 400 + 100);
});

test('two of one colour and one other get no bonus', async () => {
  const t = await play(await withColors([1, 1, 0]), ['right', 'right', 'right', 'right']);
  assert.equal(t.score, 900);
});

test('one patch alone never gets the bonus', async () => {
  const s = await withColors([0, 0, 0]);
  const t = await play({ ...s, patches: s.patches.slice(0, 1) }, ['right', 'right', 'right', 'right']);
  assert.equal(t.score, 100);
});

test('merges and score add up over several merges', async () => {
  const s = await withColors([0, 1, 2]);
  const a = await play({ ...s, patches: s.patches.slice(0, 1) }, ['right', 'right', 'right', 'right', 'left', 'left']);
  const b = await play({ ...a, patches: [{ x: 4, y: 1, color: 2 }] }, ['right', 'right']);
  assert.equal(b.score, 200);
  assert.equal(b.merges, 2);
});

test('the merge happens in the same step as the move onto the pad', async () => {
  const t = await play(await withColors([0, 1, 2]), ['right', 'right', 'right']);
  assert.equal(t.score, 0);
  assert.equal(t.carried.length, 3);
  const u = await play(t, ['right']);
  assert.equal(u.score, 900);
});

test('standing on the pad with nothing carried scores nothing', async () => {
  const s = await withColors([0, 1, 2]);
  const t = await play({ ...s, patches: [] }, ['right', 'right', 'right', 'right', null]);
  assert.equal(t.score, 0);
  assert.equal(t.merges, 0);
});

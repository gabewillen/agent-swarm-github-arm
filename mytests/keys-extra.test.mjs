// Extra edge-case tests for src/input/keys.js, beyond tests/19.
import test from 'node:test';
import assert from 'node:assert/strict';
import { load, deepFreeze } from '../tests/helpers.mjs';

const keys = () => load('input/keys.js');

test('swipe threshold is inclusive at 24 px', async () => {
  const { swipeToInput } = await keys();
  assert.deepEqual(swipeToInput(24, 0), { move: 'right', pause: false });
  assert.deepEqual(swipeToInput(-24, 0), { move: 'left', pause: false });
  assert.deepEqual(swipeToInput(0, 24), { move: 'down', pause: false });
  assert.deepEqual(swipeToInput(0, -24), { move: 'up', pause: false });
  assert.deepEqual(swipeToInput(24, 24), { move: 'right', pause: false });
  assert.deepEqual(swipeToInput(-24, 24), { move: 'left', pause: false });
  assert.equal(swipeToInput(23, 23), null);
  assert.equal(swipeToInput(-23, 0), null);
});

test('larger vertical axis wins over long horizontal', async () => {
  const { swipeToInput } = await keys();
  assert.deepEqual(swipeToInput(50, 60), { move: 'down', pause: false });
  assert.deepEqual(swipeToInput(50, -60), { move: 'up', pause: false });
  assert.deepEqual(swipeToInput(60, -50), { move: 'right', pause: false });
});

test('queuePush returns the queue itself when full or null', async () => {
  const { queuePush, INPUT_QUEUE_MAX, } = await keys();
  const full = [];
  for (let i = 0; i < INPUT_QUEUE_MAX; i++) full.push({ move: 'up', pause: false });
  const frozen = deepFreeze(full);
  const pushed = queuePush(full, { move: 'left', pause: false });
  assert.equal(pushed, frozen);
  assert.deepEqual(frozen.length, INPUT_QUEUE_MAX);
});

test('queuePush never mutates a frozen queue', async () => {
  const { queuePush } = await keys();
  const q = deepFreeze([{ move: 'left', pause: false }]);
  const r = queuePush(q, { move: 'up', pause: false });
  assert.deepEqual(r, [{ move: 'left', pause: false }, { move: 'up', pause: false }]);
  assert.deepEqual(q, [{ move: 'left', pause: false }]);
  assert.notEqual(r, q);
});

test('queueTake never mutates its argument', async () => {
  const { queueTake } = await keys();
  const q = deepFreeze([{ move: 'up', pause: false }]);
  const { input, queue } = queueTake(q);
  assert.deepEqual(input, { move: 'up', pause: false });
  assert.deepEqual(queue, []);
  assert.deepEqual(q, [{ move: 'up', pause: false }]);
});

test('queue round-trips', async () => {
  const { queuePush, queueTake } = await keys();
  let q = [];
  for (const m of ['up', 'down', 'left']) q = queuePush(q, { move: m, pause: false });
  const a = queueTake(q);
  assert.equal(a.input.move, 'up');
  const b = queueTake(a.queue);
  assert.equal(b.input.move, 'down');
  assert.deepEqual(queueTake(b.queue).input.move, 'left');
});

test('a real addEventListener/removeEventListener pair works', async () => {
  const { attachKeyboard } = await keys();
  const registry = new Map();
  const target = {
    addEventListener: (type, fn) => {
      if (!registry.has(type)) registry.set(type, new Set());
      registry.get(type).add(fn);
    },
    removeEventListener: (type, fn) => { registry.get(type)?.delete(fn); },
  };
  const detach = attachKeyboard(target, () => {});
  assert.equal(registry.get('keydown').size, 1);
  detach();
  detach();
  assert.equal(registry.get('keydown').size, 0);
});

test('keyToInput returns a fresh object each call (safe to queue)', async () => {
  const { keyToInput, queuePush } = await keys();
  const a = keyToInput('ArrowUp');
  const b = keyToInput('ArrowUp');
  assert.notEqual(a, b);
  let q = [];
  q = queuePush(q, a);
  q = queuePush(q, b);
  assert.deepEqual(q.map((i) => i.move), ['up', 'up']);
});

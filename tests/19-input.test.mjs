import test from 'node:test';
import assert from 'node:assert/strict';
import { load, deepFreeze } from './helpers.mjs';

const keys = () => load('input/keys.js');

test('arrow keys move', async () => {
  const { keyToInput } = await keys();
  assert.deepEqual(keyToInput('ArrowUp'), { move: 'up', pause: false });
  assert.deepEqual(keyToInput('ArrowDown'), { move: 'down', pause: false });
  assert.deepEqual(keyToInput('ArrowLeft'), { move: 'left', pause: false });
  assert.deepEqual(keyToInput('ArrowRight'), { move: 'right', pause: false });
});

test('WASD moves, in either case', async () => {
  const { keyToInput } = await keys();
  for (const [k, m] of [['w', 'up'], ['W', 'up'], ['a', 'left'], ['A', 'left'], ['s', 'down'], ['S', 'down'], ['d', 'right'], ['D', 'right']]) {
    assert.deepEqual(keyToInput(k), { move: m, pause: false }, k);
  }
});

test('P and Escape pause', async () => {
  const { keyToInput } = await keys();
  for (const k of ['p', 'P', 'Escape']) assert.deepEqual(keyToInput(k), { move: null, pause: true }, k);
});

test('other keys map to null', async () => {
  const { keyToInput } = await keys();
  for (const k of ['Enter', 'x', ' ', 'Shift', '', 'ArrowUpX']) assert.equal(keyToInput(k), null, k);
});

test('swipes below 24 px are null', async () => {
  const { swipeToInput } = await keys();
  assert.equal(swipeToInput(10, -23), null);
  assert.equal(swipeToInput(0, 0), null);
});

test('swipes move along the larger axis', async () => {
  const { swipeToInput } = await keys();
  assert.deepEqual(swipeToInput(40, 10), { move: 'right', pause: false });
  assert.deepEqual(swipeToInput(-40, 10), { move: 'left', pause: false });
  assert.deepEqual(swipeToInput(5, 30), { move: 'down', pause: false });
  assert.deepEqual(swipeToInput(5, -30), { move: 'up', pause: false });
});

test('a diagonal tie swipes horizontally', async () => {
  const { swipeToInput } = await keys();
  assert.deepEqual(swipeToInput(-30, 30), { move: 'left', pause: false });
});

test('INPUT_QUEUE_MAX is 4', async () => {
  assert.equal((await keys()).INPUT_QUEUE_MAX, 4);
});

test('queuePush appends without changing its argument', async () => {
  const { queuePush } = await keys();
  const q = deepFreeze([]);
  const r = queuePush(q, { move: 'up', pause: false });
  assert.deepEqual(r, [{ move: 'up', pause: false }]);
  assert.deepEqual(q, []);
});

test('queuePush ignores null and a full queue', async () => {
  const { queuePush } = await keys();
  let q = [];
  q = queuePush(q, null);
  assert.deepEqual(q, []);
  for (const m of ['up', 'down', 'left', 'right', 'up']) q = queuePush(q, { move: m, pause: false });
  assert.deepEqual(q.map((i) => i.move), ['up', 'down', 'left', 'right']);
});

test('queueTake takes the first input', async () => {
  const { queueTake } = await keys();
  const q = deepFreeze([{ move: 'up', pause: false }, { move: 'left', pause: false }]);
  assert.deepEqual(queueTake(q), { input: { move: 'up', pause: false }, queue: [{ move: 'left', pause: false }] });
  assert.equal(q.length, 2);
});

test('queueTake of an empty queue is no move', async () => {
  const { queueTake } = await keys();
  assert.deepEqual(queueTake([]), { input: { move: null, pause: false }, queue: [] });
});

function fakeTarget() {
  const listeners = [];
  return {
    listeners,
    addEventListener: (type, fn) => listeners.push({ type, fn }),
    removeEventListener: (type, fn) => { const i = listeners.findIndex((l) => l.type === type && l.fn === fn); if (i >= 0) listeners.splice(i, 1); },
    fire(key) {
      const ev = { key, prevented: false, preventDefault() { this.prevented = true; } };
      for (const l of [...listeners]) if (l.type === 'keydown') l.fn(ev);
      return ev;
    },
  };
}

test('attachKeyboard listens for keydown and reports mapped keys', async () => {
  const { attachKeyboard } = await keys();
  const t = fakeTarget();
  const got = [];
  attachKeyboard(t, (i) => got.push(i));
  assert.equal(t.listeners.length, 1);
  assert.equal(t.listeners[0].type, 'keydown');
  const ev = t.fire('ArrowLeft');
  assert.deepEqual(got, [{ move: 'left', pause: false }]);
  assert.equal(ev.prevented, true);
});

test('attachKeyboard ignores unmapped keys and leaves their default', async () => {
  const { attachKeyboard } = await keys();
  const t = fakeTarget();
  const got = [];
  attachKeyboard(t, (i) => got.push(i));
  const ev = t.fire('Tab');
  assert.deepEqual(got, []);
  assert.equal(ev.prevented, false);
});

test('attachKeyboard returns a detach function', async () => {
  const { attachKeyboard } = await keys();
  const t = fakeTarget();
  const got = [];
  const detach = attachKeyboard(t, (i) => got.push(i));
  detach();
  assert.equal(t.listeners.length, 0);
  t.fire('w');
  assert.deepEqual(got, []);
});

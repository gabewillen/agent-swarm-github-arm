// agent-28's own regression tests for src/input/keys.js (DESIGN.md §12).
// Hand-built event targets, so this runs anywhere node:test runs, with
// no DOM and no other agent's modules.
import test from 'node:test';
import assert from 'node:assert/strict';

const keys = () => import('../src/input/keys.js');

// The exact §12 mapping table.
const KEY_MAP = {
  ArrowUp: { move: 'up', pause: false },
  w: { move: 'up', pause: false },
  W: { move: 'up', pause: false },
  ArrowDown: { move: 'down', pause: false },
  s: { move: 'down', pause: false },
  S: { move: 'down', pause: false },
  ArrowLeft: { move: 'left', pause: false },
  a: { move: 'left', pause: false },
  A: { move: 'left', pause: false },
  ArrowRight: { move: 'right', pause: false },
  d: { move: 'right', pause: false },
  D: { move: 'right', pause: false },
  p: { move: null, pause: true },
  P: { move: null, pause: true },
  Escape: { move: null, pause: true },
};

test('keyToInput maps every §12 key exactly', async () => {
  const { keyToInput } = await keys();
  for (const [k, want] of Object.entries(KEY_MAP)) {
    assert.deepEqual(keyToInput(k), want, k);
  }
});

test('keyToInput returns null for anything unmapped', async () => {
  const { keyToInput } = await keys();
  for (const k of ['Enter', 'Tab', 'Shift', ' ', 'Space', '', 'x', 'Wx', 'Esc', 'arrowup', 'right', NaN, undefined, null, 12]) {
    assert.equal(keyToInput(k), null, String(k));
  }
});

test('swipes below 24 px on both axes are null, at the edge too', async () => {
  const { swipeToInput } = await keys();
  assert.equal(swipeToInput(0, 0), null);
  assert.equal(swipeToInput(23, -23), null);
  assert.equal(swipeToInput(-23.9, 23.9), null);
  assert.deepEqual(swipeToInput(-40, 10), { move: 'left', pause: false });
});

test('a swipe of exactly 24 px on an axis moves', async () => {
  const { swipeToInput } = await keys();
  assert.deepEqual(swipeToInput(24, 0), { move: 'right', pause: false });
  assert.deepEqual(swipeToInput(-24, 0), { move: 'left', pause: false });
  assert.deepEqual(swipeToInput(0, 24), { move: 'down', pause: false });
  assert.deepEqual(swipeToInput(0, -24), { move: 'up', pause: false });
  assert.deepEqual(swipeToInput(23, 40), { move: 'down', pause: false });
  assert.deepEqual(swipeToInput(-40, 30), { move: 'left', pause: false });
  assert.deepEqual(swipeToInput(10, -24), { move: 'up', pause: false });
});

test('a diagonal tie swipes horizontally, in both signs', async () => {
  const { swipeToInput } = await keys();
  assert.deepEqual(swipeToInput(-30, 30), { move: 'left', pause: false });
  assert.deepEqual(swipeToInput(30, 30), { move: 'right', pause: false });
  assert.deepEqual(swipeToInput(-24, 24), { move: 'left', pause: false });
  assert.deepEqual(swipeToInput(24, -24), { move: 'right', pause: false });
});

test('INPUT_QUEUE_MAX is 4', async () => {
  assert.equal((await keys()).INPUT_QUEUE_MAX, 4);
});

test('queuePush appends pure, dropping nulls and full queues', async () => {
  const { queuePush, INPUT_QUEUE_MAX } = await keys();
  const step = (q, input) => queuePush(Object.freeze(q), input);
  const head = (move) => ({ move, pause: false });
  assert.deepEqual(step([], null), []);
  let q = step([], head('up'));
  assert.deepEqual(q, [head('up')]);
  q = step(q, head('left'));
  assert.deepEqual(q, [head('up'), head('left')]);
  for (let i = q.length; i < INPUT_QUEUE_MAX; i++) q = step(q, head('down'));
  assert.equal(q.length, INPUT_QUEUE_MAX);
  const full = q;
  assert.deepEqual(step(full, head('right')), full, 'a full queue is unchanged');
  assert.deepEqual(step(full, head('right')).length, INPUT_QUEUE_MAX);
  assert.deepEqual(step(full, null), full);
});

test('queueTake returns the first input and the rest', async () => {
  const { queueTake, queuePush } = await keys();
  const head = (move) => ({ move, pause: false });
  let q = [];
  for (const m of ['up', 'left', 'down', 'right']) q = queuePush(q, head(m));
  const take = queueTake(Object.freeze(q));
  assert.deepEqual(take.input, head('up'));
  assert.deepEqual(take.queue, [head('left'), head('down'), head('right')]);
  assert.equal(q.length, 4, 'the queue given is unchanged');
  const pause = queuePush([], { move: null, pause: true });
  assert.deepEqual(queueTake(pause).input, { move: null, pause: true });
  assert.deepEqual(queueTake(pause).queue, []);
});

test('queueTake of an empty queue is no move and nothing', async () => {
  const { queueTake } = await keys();
  assert.deepEqual(queueTake([]), { input: { move: null, pause: false }, queue: [] });
});

test('attachKeyboard listens once, reports mapped keys, and prevents them', async () => {
  const { attachKeyboard } = await keys();
  const listeners = [];
  const target = {
    addEventListener: (type, fn) => listeners.push({ type, fn }),
    removeEventListener: (type, fn) => {
      const i = listeners.findIndex((l) => l.type === type && l.fn === fn);
      if (i >= 0) listeners.splice(i, 1);
    },
  };
  const fire = (key) => {
    const ev = { key, prevented: false, preventDefault() { this.prevented = true; } };
    for (const l of [...listeners]) if (l.type === 'keydown') l.fn(ev);
    return ev;
  };
  const got = [];
  const detach = attachKeyboard(target, (input) => got.push(input));
  assert.equal(listeners.length, 1);
  assert.equal(listeners[0].type, 'keydown');

  const ev = fire('ArrowUp');
  assert.deepEqual(got, [{ move: 'up', pause: false }]);
  assert.equal(ev.prevented, true);

  assert.equal(fire('Escape').prevented, true);
  assert.deepEqual(got[got.length - 1], { move: null, pause: true });

  const untouched = fire('Tab');
  assert.equal(untouched.prevented, false);
  assert.equal(got.length, 2, 'unmapped keys are not reported');

  const again = fire('W');
  assert.deepEqual(got[got.length - 1], { move: 'up', pause: false });
  assert.equal(again.prevented, true);

  detach();
  assert.equal(listeners.length, 0);
  detach();
  assert.equal(listeners.length, 0, 'detaching twice is harmless');
  assert.equal(fire('w').prevented, false, 'no listener, so no prevent');
});

test('the module imports without a DOM and exports the §12 names', async () => {
  const m = await keys();
  for (const n of ['keyToInput', 'swipeToInput', 'queuePush', 'queueTake', 'attachKeyboard', 'INPUT_QUEUE_MAX']) {
    assert.ok(n in m, `lacks ${n}`);
  }
});

// agent-28 selftest (not part of the acceptance suite): the input module
// (§12, tests 19) beyond the acceptance bar. What section 19 does not ask:
//   - an exhaustive sweep of the key space, so no other KeyboardEvent.key
//     maps to a move or a pause, and no mapped key maps to null;
//   - that mapped inputs are fresh objects: mutating one cannot poison
//     the next call;
//   - swipe edges exactly at the 24 px threshold, and the horizontal tie
//     at every magnitude, including zero and negatives;
//   - queue identity at the boundary: a full (or null) push returns the
//     same array, and queueTake hands back the queue's own first entry;
//   - attachKeyboard lifecycle independence: two adapters on one target
//     detach separately, and a detached adapter stops firing.
import test from 'node:test';
import assert from 'node:assert/strict';

const keys = await import('../src/input/keys.js');
const { keyToInput, swipeToInput, queuePush, queueTake, attachKeyboard, INPUT_QUEUE_MAX } = keys;

test('the mapped key space is exactly the fifteen keys of §12', () => {
  const moves = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    w: 'up', W: 'up',
    a: 'left', A: 'left',
    s: 'down', S: 'down',
    d: 'right', D: 'right',
  };
  for (const [key, move] of Object.entries(moves)) {
    assert.deepEqual(keyToInput(key), { move, pause: false }, key);
  }
  for (const key of ['p', 'P', 'Escape']) {
    assert.deepEqual(keyToInput(key), { move: null, pause: true }, key);
  }
  for (const key of ['Enter', 'x', ' ', 'Shift', '', 'ArrowUpX', 'é', 'Ω', 'F1',
    'PageDown', 'MediaTrackNext', 'Dead', 'Backspace', 'Tab', '+', '=',
    // A prototype leaf must not map: the mapper matches own properties.
    'constructor', 'toString', 'name', 'watch',
    String.fromCharCode(9), 'WASD']) {
    assert.equal(keyToInput(key), null, key);
  }
});

test('mapped inputs are fresh objects, not shared state', () => {
  const a = keyToInput('ArrowUp');
  a.move = 'down';
  a.pause = true;
  assert.deepEqual(keyToInput('ArrowUp'), { move: 'up', pause: false });
  const b = keyToInput('p');
  b.pause = false;
  assert.deepEqual(keyToInput('P'), { move: null, pause: true });
});

test('swipes measure the 24 px threshold by the travelled axis', () => {
  assert.equal(swipeToInput(0, 0), null);
  assert.equal(swipeToInput(23, -23), null);
  assert.equal(swipeToInput(-23, 23), null);
  assert.deepEqual(swipeToInput(24, 0), { move: 'right', pause: false });
  assert.deepEqual(swipeToInput(-24, 0), { move: 'left', pause: false });
  assert.deepEqual(swipeToInput(0, 24), { move: 'down', pause: false });
  assert.deepEqual(swipeToInput(0, -24), { move: 'up', pause: false });
  assert.deepEqual(swipeToInput(24, -24), { move: 'right', pause: false }); // tie
  assert.deepEqual(swipeToInput(-24, 24), { move: 'left', pause: false }); // tie
  assert.deepEqual(swipeToInput(24, -40), { move: 'up', pause: false });
  assert.deepEqual(swipeToInput(24, 40), { move: 'down', pause: false });
  assert.deepEqual(swipeToInput(100, 100), { move: 'right', pause: false });
});

test('the queue never exceeds INPUT_QUEUE_MAX and stays identity-pure', () => {
  assert.equal(INPUT_QUEUE_MAX, 4);
  const q = Object.freeze([]); // push and take must not write to a frozen queue
  let r = queuePush(q, { move: 'up', pause: false });
  assert.deepEqual(r, [{ move: 'up', pause: false }]);
  const first = { move: 'up', pause: false };
  let q2 = queuePush([], first);
  q2 = queuePush(q2, { move: 'down', pause: false });
  q2 = queuePush(q2, { move: 'left', pause: false });
  q2 = queuePush(q2, { move: 'right', pause: false });
  assert.equal(q2.length, 4);
  const extra = { move: 'up', pause: false };
  assert.equal(queuePush(q2, extra), q2); // full: the same array comes back
  assert.equal(queueTake(q2).input, q2[0]); // the queue's own first entry
  const emptied = queueTake(Object.freeze(q2)).queue;
  assert.deepEqual(emptied.map((i) => i.move), ['down', 'left', 'right']);
  let taken = queueTake(emptied);
  assert.equal(taken.input.move, 'down');
  taken = queueTake(taken.queue);
  taken = queueTake(taken.queue);
  taken = queueTake(taken.queue);
  assert.deepEqual(taken, { input: { move: null, pause: false }, queue: [] });
});

function fakeTarget() {
  const listeners = [];
  return {
    listeners,
    addEventListener(type, fn) { listeners.push({ type, fn }); },
    removeEventListener(type, fn) {
      const i = listeners.findIndex((l) => l.type === type && l.fn === fn);
      if (i >= 0) listeners.splice(i, 1);
    },
    fire(key) {
      const ev = { key, prevented: 0, preventDefault() { this.prevented += 1; } };
      for (const l of [...listeners]) if (l.type === 'keydown') l.fn(ev);
      return ev;
    },
  };
}

test('two adapters detach independently and only mapped keys prevent default', () => {
  const t = fakeTarget();
  const got = [];
  const detach1 = attachKeyboard(t, (i) => got.push('one:' + i.move));
  const detach2 = attachKeyboard(t, (i) => got.push('two:' + i.move));
  assert.equal(t.listeners.length, 2);
  const ev = t.fire('ArrowLeft');
  assert.deepEqual(got, ['one:left', 'two:left']);
  assert.equal(ev.prevented, 2); // preventDefault once per adapter
  detach1();
  assert.equal(t.listeners.length, 1);
  t.fire('w');
  assert.deepEqual(got, ['one:left', 'two:left', 'two:up']);
  detach2();
  assert.equal(t.listeners.length, 0);
  const quiet = t.fire('d');
  assert.deepEqual(got, ['one:left', 'two:left', 'two:up']);
  assert.equal(quiet.prevented, 0);
  // A detached adapter can be re-attached; the game keeps playing.
  const again = attachKeyboard(t, (i) => got.push('redo:' + i.move));
  t.fire('p');
  assert.deepEqual(got, ['one:left', 'two:left', 'two:up', 'redo:null']);
  again();
  assert.equal(t.listeners.length, 0);
});

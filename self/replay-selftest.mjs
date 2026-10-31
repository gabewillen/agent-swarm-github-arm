// agent-14's self-test for src/core/replay.js (DESIGN.md §18). It imports
// the real module with the './game.js' import redirected to self/game-stub.mjs,
// so it can run before src/core/game.js exists. Run with:
//   node --test self/replay-selftest.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const stub = new URL('./game-stub.mjs', import.meta.url).href;
const source = readFileSync(new URL('../src/core/replay.js', import.meta.url), 'utf8');
const rewritten = source.replace("from './game.js'", `from ${JSON.stringify(stub)}`);
assert.notEqual(rewritten, source, 'the import specifier to redirect was not found');
const replay = await import('data:text/javascript,' + encodeURIComponent(rewritten));
const stubMod = await import(stub);
const { CALLS } = stubMod;
const P = { move: null, pause: true };

const fresh = () => { CALLS.init = []; CALLS.step = []; };

test('charOf maps inputs to characters, pause wins', () => {
  fresh();
  const { charOf } = replay;
  assert.equal(charOf({ move: 'up', pause: false }), 'u');
  assert.equal(charOf({ move: 'right', pause: false }), 'r');
  assert.equal(charOf({ move: 'down', pause: false }), 'd');
  assert.equal(charOf({ move: 'left', pause: false }), 'l');
  assert.equal(charOf({ move: null, pause: false }), '.');
  assert.equal(charOf(undefined), '.');
  assert.equal(charOf({}), '.');
  assert.equal(charOf({ move: 'up', pause: true }), 'p');
});

test('inputOf maps characters back to inputs', () => {
  fresh();
  const { inputOf } = replay;
  assert.deepEqual(inputOf('u'), { move: 'up', pause: false });
  assert.deepEqual(inputOf('r'), { move: 'right', pause: false });
  assert.deepEqual(inputOf('d'), { move: 'down', pause: false });
  assert.deepEqual(inputOf('l'), { move: 'left', pause: false });
  assert.deepEqual(inputOf('.'), { move: null, pause: false });
  assert.deepEqual(inputOf('p'), { move: null, pause: true });
});

test('recordReplay keeps the seed, level, and moves', () => {
  fresh();
  const { recordReplay } = replay;
  assert.deepEqual(
    recordReplay(-1, [{ move: 'up', pause: false }, { move: null, pause: false }, P, { move: 'left', pause: false }], { level: 2 }),
    { seed: 4294967295, level: 2, moves: 'u.pl' },
  );
  assert.deepEqual(recordReplay(5, []), { seed: 5, level: 0, moves: '' });
  assert.deepEqual(recordReplay(5, []), { seed: 5, level: 0, moves: '' }, 'options omitted');
  const inputs = [P, { move: 'down', pause: false }];
  const before = inputs.map((i) => ({ ...i }));
  recordReplay(1, inputs);
  assert.deepEqual(inputs, before, 'recordReplay must not change its inputs');
});

test('encodeReplay run-length codes moves; runs of one stay alone', () => {
  fresh();
  const { encodeReplay } = replay;
  assert.equal(encodeReplay({ seed: 7, level: 1, moves: 'uuu.r' }), 'QR1:7:1:3u.r');
  assert.equal(encodeReplay({ seed: 0, level: 0, moves: '' }), 'QR1:0:0:');
  assert.equal(encodeReplay({ seed: 9, level: 0, moves: '............rr' }), 'QR1:9:0:12.2r');
  assert.equal(encodeReplay({ seed: 2, level: 3, moves: 'p' }), 'QR1:2:3:p');
  assert.equal(encodeReplay({ seed: 4294967295, level: 0, moves: 'uu' }), 'QR1:4294967295:0:2u');
});

test('decodeReplay reverses encodeReplay for samples', () => {
  fresh();
  const { encodeReplay, decodeReplay } = replay;
  const samples = [
    { seed: 7, level: 1, moves: 'uuu.r' },
    { seed: 4294967295, level: 9, moves: 'pppplllll.......dur' },
    { seed: 3, level: 0, moves: '' },
    { seed: 0, level: 0, moves: 'u.rl.d' },
    { seed: 12, level: 4, moves: '.pppddd............lllll' },
    { seed: 1, level: 1, moves: 'rud.rdp' },
  ];
  for (const r of samples) assert.deepEqual(decodeReplay(encodeReplay(r)), r);
});

test('decodeReplay refuses malformed text', () => {
  fresh();
  const { decodeReplay } = replay;
  const bad = [
    'QR2:1:0:u', 'QR1:x:0:u', 'QR1:1:-1:u', 'QR1:4294967296:0:u', 'QR1:1:0:z',
    'QR1:1:0:3', 'QR1:1:0:1u', 'QR1:1:0:0u', 'nonsense', '', 'QR1:1:0',
    'QR1:1:0:u:u', 'QR1:1:1.5:u', 'QR1:', 'QR1:1:0:2q',
  ];
  for (const t of bad) assert.equal(decodeReplay(t), null, t);
  assert.deepEqual(decodeReplay('QR1:4294967295:0:2u'), { seed: 4294967295, level: 0, moves: 'uu' }, 'seed at the top of the range is fine');
  assert.deepEqual(decodeReplay('QR1:1:0:9p'), { seed: 1, level: 0, moves: 'p'.repeat(9) }, 'a count of 9 is fine');
  assert.deepEqual(decodeReplay('QR1:0:0:p2.'), { seed: 0, level: 0, moves: 'p..' }, 'a count of a dot run decodes');
});

test('playReplay calls init once and steps every character', () => {
  fresh();
  const { playReplay, inputOf } = replay;
  const levels = [{ name: 'only' }];
  // A mirror of the fold playReplay must do, against the same stub.
  const state0 = { seed: 21, level: 2, levels, player: { x: 0, y: 0 }, log: [] };
  const expected = [{ init: { seed: 21, level: 2, levels } }];
  let s = state0;
  for (const ch of 'ur.dp') {
    const input = inputOf(ch);
    expected.push({ from: s, input });
    s = { ...s, log: [...s.log, input.move + (input.pause ? '!' : '')] };
  }
  const state = playReplay({ seed: 21, level: 2, moves: 'ur.dp' }, levels);
  assert.deepEqual(CALLS.init, [expected[0].init], 'init is called once with the seed, level, and levels');
  assert.deepEqual(CALLS.step, expected.slice(1), 'every character becomes one step, in order');
  assert.deepEqual(state, s, 'the final state is the last step’s');
});

test('playReplay without levels leaves init to its default', () => {
  fresh();
  const { playReplay } = replay;
  playReplay({ seed: 4, level: 0, moves: '' });
  assert.deepEqual(CALLS.init, [{ seed: 4, level: 0, levels: null }]);
});

test('encode and decode hold many long runs round-trip', () => {
  fresh();
  const { encodeReplay, decodeReplay } = replay;
  const r = { seed: 123456789, level: 7, moves: '.'.repeat(1000) + 'r'.repeat(2) + 'p'.repeat(150) };
  assert.equal(encodeReplay(r).length, 'QR1:123456789:7:'.length + '1000.2r150p'.length);
  assert.deepEqual(decodeReplay(encodeReplay(r)), r);
});

// Self-tests for the replay area (DESIGN.md §18, src/core/replay.js).
// These live outside tests/ so they never gate the swarm; run with
//   node --test selftest/replay.test.mjs
// The playReplay tests skip themselves while src/core/game.js (areas 3
// and 4) is still landing.
import test from 'node:test';
import assert from 'node:assert/strict';

const replay = await import('../src/core/replay.js');
const { charOf, inputOf, recordReplay, encodeReplay, decodeReplay, playReplay } = replay;

let game = null;
try {
  game = await import('../src/core/game.js');
} catch {
  game = null;
}
const gameOk = () => game && typeof game.init === 'function' && typeof game.step === 'function';

const NONE = { move: null, pause: false };
const mv = (move) => ({ move, pause: false });

test('charOf covers moves, pauses, and missing inputs', () => {
  assert.equal(charOf(mv('up')), 'u');
  assert.equal(charOf(mv('right')), 'r');
  assert.equal(charOf(mv('down')), 'd');
  assert.equal(charOf(mv('left')), 'l');
  assert.equal(charOf(mv(null)), '.');
  assert.equal(charOf(undefined), '.');
  assert.equal(charOf(null), '.');
  assert.equal(charOf(7), '.');
  assert.equal(charOf('up'), '.');
  assert.equal(charOf({ move: 'up', pause: true }), 'p');
  assert.equal(charOf({ move: 'left', pause: true }), 'p');
  assert.equal(charOf({ move: null, pause: false }), '.');
  assert.equal(charOf({}), '.');
});

test('inputOf reverses charOf exactly', () => {
  for (const ch of ['u', 'r', 'd', 'l', '.', 'p']) {
    assert.deepEqual(inputOf(ch), charToInput(ch));
  }
  // Never mutates its argument's twin: fresh objects each call.
  assert.notEqual(inputOf('u'), inputOf('u'));
});

function charToInput(ch) {
  const moves = { u: 'up', r: 'right', d: 'down', l: 'left' };
  if (ch === 'p') return { move: null, pause: true };
  if (moves[ch]) return { move: moves[ch], pause: false };
  return NONE;
}

test('charOf and inputOf round trip through recordReplay', () => {
  const inputs = [mv('up'), mv(null), { move: 'up', pause: true }, mv('left'), NONE, undefined, mv('down')];
  const r = recordReplay(7, inputs);
  const back = [...r.moves].map(inputOf);
  // A pause with a move steps as a pause (§6 step 2), so it restores as one.
  assert.deepEqual(back, inputs.map((i) => (i && i.pause ? { move: null, pause: true } : i === undefined ? NONE : i)));
});

test('recordReplay keeps seed as seed>>>0, the level, and the moves', () => {
  assert.deepEqual(recordReplay(-1, [mv('up'), mv(null), { move: null, pause: true }, mv('left')], { level: 2 }),
    { seed: 4294967295, level: 2, moves: 'u.pl' });
  assert.deepEqual(recordReplay(5, []), { seed: 5, level: 0, moves: '' });
  assert.deepEqual(recordReplay(-7, [mv('down')]), { seed: 4294967289, level: 0, moves: 'd' });
  assert.deepEqual(recordReplay(3, undefined), { seed: 3, level: 0, moves: '' });
  assert.deepEqual(recordReplay(2 ** 33, []), { seed: 0, level: 0, moves: '' });
});

test('encodeReplay run-length codes runs of 2, 3, 12', () => {
  assert.equal(encodeReplay({ seed: 7, level: 1, moves: 'uuu.r' }), 'QR1:7:1:3u.r');
  assert.equal(encodeReplay({ seed: 0, level: 0, moves: '' }), 'QR1:0:0:');
  assert.equal(encodeReplay({ seed: 9, level: 0, moves: '............rr' }), 'QR1:9:0:12.2r');
  assert.equal(encodeReplay({ seed: 1, level: 0, moves: 'd' }), 'QR1:1:0:d');
  // A run of 2 costs the same two characters, so encoding never grows.
  assert.equal(encodeReplay({ seed: 1, level: 0, moves: 'rl' }), 'QR1:1:0:rl');
  assert.equal(encodeReplay({ seed: 4294967295, level: 9, moves: 'pppplllll.......dur' }),
    'QR1:4294967295:9:4p5l7.dur');
  assert.equal(encodeReplay({ seed: 3, level: 0, moves: 'u'.repeat(120) }), 'QR1:3:0:120u');
});

test('a count may encode the literal `.` and repeats of one char', () => {
  assert.deepEqual(decodeReplay('QR1:1:0:3.'), { seed: 1, level: 0, moves: '...' });
  assert.deepEqual(decodeReplay('QR1:1:0:2r.2r'), { seed: 1, level: 0, moves: 'rr.rr' });
  assert.deepEqual(decodeReplay('QR1:1:0:60p'), { seed: 1, level: 0, moves: 'p'.repeat(60) });
  assert.deepEqual(decodeReplay('QR1:1:0:100u'), { seed: 1, level: 0, moves: 'u'.repeat(100) });
});

test('decodeReplay reverses encodeReplay', () => {
  for (const r of [
    { seed: 7, level: 1, moves: 'uuu.r' },
    { seed: 4294967295, level: 9, moves: 'pppplllll.......dur' },
    { seed: 3, level: 0, moves: '' },
    { seed: 0, level: 0, moves: 'ru' },
  ]) {
    assert.deepEqual(decodeReplay(encodeReplay(r)), r);
  }
});

test('decodeReplay refuses every malformed encoding', () => {
  for (const text of [
    'QR2:1:0:u', 'QR1:x:0:u', 'QR1:1:-1:u', 'QR1:+1:0:u', 'QR1: 1:0:u',
    'QR1:4294967296:0:u', 'QR1:1:0:z', 'QR1:1:0:3', 'QR1:1:0:1u', 'QR1:1:0:0u',
    'QR1:1:0:2z', 'QR1:1:0:u3', 'QR1:1:0', 'QR1:1:0:u:extra', 'nonsense', '',
    'QR1:1:0:U', 'QR2', null, undefined, 7,
  ]) {
    assert.equal(decodeReplay(text), null, JSON.stringify(text));
  }
});

test('decodeReplay accepts the extreme well-formed seeds', () => {
  assert.deepEqual(decodeReplay('QR1:0:0:'), { seed: 0, level: 0, moves: '' });
  assert.deepEqual(decodeReplay('QR1:4294967295:19:p'), { seed: 4294967295, level: 19, moves: 'p' });
});

test('random moves survive record, encode, and decode', () => {
  // The test harness may use Math.random; src/ may not (§1).
  for (let trial = 0; trial < 40; trial++) {
    let moves = '';
    for (let i = 0; i < 1 + Math.floor(Math.random() * 60); i++) {
      moves += 'urdl.p'[Math.floor(Math.random() * 6)];
    }
    const r = { seed: Math.floor(Math.random() * 4294967296), level: Math.floor(Math.random() * 4), moves };
    assert.deepEqual(decodeReplay(encodeReplay(r)), r, moves);
    assert.ok(encodeReplay(r).length <= moves.length + 'QR1:4294967295:19:'.length);
  }
});

test('playReplay replays a recorded game exactly', (t) => {
  if (!gameOk()) return t.skip('src/core/game.js has not landed yet');
  const lvl = { name: 't', quorum: 1, par: 100, driftPeriod: 1, spawnEvery: 5, map: ['#########', '#@P.M..X#', '#.>..P..#', '#########'] };
  const { init, step } = game;
  const inputs = [mv('right'), mv('right'), mv('right'), mv(null), mv('down'), mv('left'), { move: null, pause: true }, mv('left'), { move: null, pause: true }, mv('up'), mv('right'), mv('right')];
  let s = init(21, { levels: [lvl] });
  for (const i of inputs) s = step(s, i);
  assert.deepEqual(playReplay(recordReplay(21, inputs), [lvl]), s);
});

test('playReplay starts at the replay level and tolerates no levels argument', (t) => {
  if (!gameOk()) return t.skip('src/core/game.js has not landed yet');
  const levels = [
    { name: 'a', quorum: 1, par: 100, driftPeriod: 1, spawnEvery: 1000, map: ['######', '#@PMX#', '######'] },
    { name: 'b', quorum: 1, par: 100, driftPeriod: 1, spawnEvery: 1000, map: ['######', '#X.P@#', '#..M.#', '######'] },
  ];
  const s = playReplay({ seed: 1, level: 1, moves: 'l' }, levels);
  assert.equal(s.level.name, 'b');
  assert.deepEqual(s.player, { x: 3, y: 1 });
});

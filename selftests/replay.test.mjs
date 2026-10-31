// agent-33's own checks for src/core/replay.js (DESIGN.md §18).
// Run: node --test selftests/replay.test.mjs
// Not part of tests/ (which is pinned); this only lives to iterate faster
// and to cover the pure functions beyond the acceptance tests.
import test from 'node:test';
import assert from 'node:assert/strict';

const P = { move: null, pause: true };
const mv = (move) => ({ move, pause: false });

const { charOf, inputOf, recordReplay, encodeReplay, decodeReplay, playReplay } =
  await import('../src/core/replay.js');

// The defensive game.js load: a missing module only stops playReplay.
let game = null;
try { game = await import('../src/core/game.js'); } catch { game = null; }
const hasGame = !!game && typeof game.init === 'function';

test('charOf maps every case, pause wins', () => {
  assert.equal(charOf(mv('up')), 'u');
  assert.equal(charOf(mv('right')), 'r');
  assert.equal(charOf(mv('down')), 'd');
  assert.equal(charOf(mv('left')), 'l');
  assert.equal(charOf(mv(null)), '.');
  assert.equal(charOf(undefined), '.');
  assert.equal(charOf(null), '.');
  assert.equal(charOf({}), '.');
  assert.equal(charOf({ move: 'up', pause: true }), 'p');
  assert.equal(charOf({ pause: true }), 'p');
  assert.equal(charOf({ move: null, pause: false }), '.');
  assert.equal(charOf({ move: 'z' }), '.');
});

test('inputOf maps every step character', () => {
  assert.deepEqual(inputOf('u'), mv('up'));
  assert.deepEqual(inputOf('r'), mv('right'));
  assert.deepEqual(inputOf('d'), mv('down'));
  assert.deepEqual(inputOf('l'), mv('left'));
  assert.deepEqual(inputOf('.'), mv(null));
  assert.deepEqual(inputOf('p'), P);
});

test('recordReplay normalizes the seed and defaults the level', () => {
  assert.deepEqual(recordReplay(-1, [mv('up'), mv(null), P, mv('left')], { level: 2 }),
    { seed: 4294967295, level: 2, moves: 'u.pl' });
  assert.deepEqual(recordReplay(5, []), { seed: 5, level: 0, moves: '' });
  assert.deepEqual(recordReplay(5), { seed: 5, level: 0, moves: '' });
  assert.deepEqual(recordReplay(5, [mv('up')], {}), { seed: 5, level: 0, moves: 'u' });
  assert.deepEqual(recordReplay(0, [mv('down'), P]), { seed: 0, level: 0, moves: 'dp' });
});

const roundTripCases = [
  { seed: 7, level: 1, moves: 'uuu.r' },
  { seed: 0, level: 0, moves: '' },
  { seed: 9, level: 0, moves: '............rr' },
  { seed: 4294967295, level: 9, moves: 'pppplllll.......dur' },
  { seed: 1, level: 0, moves: 'updu' },
  { seed: 3, level: 0, moves: 'pppppppppppppppppppp' },
  { seed: 100, level: 3, moves: 'r'.repeat(37) },
];

test('encodeReplay run-length codes runs of 2 or more', () => {
  assert.equal(encodeReplay({ seed: 7, level: 1, moves: 'uuu.r' }), 'QR1:7:1:3u.r');
  assert.equal(encodeReplay({ seed: 0, level: 0, moves: '' }), 'QR1:0:0:');
  assert.equal(encodeReplay({ seed: 9, level: 0, moves: '............rr' }), 'QR1:9:0:12.2r');
  assert.equal(encodeReplay({ seed: 1, level: 0, moves: 'updu' }), 'QR1:1:0:updu');
  assert.equal(encodeReplay({ seed: 2, level: 0, moves: 'ddddddddddd' }), 'QR1:2:0:11d');
});

test('encode/decode round trip', () => {
  for (const r of roundTripCases) {
    assert.deepEqual(decodeReplay(encodeReplay(r)), r);
  }
});

test('decodeReplay refuses malformed text', () => {
  const bad = [
    'QR2:1:0:u', 'QR1:x:0:u', 'QR1:1:-1:u', 'QR1:4294967296:0:u',
    'QR1:1:0:z', 'QR1:1:0:3', 'QR1:1:0:1u', 'QR1:1:0:0u',
    'nonsense', '', 'QR1', 'QR1:1', 'QR1:1:0', 'qr1:1:0:u',
    ' QR1:1:0:u', 'QR1:1:0:1.5u', 'QR1: 1:0:u', 'QR1:1:0:2p:',
    'QR1:1:0:2u3', 'QR1:1:0:u3', undefined, null, 42, 7,
  ];
  for (const t of bad) assert.equal(decodeReplay(t), null, String(t));
});

test('decodeReplay accepts well-formed singles too', () => {
  assert.deepEqual(decodeReplay('QR1:1:0:up'), { seed: 1, level: 0, moves: 'up' });
  assert.deepEqual(decodeReplay('QR1:1:0:u.'), { seed: 1, level: 0, moves: 'u.' });
});

test('decodeReplay accepts well-formed unusual counts', () => {
  assert.deepEqual(decodeReplay('QR1:1:0:2p'), { seed: 1, level: 0, moves: 'pp' });
  assert.deepEqual(decodeReplay('QR1:1:0:12.2r'), { seed: 1, level: 0, moves: '.'.repeat(12) + 'rr' });
  assert.deepEqual(decodeReplay('QR1:4294967295:23:9u'), { seed: 4294967295, level: 23, moves: 'uuuuuuuuu' });
});

test('playReplay fails cleanly when the rules are missing', { skip: hasGame }, () => {
  assert.throws(() => playReplay({ seed: 1, level: 0, moves: '' }), /game\.js/);
});

// A level with a drift so stepping is non-trivial.
const lvl = (map, extra = {}) =>
  ({ name: 'a', quorum: 1, par: 100, driftPeriod: 2, spawnEvery: 20, map, ...extra });
const LEVELS = [
  lvl(['#########', '#@P.M..X#', '#.>..P..#', '#########'], { spawnEvery: 5 }),
  lvl(['######', '#X.P@#', '#..M.#', '######'], { name: 'b', par: 42 }),
];
const INPUTS = ['right', 'right', 'right', null, 'down', 'left', P, 'left', P, 'up', 'right', 'right'];

test('playReplay reproduces stepping exactly, across seeds', { skip: !hasGame }, () => {
  const { init, step } = game;
  for (const seed of [0, 1, 7, 21, 9999, 4294967295]) {
    let s = init(seed, { levels: LEVELS });
    for (let i = 0; i < 60; i++) s = step(s, INPUTS[i % INPUTS.length]);
    const r = recordReplay(seed, Array.from({ length: 60 }, (_, i) => INPUTS[i % INPUTS.length]));
    assert.deepEqual(playReplay(r, LEVELS), s, `seed ${seed}`);
  }
});

test('playReplay starts at the given level', { skip: !hasGame }, () => {
  const s = playReplay({ seed: 1, level: 1, moves: 'l' }, LEVELS);
  assert.equal(s.level.name, 'b');
  assert.deepEqual(s.player, { x: 3, y: 1 });
  assert.equal(s.score, 0);
});

test('playReplay survives encode -> decode, and prints compress', { skip: !hasGame }, () => {
  const { init, step } = game;
  let s = init(31, { levels: LEVELS });
  const many = [];
  for (let i = 0; i < 200; i++) {
    const input = i % 7 === 0 ? P : INPUTS[i % INPUTS.length];
    many.push(input);
    s = step(s, input);
  }
  const text = encodeReplay(recordReplay(31, many));
  assert.ok(text.length <= 9 + many.length + 4, text.length);
  assert.ok(decodeReplay(text), text);
  assert.deepEqual(playReplay(decodeReplay(text), LEVELS), s);
});

test('recordReplay -> playReplay -> recordReplay is a fixed point', { skip: !hasGame }, () => {
  const r = recordReplay(77, INPUTS);
  assert.deepEqual(recordReplay(r.seed, r.moves.split('').map((ch) => inputOf(ch)), { level: r.level }), r);
});

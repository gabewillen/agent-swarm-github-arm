// agent-33's own local checks for src/core/replay.js (§18). Not part of the
// acceptance suite; run with: node --test local-tests/
import test from 'node:test';
import assert from 'node:assert/strict';

const P = { move: null, pause: true };
const mv = (move) => ({ move, pause: false });
const replay = () => import('../src/core/replay.js');

test('charOf and inputOf', async () => {
  const { charOf, inputOf } = await replay();
  assert.equal(charOf(mv('up')), 'u');
  assert.equal(charOf(mv('right')), 'r');
  assert.equal(charOf(mv('down')), 'd');
  assert.equal(charOf(mv('left')), 'l');
  assert.equal(charOf(mv(null)), '.');
  assert.equal(charOf(null), '.');
  assert.equal(charOf(undefined), '.');
  assert.equal(charOf({}), '.');
  assert.equal(charOf({ pause: true }), 'p');
  assert.equal(charOf({ move: 'up', pause: true }), 'p');
  assert.deepEqual(inputOf('u'), mv('up'));
  assert.deepEqual(inputOf('r'), mv('right'));
  assert.deepEqual(inputOf('d'), mv('down'));
  assert.deepEqual(inputOf('l'), mv('left'));
  assert.deepEqual(inputOf('.'), mv(null));
  assert.deepEqual(inputOf('p'), P);
});

test('recordReplay keeps seed, level, and moves', async () => {
  const { recordReplay } = await replay();
  assert.deepEqual(recordReplay(-1, [mv('up'), mv(null), P, mv('left')], { level: 2 }),
    { seed: 4294967295, level: 2, moves: 'u.pl' });
  assert.deepEqual(recordReplay(5, []), { seed: 5, level: 0, moves: '' });
  assert.deepEqual(recordReplay(5, [], {}), { seed: 5, level: 0, moves: '' });
  assert.deepEqual(recordReplay(9, [mv('down')]), { seed: 9, level: 0, moves: 'd' });
});

test('encodeReplay run-length codes the moves', async () => {
  const { encodeReplay } = await replay();
  assert.equal(encodeReplay({ seed: 7, level: 1, moves: 'uuu.r' }), 'QR1:7:1:3u.r');
  assert.equal(encodeReplay({ seed: 0, level: 0, moves: '' }), 'QR1:0:0:');
  assert.equal(encodeReplay({ seed: 9, level: 0, moves: '............rr' }), 'QR1:9:0:12.2r');
  assert.equal(encodeReplay({ seed: 2, level: 0, moves: 'u' }), 'QR1:2:0:u');
  assert.equal(encodeReplay({ seed: -1, level: 3, moves: 'pp' }), 'QR1:4294967295:3:2p');
});

test('decodeReplay reverses encodeReplay', async () => {
  const { encodeReplay, decodeReplay } = await replay();
  for (const r of [
    { seed: 7, level: 1, moves: 'uuu.r' },
    { seed: 4294967295, level: 9, moves: 'pppplllll.......dur' },
    { seed: 3, level: 0, moves: '' },
    { seed: 1, level: 0, moves: 'urdl.p' },
    { seed: 2, level: 5, moves: '.' },
  ]) {
    assert.deepEqual(decodeReplay(encodeReplay(r)), r);
  }
});

test('decodeReplay refuses malformed text', async () => {
  const { decodeReplay } = await replay();
  for (const t of [
    'QR2:1:0:u', 'QR1:x:0:u', 'QR1:1:-1:u', 'QR1:4294967296:0:u', 'QR1:1:0:z',
    'QR1:1:0:3', 'QR1:1:0:1u', 'QR1:1:0:0u', 'nonsense', '',
    'QR1:1:0', 'QR1:1:0:u:u', 'QR1:1:0:3:', 'QR1:1:0:2x', null, 7,
    'QR1:1:x:u', 'QR1:99999999999999999999:0:u', ' QR1:1:0:u',
  ]) {
    assert.equal(decodeReplay(t), null, JSON.stringify(t));
  }
});

// A seeded roll over the six characters, deterministic across runs.
function movesFixture(n) {
  let x = 987654321;
  const next = () => {
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    x = x >>> 0;
    return (x % 9973) / 9973;
  };
  let out = '';
  while (out.length < n) {
    const v = next();
    out += v < 0.2 ? 'u' : v < 0.4 ? 'r' : v < 0.6 ? 'd' : v < 0.8 ? 'l' : v < 0.9 ? '.' : 'p';
  }
  return out.slice(0, n);
}

test('encode/decode round trip on varied runs', async () => {
  const { encodeReplay, decodeReplay } = await replay();
  for (const moves of ['u', 'uu', 'urdl.p'.repeat(12),
    '.....rrrrrrrrrruuuuuuuuuud', movesFixture(33), 'd' + 'pp', '............rr']) {
    const r = { seed: (moves.length * 1234567) % 4294967296, level: 2, moves };
    assert.deepEqual(decodeReplay(encodeReplay(r)), r, JSON.stringify(moves));
  }
});

test('playReplay reproduces a game exactly', async () => {
  let game;
  try {
    game = await import('../src/core/game.js');
  } catch {
    return; // waits until src/core/game.js (and its deps) land on main
  }
  const { recordReplay, playReplay } = await replay();
  const { lvl } = await import('../tests/helpers.mjs');
  const levels = [lvl(['#########', '#@P.M..X#', '#.>..P..#', '#########'], { spawnEvery: 5 })];
  const inputs = ['right', 'right', 'right', null, 'down', 'left', P, 'left', P, 'up', 'right', 'right']
    .map((m) => (typeof m === 'string' || m === null ? mv(m) : m));
  let s = game.init(21, { levels });
  for (const i of inputs) s = game.step(s, i);
  assert.deepEqual(playReplay(recordReplay(21, inputs), levels), s);
  const r = recordReplay(21, inputs);
  assert.deepEqual(playReplay(decodeReplay(encodeReplay(r)), levels), s);
});

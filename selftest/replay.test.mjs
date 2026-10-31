// agent-14's own tests for src/core/replay.js (DESIGN.md §18). These are
// not part of the acceptance suite; they live outside tests/ on purpose.
import test from 'node:test';
import assert from 'node:assert/strict';

// replay.js statically imports ./game.js, which another agent builds.
// A missing game.js makes replay.js unloadable; while that is true these
// tests report themselves as skipped instead of failing.
let replay = null;
let skipReason = null;
try {
  replay = await import('../src/core/replay.js');
} catch (err) {
  const text = String(err?.message ?? err);
  if (/game\.js/.test(text) && /Cannot find|not found|ERR_MODULE_NOT_FOUND/i.test(text)) {
    skipReason = 'src/core/game.js has not landed yet';
  } else {
    throw err;
  }
}

const mv = (move) => ({ move, pause: false });
const P = { move: null, pause: true };

test('charOf maps every input shape', { skip: skipReason ?? false }, () => {
  const { charOf } = replay;
  assert.equal(charOf(mv('up')), 'u');
  assert.equal(charOf(mv('right')), 'r');
  assert.equal(charOf(mv('down')), 'd');
  assert.equal(charOf(mv('left')), 'l');
  assert.equal(charOf(mv(null)), '.');
  assert.equal(charOf(undefined), '.');
  assert.equal(charOf(null), '.');
  assert.equal(charOf({}), '.');
  assert.equal(charOf({ move: 'up' }), 'u');
  assert.equal(charOf({ move: 'up', pause: true }), 'p');
  assert.equal(charOf({ move: null, pause: true }), 'p');
  assert.equal(charOf({ move: null, pause: false }), '.');
  assert.equal(charOf({ move: 'sideways', pause: false }), '.');
});

test('inputOf reverses charOf exactly', { skip: skipReason ?? false }, () => {
  const { inputOf, charOf } = replay;
  assert.deepEqual(inputOf('u'), { move: 'up', pause: false });
  assert.deepEqual(inputOf('r'), { move: 'right', pause: false });
  assert.deepEqual(inputOf('d'), { move: 'down', pause: false });
  assert.deepEqual(inputOf('l'), { move: 'left', pause: false });
  assert.deepEqual(inputOf('.'), { move: null, pause: false });
  assert.deepEqual(inputOf('p'), { move: null, pause: true });
  assert.equal(inputOf('z'), null);
  assert.equal(inputOf(''), null);
  for (const ch of ['u', 'r', 'd', 'l']) {
    assert.equal(charOf(inputOf(ch)), ch, `round trip of ${ch}`);
  }
  assert.equal(charOf(inputOf('.')), '.');
  assert.equal(charOf(inputOf('p')), 'p');
});

test('recordReplay keeps the seed, level, and moves', { skip: skipReason ?? false }, () => {
  const { recordReplay } = replay;
  const r = recordReplay(-1, [mv('up'), mv(null), P, mv('left')], { level: 2 });
  assert.deepEqual(r, { seed: 4294967295, level: 2, moves: 'u.pl' });
  assert.deepEqual(recordReplay(5, []), { seed: 5, level: 0, moves: '' });
  assert.deepEqual(recordReplay(5, [], {}), { seed: 5, level: 0, moves: '' });
  assert.deepEqual(recordReplay(5, [], { level: 7 }), { seed: 5, level: 7, moves: '' });
  assert.deepEqual(recordReplay(0, [P, P, P]), { seed: 0, level: 0, moves: 'ppp' });
  assert.deepEqual(recordReplay(9, [mv('down'), undefined, mv('up')]), { seed: 9, level: 0, moves: 'd.u' });
  // Recording must not change its inputs.
  const inputs = [mv('up'), P];
  recordReplay(1, inputs, { level: 1 });
  assert.deepEqual(inputs, [mv('up'), P]);
});

test('encodeReplay run-length codes the moves', { skip: skipReason ?? false }, () => {
  const { encodeReplay } = replay;
  assert.equal(encodeReplay({ seed: 7, level: 1, moves: 'uuu.r' }), 'QR1:7:1:3u.r');
  assert.equal(encodeReplay({ seed: 0, level: 0, moves: '' }), 'QR1:0:0:');
  assert.equal(encodeReplay({ seed: 9, level: 0, moves: '............rr' }), 'QR1:9:0:12.2r');
  assert.equal(encodeReplay({ seed: 9, level: 0, moves: 'u' }), 'QR1:9:0:u');
  assert.equal(encodeReplay({ seed: 9, level: 0, moves: 'uuuuuuuuuuuuuuuuuuuu' }), 'QR1:9:0:20u');
  assert.equal(encodeReplay({ seed: 4294967295, level: 23, moves: '..p.' }), 'QR1:4294967295:23:2.p.');
});

test('decodeReplay reverses encodeReplay, including long runs', { skip: skipReason ?? false }, () => {
  const { encodeReplay, decodeReplay } = replay;
  const replays = [
    { seed: 7, level: 1, moves: 'uuu.r' },
    { seed: 4294967295, level: 9, moves: 'pppplllll.......dur' },
    { seed: 3, level: 0, moves: '' },
    { seed: 42, level: 0, moves: '.' },
    { seed: 42, level: 0, moves: 'p' },
    { seed: 42, level: 0, moves: '.'.repeat(20) + 'p' + 'l' },
    { seed: 1, level: 1, moves: 'u'.repeat(100) + 'r' },
  ];
  for (const r of replays) {
    assert.deepEqual(decodeReplay(encodeReplay(r)), r);
  }
  // Multi-digit counts decode positionally: 12 p's, then 345 l's.
  assert.deepEqual(decodeReplay('QR1:42:0:12p345l'), {
    seed: 42, level: 0, moves: 'p'.repeat(12) + 'l'.repeat(345),
  });
});

test('decodeReplay refuses malformed encodings', { skip: skipReason ?? false }, () => {
  const { decodeReplay } = replay;
  const bad = [
    'QR2:1:0:u', 'qr1:1:0:u', 'QR1', 'QR1:', 'QR1::', 'QR1:::',
    'QR1:x:0:u', 'QR1:0x1:0:u', 'QR1:1.5:0:u', 'QR1:-1:0:u',
    'QR1:1:-1:u', 'QR1:1:x:u', 'QR1:1:1.5:u',
    'QR1:4294967296:0:u', 'QR1:99999999999:0:u',
    'QR1:1:0:z', 'QR1:1:0:7', 'QR1:1:0:3', 'QR1:1:0:1u', 'QR1:1:0:0u',
    'QR1:1:0:3u4', 'QR1:1:0:u:', 'QR1:1:0:u:u', 'nonsense', '', null, undefined, 42,
  ];
  for (const t of bad) {
    assert.equal(decodeReplay(t), null, JSON.stringify(t));
  }
});

test('a count of a legal character decodes', { skip: skipReason ?? false }, () => {
  const { decodeReplay } = replay;
  // '.' is a legal move character, so a count of it is well-formed.
  assert.deepEqual(decodeReplay('QR1:1:0:3.'), { seed: 1, level: 0, moves: '...' });
  assert.deepEqual(decodeReplay('QR1:1:0:'), { seed: 1, level: 0, moves: '' });
});

test('encodeReplay of nothing is an empty replay', { skip: skipReason ?? false }, () => {
  const { encodeReplay, decodeReplay } = replay;
  assert.equal(encodeReplay(undefined), 'QR1:0:0:');
  assert.deepEqual(decodeReplay('QR1:0:0:'), { seed: 0, level: 0, moves: '' });
});

test('playReplay steps every character in order', { skip: skipReason ?? false }, async () => {
  const { init, step } = await import('../src/core/game.js');
  const { recordReplay, playReplay } = replay;
  const levels = [{
    name: 's', quorum: 1, par: 100, driftPeriod: 1, spawnEvery: 1000,
    map: ['#########', '#@P.M..X#', '#.>..P..#', '#########'],
  }];
  const inputs = [mv('right'), mv('right'), mv('right'), mv(null), P, mv('left'), mv('up'), mv('right')];
  let s = init(21, { levels });
  for (const i of inputs) s = step(s, i);
  assert.deepEqual(playReplay(recordReplay(21, inputs, {}), levels), s);
  assert.deepEqual(playReplay({ seed: 21, level: 0, moves: 'rrr.plur' }, levels), s);
});

test('playReplay starts at the replay level and uses default levels when none given', { skip: skipReason ?? false }, async () => {
  const { playReplay } = replay;
  const { LEVELS } = await import('../src/data/levels.js');
  const a = { name: 'a', quorum: 1, par: 100, driftPeriod: 1, spawnEvery: 1000, map: ['######', '#@PMX#', '######'] };
  const b = { name: 'b', quorum: 1, par: 100, driftPeriod: 1, spawnEvery: 1000, map: ['######', '#X.P@#', '#..M.#', '######'] };
  const s = playReplay({ seed: 1, level: 1, moves: 'l' }, [a, b]);
  assert.equal(s.level.name, 'b');
  assert.deepEqual(s.player, { x: 3, y: 1 });
  const d = playReplay({ seed: 1, level: 0, moves: '' }, undefined);
  assert.equal(d.level.name, LEVELS[0].name);
  assert.equal(d.levelIndex, 0);
});

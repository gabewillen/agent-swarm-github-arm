import test from 'node:test';
import assert from 'node:assert/strict';
import { load, lvl, mv } from './helpers.mjs';

const replay = () => load('core/replay.js');
const P = { move: null, pause: true };

test('charOf and inputOf', async () => {
  const { charOf, inputOf } = await replay();
  assert.equal(charOf(mv('up')), 'u');
  assert.equal(charOf(mv('right')), 'r');
  assert.equal(charOf(mv('down')), 'd');
  assert.equal(charOf(mv('left')), 'l');
  assert.equal(charOf(mv(null)), '.');
  assert.equal(charOf(undefined), '.');
  assert.equal(charOf({ move: 'up', pause: true }), 'p');
  assert.deepEqual(inputOf('l'), { move: 'left', pause: false });
  assert.deepEqual(inputOf('.'), { move: null, pause: false });
  assert.deepEqual(inputOf('p'), { move: null, pause: true });
});

test('recordReplay keeps the seed, level, and moves', async () => {
  const { recordReplay } = await replay();
  assert.deepEqual(recordReplay(-1, [mv('up'), mv(null), P, mv('left')], { level: 2 }), { seed: 4294967295, level: 2, moves: 'u.pl' });
  assert.deepEqual(recordReplay(5, []), { seed: 5, level: 0, moves: '' });
});

test('encodeReplay run-length codes the moves', async () => {
  const { encodeReplay } = await replay();
  assert.equal(encodeReplay({ seed: 7, level: 1, moves: 'uuu.r' }), 'QR1:7:1:3u.r');
  assert.equal(encodeReplay({ seed: 0, level: 0, moves: '' }), 'QR1:0:0:');
  assert.equal(encodeReplay({ seed: 9, level: 0, moves: '............rr' }), 'QR1:9:0:12.2r');
});

test('decodeReplay reverses encodeReplay', async () => {
  const { encodeReplay, decodeReplay } = await replay();
  for (const r of [{ seed: 7, level: 1, moves: 'uuu.r' }, { seed: 4294967295, level: 9, moves: 'pppplllll.......dur' }, { seed: 3, level: 0, moves: '' }]) {
    assert.deepEqual(decodeReplay(encodeReplay(r)), r);
  }
});

test('decodeReplay refuses malformed text', async () => {
  const { decodeReplay } = await replay();
  for (const t of ['QR2:1:0:u', 'QR1:x:0:u', 'QR1:1:-1:u', 'QR1:4294967296:0:u', 'QR1:1:0:z', 'QR1:1:0:3', 'QR1:1:0:1u', 'QR1:1:0:0u', 'nonsense', '']) {
    assert.equal(decodeReplay(t), null, t);
  }
});

test('playReplay reproduces a game exactly', async () => {
  const { init, step } = await load('core/game.js');
  const { recordReplay, playReplay } = await replay();
  const levels = [lvl(['#########', '#@P.M..X#', '#.>..P..#', '#########'], { spawnEvery: 5 })];
  const inputs = ['right', 'right', 'right', null, 'down', 'left', P, 'left', P, 'up', 'right', 'right'].map((m) => (typeof m === 'string' || m === null ? mv(m) : m));
  let s = init(21, { levels });
  for (const i of inputs) s = step(s, i);
  assert.deepEqual(playReplay(recordReplay(21, inputs), levels), s);
});

test('playReplay starts at the replay\'s level', async () => {
  const { playReplay } = await replay();
  const levels = [lvl(['######', '#@PMX#', '######'], { name: 'a' }), lvl(['######', '#X.P@#', '#..M.#', '######'], { name: 'b' })];
  const s = playReplay({ seed: 1, level: 1, moves: 'l' }, levels);
  assert.equal(s.level.name, 'b');
  assert.deepEqual(s.player, { x: 3, y: 1 });
});

test('a bot game survives encode, decode, and replay', async () => {
  const { init, step } = await load('core/game.js');
  const { botInput } = await load('core/bot.js');
  const { recordReplay, encodeReplay, decodeReplay, playReplay } = await replay();
  let s = init(31);
  const inputs = [];
  for (let i = 0; i < 300; i++) {
    const input = botInput(s);
    inputs.push(input);
    s = step(s, input);
  }
  const text = encodeReplay(recordReplay(31, inputs));
  assert.ok(text.length < 300 + 20);
  assert.deepEqual(playReplay(decodeReplay(text)), s);
});

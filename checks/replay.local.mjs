// Local smoke checks for §18 replays, against core/game.js as landed.
import assert from 'node:assert/strict';
import { charOf, inputOf, recordReplay, encodeReplay, decodeReplay, playReplay } from '../src/core/replay.js';
import { init, step } from '../src/core/game.js';
import { botInput } from '../src/core/bot.js';
import { LEVELS } from '../src/data/levels.js';

const P = { move: null, pause: true };
const mv = (move) => ({ move, pause: false });

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

assert.deepEqual(recordReplay(-1, [mv('up'), mv(null), P, mv('left')], { level: 2 }), { seed: 4294967295, level: 2, moves: 'u.pl' });
assert.deepEqual(recordReplay(5, []), { seed: 5, level: 0, moves: '' });

assert.equal(encodeReplay({ seed: 7, level: 1, moves: 'uuu.r' }), 'QR1:7:1:3u.r');
assert.equal(encodeReplay({ seed: 0, level: 0, moves: '' }), 'QR1:0:0:');
assert.equal(encodeReplay({ seed: 9, level: 0, moves: '............rr' }), 'QR1:9:0:12.2r');

for (const r of [
  { seed: 7, level: 1, moves: 'uuu.r' },
  { seed: 4294967295, level: 9, moves: 'pppplllll.......dur' },
  { seed: 3, level: 0, moves: '' },
]) assert.deepEqual(decodeReplay(encodeReplay(r)), r);

for (const t of ['QR2:1:0:u', 'QR1:x:0:u', 'QR1:1:-1:u', 'QR1:4294967296:0:u', 'QR1:1:0:z', 'QR1:1:0:3', 'QR1:1:0:1u', 'QR1:1:0:0u', 'nonsense', '']) {
  assert.equal(decodeReplay(t), null, t);
}

// reproduction against the real game
const map = ['######', '#@PMX#', '######'];
const s = init(21, { levels: [{ name: 'a', quorum: 1, par: 40, driftPeriod: 2, spawnEvery: 9, map }] });
const inputs = [mv('up'), mv(null), P, mv('left')];
let s2 = s;
for (const i of inputs) s2 = step(s2, i);
assert.deepEqual(playReplay(recordReplay(21, inputs), [{ name: 'a', quorum: 1, par: 40, driftPeriod: 2, spawnEvery: 9, map }]), s2);

const s3 = playReplay({ seed: 1, level: 1, moves: 'l' }, LEVELS);
assert.equal(s3.levelIndex, 1);

// bot replay round trip compresses and reproduces
let s4 = init(31);
const inputs4 = [];
for (let i = 0; i < 300; i++) {
  const input = botInput(s4);
  inputs4.push(input);
  s4 = step(s4, input);
}
const text = encodeReplay(recordReplay(31, inputs4));
assert.ok(text.length < 320, text.length);
assert.deepEqual(playReplay(decodeReplay(text)), s4);

console.log('replay local checks: all pass');

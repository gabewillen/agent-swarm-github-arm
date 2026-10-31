// agent-33 selftest (not part of the acceptance suite): stresses the replay
// area (§18, tests 25) against the landed game core. What the acceptance
// bar can't see:
//   - encode/decode round trips over thousands of random replays, including
//     the canonical stability of a second encode pass;
//   - playReplay equality against a live game across many seeds, levels,
//     and pause-heavy input mixes (a pause char drops its move, and the
//     game must not care, because §6 ignores the move on a pause step);
//   - the recording size bound the bot acceptance relies on;
//   - decodeReplay's refusal matrix, beyond the shipped examples.
import { charOf, inputOf, recordReplay, encodeReplay, decodeReplay, playReplay } from '../../src/core/replay.js';
import { init, step } from '../../src/core/game.js';
import { botInput } from '../../src/core/bot.js';
import { LEVELS } from '../../src/data/levels.js';

let failures = 0;
function fail(msg) {
  failures += 1;
  console.log('FAIL', msg);
}
function ok(condition, msg) {
  if (!condition) fail(msg);
}

// 1. encode/decode round trips over random replays.
const CHARS = ['u', 'r', 'd', 'l', '.', 'p'];
let seed = 0x9e3779b9;
const next = () => {
  // mulberry32 in-step, so the selftest stays deterministic without the
  // module's own PRNG
  const t = (seed + 0x6D2B79F5) >>> 0;
  let r = Math.imul(t ^ (t >>> 15), t | 1);
  r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
  seed = t;
  return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
};
let maxCoded = 0;
for (let i = 0; i < 2000; i++) {
  const len = Math.floor(next() * 400);
  let moves = '';
  for (let k = 0; k < len; k++) moves += CHARS[Math.floor(next() * CHARS.length)];
  const replay = { seed: (next() * 4294967296) >>> 0, level: Math.floor(next() * 12), moves };
  const text = encodeReplay(replay);
  const coded = text.length - 6 - String(replay.seed).length - String(replay.level).length;
  if (coded > len) fail(`run-length coding expanded a replay: ${len} -> ${coded}`);
  if (coded > maxCoded) maxCoded = coded;
  const back = decodeReplay(text);
  ok(back && back.seed === replay.seed && back.level === replay.level && back.moves === replay.moves,
    `round trip broke for seed ${replay.seed} level ${replay.level} moves <${moves.slice(0, 30)}..>`);
  ok(encodeReplay(back) === text, `second encode not canon for seed ${replay.seed}`);
}
console.log(`round trips: 2000 replays ok (largest coded moves ${maxCoded})`);

// 2. decodeReplay refusal matrix.
const BAD = [
  '', 'nonsense', 'QR2:1:0:u', 'qr1:1:0:u', ' QR1:1:0:u', 'QR1:1:0:u ', 'QR1x1:0:u',
  'QR1:', 'QR1:1', 'QR1:1:', 'QR1:1:0', 'QR1:1:0:u:p', 'QR1:1:0:7:8',
  'QR1:x:0:u', 'QR1:+1:0:u', 'QR1:01xx:0:u', 'QR1:4294967296:0:u', 'QR1:-1:0:u',
  'QR1:1:x:u', 'QR1:1:-0:u', 'QR1:1:1.5:u',
  'QR1:1:0:z', 'QR1:1:0:U', 'QR1:1:0:2z', 'QR1:1:0:3', 'QR1:1:0:10', 'QR1:1:0:23',
  'QR1:1:0:1u', 'QR1:1:0:0u', 'QR1:1:0:3u4',
];
for (const t of BAD) ok(decodeReplay(t) === null, `decodeReplay accepted <${t}>`);
// well-formed non-canonical forms still decode, and re-encode canonically
const OK_FORM = [
  ['QR1:1:0:', { seed: 1, level: 0, moves: '' }, 'QR1:1:0:'],
  ['QR1:1:0:2uu', { seed: 1, level: 0, moves: 'uuu' }, 'QR1:1:0:3u'],
  ['QR1:1:0:2u2u', { seed: 1, level: 0, moves: 'uuuu' }, 'QR1:1:0:4u'],
];
for (const [t, want, coded] of OK_FORM) {
  const back = decodeReplay(t);
  ok(back && back.seed === want.seed && back.level === want.level && back.moves === want.moves,
    `decodeReplay(<${t}>) gave ${JSON.stringify(back)}`);
  if (back) ok(encodeReplay(back) === coded, `<${t}> does not re-encode canonically`);
}

// 3. playReplay against live games: every recorded game replays exactly.
function mix(seed) {
  // a deterministic input mix: real moves, waits, and pauses with some
  // noise around them, so pauses cut across moves and runs raggedly
  const inputs = [];
  let s = seed;
  const stepSeed = () => { s = (s + 0x6D2B79F5) >>> 0; };
  for (let i = 0; i < 90; i++) {
    stepSeed();
    const roll = s % 10;
    if (roll === 0) inputs.push({ move: ['up', 'right', 'down', 'left'][s % 4], pause: false });
    else if (roll < 4) inputs.push({ move: null, pause: false });
    else if (roll === 4) inputs.push({ move: 'left', pause: true });
    else if (roll === 5) inputs.push({ move: null, pause: true });
    else inputs.push({ move: ['up', 'right', 'down', 'left'][s % 4], pause: false });
  }
  return inputs;
}
const maps = LEVELS.slice(0, 4).map((def) => def);
let replayed = 0;
for (let seedBase = 1; seedBase <= 8; seedBase++) {
  for (let levelIndex = 0; levelIndex < 4; levelIndex++) {
    const inputs = mix(seedBase * 611 + levelIndex * 37);
    let s = init(seedBase * 331, { levels: maps, level: levelIndex });
    for (const input of inputs) s = step(s, input);
    const replay = recordReplay(seedBase * 331, inputs, { level: levelIndex });
    const text = encodeReplay(replay);
    const back = decodeReplay(text);
    ok(back !== null, `self encode of a bot-mix replay rejected: ${text}`);
    if (back) {
      const again = playReplay(back, maps);
      replayed += 1;
      if (JSON.stringify(again) !== JSON.stringify(s)) {
        fail(`replay diverged for seed ${seedBase * 331} level ${levelIndex}`);
      }
    }
  }
}
console.log(`playReplay: ${replayed} recorded games replayed exactly`);

// 4. the recording bound the bot acceptance relies on, over full bot games.
let worst = { text: '', len: 0 };
for (let seedBase = 1; seedBase <= 20; seedBase++) {
  const inputs = [];
  let s = init(seedBase * 131);
  for (let i = 0; i < 300; i++) {
    const input = botInput(s);
    inputs.push(input);
    s = step(s, input);
  }
  const text = encodeReplay(recordReplay(seedBase * 131, inputs));
  if (text.length > worst.len) worst = { text: text.slice(0, 40), len: text.length };
  ok(text.length < 320, `bot recording too big for seed ${seedBase * 131}: ${text.length}`);
}
console.log(`bot games: 20 recordings encode below 320 (largest ${worst.len}: ${worst.text}...)`);

// 5. recordReplay shape with and without options.
ok(JSON.stringify(recordReplay(-1, [], { level: 2 })) === JSON.stringify({ seed: 4294967295, level: 2, moves: '' }), 'recordReplay(-1, [], {level: 2})');
ok(JSON.stringify(recordReplay(5, [])) === JSON.stringify({ seed: 5, level: 0, moves: '' }), 'recordReplay(5, [])');
ok(charOf(undefined) === '.', 'charOf(undefined)');
ok(charOf({ move: 'up', pause: true }) === 'p', 'pause wins over move');
ok(JSON.stringify(inputOf('p')) === JSON.stringify({ move: null, pause: true }), 'inputOf(p) loses the move');
for (const ch of 'urdl.') ok(inputOf(ch) && charOf(inputOf(ch)) === ch, `charOf(inputOf(${ch}))`);

if (failures === 0) console.log('replays selftest: all checks passed');
process.exit(failures === 0 ? 0 : 1);

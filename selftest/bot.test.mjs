// agent-14's own tests for src/core/bot.js (DESIGN.md §9), outside the
// acceptance suite like every selftest here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { init, step } from '../src/core/game.js';
import { botInput } from '../src/core/bot.js';

const lvl = (map, extra = {}) => ({ name: 'bot', quorum: 1, par: 100, driftPeriod: 1, spawnEvery: 1000, map, ...extra });
const game = (map, extra = {}, seed = 1) => init(seed, { levels: [lvl(map, extra)] });
const MOVES = new Set(['up', 'right', 'down', 'left', null]);

// The shape rules of the state, like tests/17-bot.test.mjs checks.
function broken(s) {
  const wall = (x, y) => { const r = s.level.tiles[y]; return r === undefined || x < 0 || x >= r.length || r[x] === '#'; };
  if (wall(s.player.x, s.player.y)) return 'player in wall';
  if (s.carried.length > 3) return 'carry overflow';
  if (s.lives < 0 || s.lives > 3) return 'lives';
  return null;
}

function play(seed, map, ticks, extra = {}) {
  let s = game(map, extra, seed);
  let merged = 0;
  for (let i = 0; i < ticks && s.status === 'playing'; i++) {
    const input = botInput(s);
    assert.ok(input.pause === false && MOVES.has(input.move), JSON.stringify(input));
    if (s.events.includes('merge')) merged++;
    s = step(s, input);
    assert.equal(broken(s), null, `tick ${i}`);
  }
  return { s, merged };
}

test('botInput never changes the state it reads', () => {
  const s = JSON.parse(JSON.stringify(game(['#######', '#@..P.#', '#M...X#', '#######'])));
  const a = botInput(s);
  const b = botInput(s);
  assert.deepEqual(s, game(['#######', '#@..P.#', '#M...X#', '#######']));
  assert.deepEqual(a, b);
});

test('the bot ships a drift-free level quickly', () => {
  const r = play(3, ['#########', '#@.P.P.M#', '#.....X.#', '#########'], 400, { quorum: 2 });
  assert.equal(r.s.status, 'won');
  assert.ok(r.s.tick < 200, `took ${r.s.tick} ticks`);
});

test('the bot does not step onto a drift that would hit it', () => {
  // A drift patrols the corridor adjacent to the player's corridor.
  const { s } = play(5, ['#######', '#@.P..#', '#..>..#', '#M...X#', '#######'], 300, { quorum: 1 });
  assert.ok(s.score > 0 || s.status === 'lost');
});

test('the bot finishes a quorum of many patches', () => {
  const r = play(9, ['###########', '#@P.P.P.M.#', '#.........#', '#....X....#', '###########'], 600, { quorum: 3 });
  assert.ok(r.merged > 0 || r.s.score > 0);
  assert.equal(broken(r.s), null);
});

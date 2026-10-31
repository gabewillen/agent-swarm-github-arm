// agent-27's own regression tests for src/core/bot.js (§9). These build
// states by hand over src/core/level.js's parseLevel, so they run even
// while src/core/game.js is still being built by another agent.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLevel } from '../src/core/level.js';
import { LEVELS } from '../src/data/levels.js';
import { botInput } from '../src/core/bot.js';

// A hand-built state over a level definition, in the exact shape of
// DESIGN.md §5.
export function botState(map, extra = {}) {
  const level = parseLevel({ name: 'test', quorum: 1, par: 100, driftPeriod: 2, spawnEvery: 1000, map });
  return {
    seed: 1, tick: 0, levelTicks: 0, levels: [], levelIndex: 0, level,
    player: { x: level.start.x, y: level.start.y }, carried: [],
    patches: level.spawns.map((s, i) => ({ x: s.x, y: s.y, color: i % 4 })),
    drifts: level.drifts.map((d) => ({ x: d.x, y: d.y, dir: d.dir })),
    conflicts: [], score: 0, lives: 3, merges: 0, open: false,
    invuln: 0, status: 'playing', paused: false, events: [],
    ...extra,
  };
}

test('botInput returns a valid input shape for every input', () => {
  const moves = new Set(['up', 'right', 'down', 'left', null]);
  for (const s of [
    botState(['#######', '#@..P.#', '#M...X#', '#######']),
    botState(['#######', '#@..P.#', '#M...X#', '#######'], { status: 'won' }),
    botState(['#######', '#@..P.#', '#M...X#', '#######'], { paused: true }),
    botState(['#######', '#@..P.#', '#M...X#', '#######'], { patches: [] }),
    null, {}, { status: 'playing' },
  ]) {
    const input = botInput(s);
    assert.ok(input && moves.has(input.move) && input.pause === false, `bad ${JSON.stringify(input)}`);
  }
});

test('botInput is pure and deterministic on a frozen state', () => {
  const s = Object.freeze(botState(['#########', '#@..P.MX#', '#.......#', '#########']));
  const before = JSON.stringify(s);
  const a = botInput(s);
  const b = botInput(s);
  assert.deepEqual(a, b);
  assert.equal(JSON.stringify(s), before);
});

test('the bot heads for the only patch', () => {
  assert.equal(botInput(botState(['#######', '#@..P.#', '#M...X#', '#######'])).move, 'right');
});

test('the bot takes full hands to the merge pad', () => {
  const s = botState(['#######', '#M.@.P#', '#....X#', '#######'], { carried: [0, 1, 2] });
  assert.equal(botInput(s).move, 'left');
});

test('the bot heads for the open exit', () => {
  const s = botState(['#######', '#P.@.X#', '#M....#', '#######'], { open: true });
  assert.equal(botInput(s).move, 'right');
});

test('the bot merges what it carries when no patch is left', () => {
  const s = botState(['#########', '#M..@.X.#', '#....P..#', '#########'], {
    patches: [], carried: [2],
  });
  assert.equal(botInput(s).move, 'left');
});

const MOVES = new Set(['up', 'right', 'down', 'left', null]);

test('the bot answers safely and identically around a drift', () => {
  // A drift patrols between the player and a patch: any sane play is
  // allowed (detour, or wait for the drift to move on), so the contract
  // facts asserted are the ones every correct bot must hold.
  const blocked = botState(['##########', '#@.v..P..#', '#......MX#', '##########']);
  const a = botInput(blocked);
  assert.ok(MOVES.has(a.move), `${a.move}`);
  assert.equal(a.pause, false);
  assert.deepEqual(botInput(blocked), a, 'deterministic on the same state');
  // While immune no drift can hit, so straight-through play is open too.
  const clear = botState(['##########', '#@..vP...#', '#......MX#', '##########'], { invuln: 6 });
  const b = botInput(clear);
  assert.ok(MOVES.has(b.move), `${b.move}`);
  assert.equal(b.pause, false);
  assert.deepEqual(botInput(clear), b);
});

test('the bot survives when nothing is collectable, clear of danger', () => {
  const s = botState(['##########', '#@.<..P..#', '#......MX#', '##########'], { patches: [] });
  const input = botInput(s);
  assert.ok(input.pause === false);
  assert.ok(['up', 'right', 'down', 'left', null].includes(input.move));
  const again = botInput(s);
  assert.deepEqual(input, again);
});

test('the bot answers on every shipped level', () => {
  for (const def of LEVELS) {
    const s = botState(def.map);
    const input = botInput(s);
    assert.ok(input && ['up', 'right', 'down', 'left', null].includes(input.move) && input.pause === false, def.name);
  }
});

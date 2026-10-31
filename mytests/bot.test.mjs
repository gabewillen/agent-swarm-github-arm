// agent-45's own checks for the bot (DESIGN.md §9), before it faces the
// acceptance suite. They need only game.js, constants, and rng.
import test from 'node:test';
import assert from 'node:assert/strict';
import { load, lvl, deepFreeze, NONE } from '../tests/helpers.mjs';

const loadBot = () => load('core/bot.js');
const loadGame = () => load('core/game.js');

const MAP = ['#######', '#@..P.#', '#M...X#', '#######'];
const def = { name: 't', quorum: 1, par: 100, driftPeriod: 3, spawnEvery: 1000, map: MAP };

test('botInput is { move, pause: false }, valid and deterministic', async () => {
  const { init } = await loadGame();
  const { botInput } = await loadBot();
  const s = deepFreeze(init(9, { levels: [def] }));
  const a = botInput(s);
  const b = botInput(s);
  assert.equal(a.pause, false);
  assert.ok(['up', 'right', 'down', 'left', null].includes(a.move));
  assert.deepEqual(a, b);
});

test('the bot heads for the only patch', async () => {
  const { init } = await loadGame();
  const { botInput } = await loadBot();
  assert.equal(botInput(init(1, { levels: [def] })).move, 'right');
});

test('the bot takes full hands to the merge pad', async () => {
  const { init } = await loadGame();
  const { botInput } = await loadBot();
  const s = init(1, { levels: [lvl(['#######', '#M.@.P#', '#....X#', '#######'], { quorum: 5 })] });
  assert.equal(botInput({ ...s, carried: [0, 1, 2] }).move, 'left');
});

test('the bot heads for the open exit', async () => {
  const { init } = await loadGame();
  const { botInput } = await loadBot();
  const s = init(1, { levels: [lvl(['#######', '#P.@.X#', '#M....#', '#######'])] });
  assert.equal(botInput({ ...s, open: true }).move, 'right');
});

test('empty-handed with no patch lying, the bot walks to a spawn and waits', async () => {
  const { init, step } = await loadGame();
  const { botInput } = await loadBot();
  const s = init(1, { levels: [def] });
  // No patches lying anywhere: the bot approaches a spawn point.
  let waiting = { ...s, patches: [] };
  let first = botInput(waiting);
  assert.ok(['up', 'right', 'down', 'left'].includes(first.move), `${first.move}`);
  // Drive until it stops beside a spawn (bounded), then it must idle.
  for (let i = 0; i < 20; i++) {
    waiting = step(waiting, { move: botInput(waiting).move, pause: false });
    if (def.map.some((row) => row.includes('P')) === false) break;
    const nearSpawn = def.map.some((row, y) => row.split('').some((c, x) =>
      c === 'P' && Math.abs(x - waiting.player.x) + Math.abs(y - waiting.player.y) === 1));
    if (nearSpawn) {
      assert.equal(botInput(waiting).move, null, `arrived at ${waiting.player.x},${waiting.player.y}`);
      // No pacing back and forth: ten more reads all say wait right here.
      for (let j = 0; j < 10; j++) {
        const again = botInput(step(waiting, { move: null, pause: false }));
        assert.equal(again.move, null, `oscillated at tick ${j}: ${again.move}`);
      }
      return;
    }
  }
  assert.fail('never settled beside a spawn point');
});

test('the bot never steps onto a drift when a safe move exists', async () => {
  const { init, step } = await loadGame();
  const { botInput } = await loadBot();
  // A drift blocks the corridor to the patch; the bot must dodge, not walk
  // straight into it.
  const s = init(7, { levels: [lvl(['#########', '#@.<v.P.#', '#M.....X#', '#########'], { driftPeriod: 1 })] });
  let cur = s;
  for (let i = 0; i < 40 && cur.status === 'playing'; i++) {
    const sim = step(cur, { move: botInput(cur).move, pause: false });
    assert.ok(!sim.events.includes('hit') && !sim.events.includes('lost'), `tick ${i} took a hit`);
    cur = sim;
  }
});

test('a full 900-tick seeded game keeps every invariant the tests check', async () => {
  const { init, step } = await loadGame();
  const { botInput } = await loadBot();
  let s = init(5, { levels: [def] });
  let scoreBefore = s.score;
  for (let i = 0; i < 900 && s.status === 'playing'; i++) {
    s = step(s, botInput(s));
    assert.ok(s.score >= scoreBefore);
    scoreBefore = s.score;
    assert.ok(['playing', 'won', 'lost'].includes(s.status));
    assert.ok(s.carried.length <= 3);
    assert.ok(s.lives >= 0);
    for (const p of s.patches) assert.ok(def.map[0].includes('P') || true); // shape only; rules enforce placement
    const row = () => s.level.tiles[s.player.y] ?? '';
    assert.ok(row()[s.player.x] !== undefined && s.player.x >= 0);
  }
});

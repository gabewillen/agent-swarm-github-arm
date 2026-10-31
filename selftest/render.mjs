// A local replica of tests/18-render.test.mjs that builds states by hand
// (init of §5) so it can run before src/core/game.js lands. Not part of
// the acceptance suite; keep outside tests/.
import assert from 'node:assert/strict';
import { load } from '../tests/helpers.mjs';

const MAP = ['#########', '#@P.M.>H#', '#..X....#', '#########'];
const VIEW = { width: 640, height: 480 };
const HEX = /^#[0-9a-f]{6}$/;
let failures = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

// An init replica only for renderer checks: shapes of §5 with the parsed
// level and opening draws.
async function fakeInit(seed = 2, overrides = {}) {
  const { parseLevel } = await load('core/level.js');
  const { lvl } = await import('../tests/helpers.mjs');
  const level = parseLevel(lvl(MAP));
  const { rngInt } = await load('core/rng.js');
  let s = seed;
  const patches = level.spawns.map(({ x, y }) => {
    const r = rngInt(s, 4);
    s = r.seed;
    return { x, y, color: r.value };
  });
  return {
    seed: s,
    tick: 0,
    levelTicks: 0,
    levels: [level],
    levelIndex: 0,
    level,
    player: { ...level.start },
    carried: [],
    patches,
    drifts: level.drifts.map((d) => ({ ...d })),
    conflicts: [],
    score: 0,
    lives: 3,
    merges: 0,
    open: false,
    invuln: 0,
    status: 'playing',
    paused: false,
    events: [],
    ...overrides,
  };
}

const start = () => fakeInit();
const list = async (s, view = VIEW) => (await load('render/draw.js')).drawList(s, view);

test('PALETTE is exactly DESIGN.md §11\'s', async () => {
  const { PALETTE } = await load('render/palette.js');
  assert.deepEqual(PALETTE, {
    bg: '#111111', panel: '#1a1a1a', wall: '#2c2c2c', floor: '#161616', text: '#f2f2f2', dim: '#8f8f8f',
    accent: '#ffd400', danger: '#ff6b4a', agents: ['#c79bff', '#6aa8ff', '#ff9f45', '#4ade80'],
  });
});

test('HUD_HEIGHT is 48', async () => {
  assert.equal((await load('render/draw.js')).HUD_HEIGHT, 48);
});

test('layout fits the level and centres it', async () => {
  const { layout } = await load('render/draw.js');
  assert.deepEqual(layout({ width: 9, height: 4 }, VIEW), { cell: 71, ox: 0, oy: 48 + Math.floor((432 - 284) / 2) });
  assert.deepEqual(layout({ width: 10, height: 10 }, { width: 800, height: 448 }), { cell: 40, ox: 200, oy: 48 });
});

test('the list starts with the background', async () => {
  const ops = await list(await start());
  assert.deepEqual(ops[0], { op: 'rect', kind: 'bg', x: 0, y: 0, w: 640, h: 480, color: '#111111' });
});

test('one wall rect per wall cell, at its cell', async () => {
  const { layout } = await load('render/draw.js');
  const s = await start();
  const { cell, ox, oy } = layout(s.level, VIEW);
  const walls = (await list(s)).filter((o) => o.kind === 'wall');
  const expected = [];
  s.level.tiles.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (row[x] === '#') expected.push(`${ox + x * cell},${oy + y * cell}`); });
  assert.equal(walls.length, expected.length);
  for (const w of walls) {
    assert.equal(w.op, 'rect');
    assert.equal(w.color, '#2c2c2c');
    assert.equal(w.w, cell);
    assert.equal(w.h, cell);
    assert.ok(expected.includes(`${w.x},${w.y}`));
  }
});

test('every op has a palette colour and a kind', async () => {
  const { PALETTE } = await load('render/palette.js');
  const colours = new Set([...Object.values(PALETTE).filter((v) => typeof v === 'string'), ...PALETTE.agents]);
  for (const o of await list(await start())) {
    assert.ok(typeof o.kind === 'string' && o.kind.length > 0);
    assert.ok(HEX.test(o.color) && colours.has(o.color), o.color);
  }
});

test('the exit is dim when closed and accent when open', async () => {
  const s = await start();
  assert.equal((await list(s)).find((o) => o.kind === 'exit').color, '#8f8f8f');
  assert.equal((await list({ ...s, open: true })).find((o) => o.kind === 'exit').color, '#ffd400');
});

test('a hold is dim when closed and floor-coloured when open', async () => {
  const s = await start();
  assert.equal((await list(s)).find((o) => o.kind === 'hold').color, '#8f8f8f');
  assert.equal((await list({ ...s, open: true })).find((o) => o.kind === 'hold').color, '#161616');
});

test('merge pads, patches, drifts, conflicts, and the player each get ops', async () => {
  const s = { ...(await start()), conflicts: [{ x: 5, y: 2, ttl: 3 }] };
  const ops = await list(s);
  const count = (k) => ops.filter((o) => o.kind === k).length;
  assert.equal(count('merge'), 1);
  assert.equal(count('patch'), 1);
  assert.equal(count('drift'), 1);
  assert.equal(count('conflict'), 1);
  assert.equal(count('player'), 1);
});

test('patches take their agent colour; the player is accent; drifts are danger', async () => {
  const s = await start();
  const ops = await list({ ...s, patches: [{ x: 2, y: 1, color: 3 }] });
  assert.equal(ops.find((o) => o.kind === 'patch').color, '#4ade80');
  assert.equal(ops.find((o) => o.kind === 'player').color, '#ffd400');
  assert.equal(ops.find((o) => o.kind === 'drift').color, '#ff6b4a');
});

test('the player op lies inside the player\'s cell', async () => {
  const { layout } = await load('render/draw.js');
  const s = await start();
  const { cell, ox, oy } = layout(s.level, VIEW);
  const p = (await list(s)).find((o) => o.kind === 'player');
  assert.ok(p.x >= ox + cell && p.x <= ox + 2 * cell);
  assert.ok(p.y >= oy + cell && p.y <= oy + 2 * cell);
});

test('the HUD shows score, lives, and merges/quorum', async () => {
  const s = { ...(await start()), score: 1234, lives: 2, merges: 1 };
  const texts = (await list(s)).filter((o) => o.kind === 'hud' && o.op === 'text').map((o) => o.text).join(' | ');
  assert.ok(texts.includes('SCORE 1234'), texts);
  assert.ok(texts.includes('LIVES 2'), texts);
  assert.ok(texts.includes('1/1'), texts);
});

test('banners: PAUSED, ALL MERGED, GAME OVER, and none while playing', async () => {
  const s = await start();
  const banner = async (x) => (await list(x)).filter((o) => o.kind === 'banner').map((o) => o.text);
  assert.deepEqual(await banner(s), []);
  assert.deepEqual(await banner({ ...s, paused: true }), ['PAUSED']);
  assert.deepEqual(await banner({ ...s, status: 'won' }), ['ALL MERGED']);
  assert.deepEqual(await banner({ ...s, status: 'lost' }), ['GAME OVER']);
});

test('drawList is pure', async () => {
  const { deepFreeze } = await import('../tests/helpers.mjs');
  const s = deepFreeze(await start());
  assert.deepEqual(await list(s), await list(s));
});

test('paint draws rects, circles, and text on a context', async () => {
  const { paint } = await load('render/draw.js');
  const { fakeCtx } = await import('../tests/helpers.mjs');
  const ctx = fakeCtx();
  paint(ctx, [
    { op: 'rect', kind: 'bg', x: 0, y: 0, w: 10, h: 10, color: '#111111' },
    { op: 'circle', kind: 'player', x: 5, y: 5, r: 2, color: '#ffd400' },
    { op: 'text', kind: 'hud', x: 1, y: 1, text: 'SCORE 0', color: '#f2f2f2', size: 16 },
  ]);
  const names = ctx.calls.map((c) => c.name);
  assert.deepEqual(ctx.calls.find((c) => c.name === 'fillRect').args, [0, 0, 10, 10]);
  assert.equal(ctx.calls.find((c) => c.name === 'fillRect').fillStyle, '#111111');
  assert.ok(names.includes('arc') && names.includes('fill') && names.includes('beginPath'));
  assert.equal(ctx.calls.find((c) => c.name === 'fill').fillStyle, '#ffd400');
  const t = ctx.calls.find((c) => c.name === 'fillText');
  assert.equal(t.args[0], 'SCORE 0');
  assert.equal(t.fillStyle, '#f2f2f2');
  assert.ok(String(t.font).includes('16'));
});

test('paint draws one fillRect per rect op', async () => {
  const { paint, drawList } = await load('render/draw.js');
  const { fakeCtx } = await import('../tests/helpers.mjs');
  const ops = drawList(await start(), VIEW);
  const ctx = fakeCtx();
  paint(ctx, ops);
  assert.equal(ctx.calls.filter((c) => c.name === 'fillRect').length, ops.filter((o) => o.op === 'rect').length);
});

for (const [name, fn] of tests) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (e) {
    failures++;
    console.log(`FAIL - ${name}: ${e.message}`);
  }
}
console.log(failures === 0 ? 'all render checks pass' : `${failures} failures`);
process.exit(failures === 0 ? 0 : 1);

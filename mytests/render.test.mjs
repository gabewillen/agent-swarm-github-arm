// agent-45's own checks for the renderer (DESIGN.md §11), running without
// src/core/game.js by building a state shaped exactly like §5's.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PALETTE } from '../src/render/palette.js';
import { HUD_HEIGHT, layout, drawList, paint } from '../src/render/draw.js';

const MAP = ['#########', '#@P.M.>H#', '#..X....#', '#########'];
const def = { name: 'test', quorum: 1, par: 100, driftPeriod: 1, spawnEvery: 1000, map: MAP };
const level = {
  ...def,
  width: 9,
  height: 4,
  tiles: ['#########', '#@P.M.>H#', '#..X....#', '#########'],
  start: { x: 1, y: 1 },
  spawns: [{ x: 2, y: 1 }],
  drifts: [{ x: 6, y: 1, dir: 'right' }],
};
const state = {
  seed: 2, tick: 5, levelTicks: 3, levels: [def], levelIndex: 0,
  level, player: { x: 1, y: 1 }, carried: [], patches: [{ x: 2, y: 1, color: 3 }],
  drifts: [{ x: 6, y: 1, dir: 'right' }], conflicts: [],
  score: 1234, lives: 2, merges: 1, open: false, invuln: 0,
  status: 'playing', paused: false, events: [],
};
const VIEW = { width: 640, height: 480 };
const list = (s = state, view = VIEW) => drawList(s, view);
const HEX = /^#[0-9a-f]{6}$/;

test('PALETTE is exactly §11\'s, and HUD_HEIGHT is 48', () => {
  assert.deepEqual(PALETTE, {
    bg: '#111111', panel: '#1a1a1a', wall: '#2c2c2c', floor: '#161616', text: '#f2f2f2', dim: '#8f8f8f',
    accent: '#ffd400', danger: '#ff6b4a', agents: ['#c79bff', '#6aa8ff', '#ff9f45', '#4ade80'],
  });
  assert.equal(HUD_HEIGHT, 48);
});

test('layout fits the level and centres it', () => {
  assert.deepEqual(layout({ width: 9, height: 4 }, VIEW), { cell: 71, ox: 0, oy: 48 + Math.floor((432 - 284) / 2) });
  assert.deepEqual(layout({ width: 10, height: 10 }, { width: 800, height: 448 }), { cell: 40, ox: 200, oy: 48 });
  assert.deepEqual(layout({ width: 32, height: 24 }, { width: 640, height: 480 }), { cell: 18, ox: 32, oy: 48 });
});

test('the list starts with the background', () => {
  assert.deepEqual(list()[0], { op: 'rect', kind: 'bg', x: 0, y: 0, w: 640, h: 480, color: '#111111' });
});

test('one wall rect per wall cell, at its cell', () => {
  const { cell, ox, oy } = layout(state.level, VIEW);
  const walls = list().filter((o) => o.kind === 'wall');
  const expected = [];
  level.tiles.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) if (row[x] === '#') expected.push(`${ox + x * cell},${oy + y * cell}`);
  });
  assert.equal(walls.length, expected.length);
  for (const w of walls) {
    assert.equal(w.op, 'rect');
    assert.equal(w.color, '#2c2c2c');
    assert.equal(w.w, cell);
    assert.equal(w.h, cell);
    assert.ok(expected.includes(`${w.x},${w.y}`));
  }
});

test('every op has a palette colour and a kind', () => {
  const colours = new Set([...Object.values(PALETTE).filter((v) => typeof v === 'string'), ...PALETTE.agents]);
  for (const o of list()) {
    assert.ok(typeof o.kind === 'string' && o.kind.length > 0);
    assert.ok(HEX.test(o.color) && colours.has(o.color), o.color);
  }
});

test('exit/hold colours follow open; each entity kind appears once', () => {
  const s = { ...state, conflicts: [{ x: 5, y: 2, ttl: 3 }] };
  const ops = list(s);
  const count = (k) => ops.filter((o) => o.kind === k).length;
  for (const k of ['merge', 'patch', 'drift', 'conflict', 'player', 'exit']) assert.equal(count(k), 1, k);
  assert.equal(ops.find((o) => o.kind === 'exit').color, '#8f8f8f');
  assert.equal(list({ ...s, open: true }).find((o) => o.kind === 'exit').color, '#ffd400');
  assert.equal(ops.find((o) => o.kind === 'hold').color, '#8f8f8f');
  assert.equal(list({ ...s, open: true }).find((o) => o.kind === 'hold').color, '#161616');
});

test('entity colours: patches take their agent colour; player accent; drift danger', () => {
  const ops = list({ ...state, patches: [{ x: 2, y: 1, color: 3 }] });
  assert.equal(ops.find((o) => o.kind === 'patch').color, '#4ade80');
  assert.equal(ops.find((o) => o.kind === 'player').color, '#ffd400');
  assert.equal(ops.find((o) => o.kind === 'drift').color, '#ff6b4a');
});

test('every entity op lies inside its cell, as the player test checks', () => {
  const { cell, ox, oy } = layout(state.level, VIEW);
  const ops = list(state);
  const inCell = (o, x, y) => {
    assert.ok(o.x >= ox + x * cell && o.x <= ox + (x + 1) * cell, `x of ${o.kind}`);
    assert.ok(o.y >= oy + y * cell && o.y <= oy + (y + 1) * cell, `y of ${o.kind}`);
  };
  inCell(ops.find((o) => o.kind === 'player'), 1, 1);
  inCell(ops.find((o) => o.kind === 'patch'), 2, 1);
  inCell(ops.find((o) => o.kind === 'drift'), 6, 1);
  for (const o of ops.filter((k) => k.kind === 'wall')) {
    assert.equal(o.w, cell);
    assert.equal(o.h, cell);
  }
});

test('patches with out-of-range colours still paint a palette colour (mod wrap)', () => {
  const ops = list({ ...state, patches: [{ x: 0, y: 0, color: 99 }, { x: 1, y: 2, color: -1 }, { x: 2, y: 2 }] });
  const cols = ops.filter((o) => o.kind === 'patch').map((o) => o.color);
  assert.deepEqual(cols, ['#4ade80', '#4ade80', '#c79bff']); // 99%4=3, -1 wraps to 3, NaN falls back to 0
});

test('the HUD shows score, lives, merges/quorum, each label+value in one op', () => {
  const texts = list().filter((o) => o.kind === 'hud' && o.op === 'text').map((o) => o.text);
  const joined = texts.join(' | ');
  assert.ok(texts.includes('SCORE 1234'), joined);
  assert.ok(texts.includes('LIVES 2'), joined);
  assert.ok(texts.includes('MERGES 1/1'), joined);
  assert.ok(joined.includes('1/1'), joined);
  assert.ok(texts.some((t) => t.startsWith('LEVEL ')));
  for (const t of texts) {
    const op = list().find((o) => o.kind === 'hud' && o.text === t);
    assert.ok(op.op === 'text' && typeof op.size === 'number' && op.size > 0);
  }
});

test('banners: PAUSED, ALL MERGED, GAME OVER, and none while playing', () => {
  const banner = (x) => list(x).filter((o) => o.kind === 'banner').map((o) => o.text);
  assert.deepEqual(banner(state), []);
  assert.deepEqual(banner({ ...state, paused: true }), ['PAUSED']);
  assert.deepEqual(banner({ ...state, status: 'won' }), ['ALL MERGED']);
  assert.deepEqual(banner({ ...state, status: 'lost' }), ['GAME OVER']);
  assert.deepEqual(banner({ ...state, paused: true, status: 'won' }), ['PAUSED']);
});

test('drawList is pure and order-stable', () => {
  const freeze = (o) => {
    if (o && typeof o === 'object' && !Object.isFrozen(o)) {
      Object.freeze(o);
      for (const v of Object.values(o)) freeze(v);
    }
    return o;
  };
  const s = freeze(state);
  assert.deepEqual(list(s), list(s));
  assert.deepEqual(list(s), list(state));
  assert.equal(JSON.stringify(s), JSON.stringify(state));
  const v = freeze(VIEW);
  list(s, v);
  assert.deepEqual(v, VIEW);
});

test('paint draws rects, circles, and text on a context', () => {
  const calls = [];
  const ctx = { calls };
  for (const name of ['fillRect', 'beginPath', 'arc', 'fill', 'fillText']) {
    ctx[name] = (...args) => calls.push({ name, args, fillStyle: ctx.fillStyle, font: ctx.font });
  }
  paint(ctx, [
    { op: 'rect', kind: 'bg', x: 0, y: 0, w: 10, h: 10, color: '#111111' },
    { op: 'circle', kind: 'player', x: 5, y: 5, r: 2, color: '#ffd400' },
    { op: 'text', kind: 'hud', x: 1, y: 1, text: 'SCORE 0', color: '#f2f2f2', size: 16 },
  ]);
  const names = calls.map((c) => c.name);
  assert.deepEqual(calls.find((c) => c.name === 'fillRect').args, [0, 0, 10, 10]);
  assert.equal(calls.find((c) => c.name === 'fillRect').fillStyle, '#111111');
  assert.ok(names.includes('arc') && names.includes('fill') && names.includes('beginPath'));
  assert.deepEqual(calls.find((c) => c.name === 'arc').args.slice(0, 3), [5, 5, 2]);
  assert.equal(calls.find((c) => c.name === 'fill').fillStyle, '#ffd400');
  const t = calls.find((c) => c.name === 'fillText');
  assert.equal(t.args[0], 'SCORE 0');
  assert.equal(t.fillStyle, '#f2f2f2');
  assert.ok(String(t.font).includes('16'));
});

test('paint draws one fillRect per rect op and never a stray fill', () => {
  const ops = list();
  const calls = [];
  const ctx = { calls, fillStyle: '' };
  let pending = 0;
  ctx.beginPath = () => { pending++; };
  ctx.arc = () => {};
  ctx.fill = (...args) => calls.push({ name: 'fill', args, fillStyle: ctx.fillStyle, font: ctx.font });
  for (const name of ['fillRect', 'fillText']) {
    ctx[name] = (...args) => calls.push({ name, args, fillStyle: ctx.fillStyle, font: ctx.font });
  }
  paint(ctx, ops);
  assert.equal(calls.filter((c) => c.name === 'fillRect').length, ops.filter((o) => o.op === 'rect').length);
  assert.equal(calls.filter((c) => c.name === 'fill').length, ops.filter((o) => o.op === 'circle' && o.r > 0).length);
  assert.equal(calls.filter((c) => c.name === 'fillText').length, ops.filter((o) => o.op === 'text').length);
  assert.equal(pending, calls.filter((c) => c.name === 'fill').length);
});

test('the banner sits over the board, within the view', () => {
  for (const paused of [true, false]) {
    for (const st of ['playing', 'won', 'lost']) {
      const b = list({ ...state, paused, status: st }).find((o) => o.kind === 'banner');
      if (paused || st !== 'playing') {
        assert.ok(b.x >= 0 && b.x + b.text.length * b.size < VIEW.width + 50, `${b.text} at ${b.x}`);
        assert.ok(b.y >= HUD_HEIGHT && b.y <= VIEW.height, `${b.text} at y ${b.y}`);
      }
    }
  }
});

test('a degenerate state (no level) draws the strip and returns the list anyway', () => {
  const ops = drawList({ ...state, level: null }, VIEW);
  assert.equal(ops[0].kind, 'bg');
  assert.ok(ops.every((o) => o.color && HEX.test(o.color)));
});

test('drawList and paint together on a big generated-looking level', () => {
  const tiles = [];
  for (let y = 0; y < 24; y++) {
    tiles.push(y === 0 || y === 23 ? '#'.repeat(32) : '#' + '.'.repeat(30) + '#');
  }
  const big = { ...state, level: { ...level, width: 32, height: 24, tiles }, patches: [], drifts: [], conflicts: [] };
  const view = { width: 1024, height: 800 };
  const ops = drawList(big, view);
  const { cell, ox, oy } = layout(big.level, view); // floor(min(32, 752/24)) = 31
  assert.equal(cell, 31);
  const walls = ops.filter((o) => o.kind === 'wall');
  assert.equal(walls.length, 32 * 24 - 30 * 22);
  const player = ops.find((o) => o.kind === 'player');
  assert.ok(player.x > ox && player.x < ox + 32 * cell);
  assert.equal(player.r, Math.max(1, cell * 0.32));
  paint({ fillStyle: '', fillRect() {}, beginPath() {}, arc() {}, fill() {}, fillText() {}, font: '' }, ops);
});

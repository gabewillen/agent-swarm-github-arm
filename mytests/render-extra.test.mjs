// Agent-7's local tests for the renderer, outside tests/ so they don't ship.
// They build states inline rather than through src/core/game.js, so the
// renderer can be checked before the core lands.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PALETTE } from '../src/render/palette.js';
import { HUD_HEIGHT, layout, drawList, paint } from '../src/render/draw.js';

// A state shaped like §5's, without loading core/game.js.
const level = {
  name: 'test', quorum: 2, par: 100, driftPeriod: 2, spawnEvery: 20,
  width: 9, height: 4,
  tiles: ['#########', '#@P.M.>H#', '#..X....#', '#########'],
  start: { x: 1, y: 1 },
  spawns: [{ x: 2, y: 1 }],
  drifts: [{ x: 6, y: 1, dir: 'left' }],
};
const state = {
  seed: 2, tick: 0, levelTicks: 0, levels: [], levelIndex: 0, level,
  player: { x: 1, y: 1 }, carried: [], patches: [{ x: 2, y: 1, color: 3 }],
  drifts: [{ x: 6, y: 1, dir: 'left' }], conflicts: [{ x: 4, y: 2, ttl: 10 }],
  score: 1234, lives: 2, merges: 1, open: false, invuln: 0,
  status: 'playing', paused: false, events: [],
};
const VIEW = { width: 640, height: 480 };
const HEX = /^#[0-9a-f]{6}$/;

test('layout matches §11 exactly', () => {
  assert.deepEqual(layout({ width: 9, height: 4 }, VIEW), { cell: 71, ox: 0, oy: 48 + Math.floor((432 - 284) / 2) });
  assert.deepEqual(layout({ width: 10, height: 10 }, { width: 800, height: 448 }), { cell: 40, ox: 200, oy: 48 });
  assert.deepEqual(layout({ width: 7, height: 7 }, { width: 100, height: 100 }), { cell: 7, ox: Math.floor((100 - 49) / 2), oy: HUD_HEIGHT + Math.floor((52 - 49) / 2) });
});

test('the list starts with the background rect over the whole view', () => {
  assert.deepEqual(drawList(state, VIEW)[0],
    { op: 'rect', kind: 'bg', x: 0, y: 0, w: 640, h: 480, color: '#111111' });
});

test('one wall rect per wall cell', () => {
  const { cell, ox, oy } = layout(level, VIEW);
  const walls = drawList(state, VIEW).filter((o) => o.kind === 'wall');
  assert.equal(walls.length, 22);
  for (const w of walls) {
    assert.equal(w.op, 'rect');
    assert.equal(w.color, PALETTE.wall);
    assert.equal(w.w, cell);
    assert.equal(w.h, cell);
    assert.ok(w.x === ox || (w.x - ox) % cell === 0);
  }
});

test('every op has a palette colour and a kind', () => {
  const colours = new Set([...Object.values(PALETTE).filter((v) => typeof v === 'string'), ...PALETTE.agents]);
  for (const o of drawList(state, VIEW)) {
    assert.ok(typeof o.kind === 'string' && o.kind.length > 0);
    assert.ok(HEX.test(o.color) && colours.has(o.color), o.color);
  }
});

test('floor rects cover the floor cells, walls their own', () => {
  const ops = drawList(state, VIEW);
  assert.equal(ops.filter((o) => o.kind === 'floor').length, 14);
});

test('exit and hold colours follow open', () => {
  const ops = drawList(state, VIEW);
  assert.equal(ops.find((o) => o.kind === 'exit').color, PALETTE.dim);
  assert.equal(ops.find((o) => o.kind === 'hold').color, PALETTE.dim);
  const open = drawList({ ...state, open: true }, VIEW);
  assert.equal(open.find((o) => o.kind === 'exit').color, PALETTE.accent);
  assert.equal(open.find((o) => o.kind === 'hold').color, PALETTE.floor);
});

test('exactly one merge pad, exit, hold, patch, drift, conflict, player op', () => {
  const ops = drawList(state, VIEW);
  for (const k of ['merge', 'exit', 'hold', 'patch', 'drift', 'conflict', 'player']) {
    assert.equal(ops.filter((o) => o.kind === k).length, 1, k);
  }
});

test('patches take their agent colour; the player is accent; drifts are danger', () => {
  const ops = drawList(state, VIEW);
  assert.equal(ops.find((o) => o.kind === 'patch').color, '#4ade80');
  assert.equal(ops.find((o) => o.kind === 'player').color, '#ffd400');
  assert.equal(ops.find((o) => o.kind === 'drift').color, '#ff6b4a');
});

test('the player op lies inside the player\'s cell', () => {
  const { cell, ox, oy } = layout(level, VIEW);
  const p = drawList(state, VIEW).find((o) => o.kind === 'player');
  assert.ok(p.x >= ox + cell && p.x <= ox + 2 * cell, p.x);
  assert.ok(p.y >= oy + cell && p.y <= oy + 2 * cell, p.y);
});

test('the HUD lists score, lives, merges/quorum, and level', () => {
  const texts = drawList(state, VIEW).filter((o) => o.kind === 'hud' && o.op === 'text').map((o) => o.text).join(' | ');
  assert.ok(texts.includes('SCORE 1234'), texts);
  assert.ok(texts.includes('LIVES 2'), texts);
  assert.ok(texts.includes('1/2'), texts);
  assert.ok(texts.includes('LEVEL 1'), texts);
});

test('banners: PAUSED, ALL MERGED, GAME OVER, and none while playing', () => {
  const banner = (s) => drawList(s, VIEW).filter((o) => o.kind === 'banner').map((o) => o.text);
  assert.deepEqual(banner(state), []);
  assert.deepEqual(banner({ ...state, paused: true }), ['PAUSED']);
  assert.deepEqual(banner({ ...state, status: 'won' }), ['ALL MERGED']);
  assert.deepEqual(banner({ ...state, status: 'lost' }), ['GAME OVER']);
});

test('drawList is pure and deterministic', () => {
  const freeze = (o) => (o && typeof o === 'object' && !Object.isFrozen(o)
    ? (Object.freeze(o), Object.values(o).forEach(freeze), o) : o);
  const s = freeze(structuredClone(state));
  const a = drawList(s, VIEW);
  const b = drawList(s, VIEW);
  assert.deepEqual(a, b);
});

function fakeCtx() {
  const calls = [];
  const ctx = { calls };
  for (const name of ['fillRect', 'beginPath', 'arc', 'fill', 'fillText', 'strokeRect', 'clearRect', 'stroke', 'moveTo', 'lineTo', 'save', 'restore']) {
    ctx[name] = (...args) => calls.push({ name, args, fillStyle: ctx.fillStyle, font: ctx.font });
  }
  return ctx;
}

test('paint draws rects, circles, and text on a context', () => {
  const ctx = fakeCtx();
  paint(ctx, [
    { op: 'rect', kind: 'bg', x: 0, y: 0, w: 10, h: 10, color: '#111111' },
    { op: 'circle', kind: 'player', x: 5, y: 5, r: 2, color: '#ffd400' },
    { op: 'text', kind: 'hud', x: 1, y: 1, text: 'SCORE 0', color: '#f2f2f2', size: 16 },
    { op: 'circle', kind: 'particle', x: 8, y: 8, r: 1, color: '#c79bff' },
  ]);
  const fill = ctx.calls.find((c) => c.name === 'fillRect');
  assert.deepEqual(fill.args, [0, 0, 10, 10]);
  assert.equal(fill.fillStyle, '#111111');
  const names = ctx.calls.map((c) => c.name);
  assert.ok(names.includes('arc') && names.includes('fill') && names.includes('beginPath'));
  assert.equal(ctx.calls.find((c) => c.name === 'fill').fillStyle, '#ffd400');
  const t = ctx.calls.find((c) => c.name === 'fillText');
  assert.equal(t.args[0], 'SCORE 0');
  assert.equal(t.fillStyle, '#f2f2f2');
  assert.ok(String(t.font).includes('16'));
  assert.equal(ctx.calls.filter((c) => c.name === 'fillRect').length, 1);
});

// agent-7's own check of the renderer (DESIGN.md §11). Mirrors the
// assertions of tests/18-render.test.mjs, but builds the state by hand, so
// it runs before src/core/game.js exists. Never run as part of the
// acceptance suite (it lives outside tests/).
import test from 'node:test';
import assert from 'node:assert/strict';
import { deepFreeze, fakeCtx } from '../tests/helpers.mjs';
import { PALETTE } from '../src/render/palette.js';
import { HUD_HEIGHT, layout, drawList, paint } from '../src/render/draw.js';

// tests/18's map, already parsed (§4): '@', 'P', and '>' read as '.'.
const MAP_TILES = ['#########', '#...M..H#', '#..X....#', '#########'];
const LEVEL = {
  name: 'test', quorum: 1, par: 100, driftPeriod: 1, spawnEvery: 1000,
  width: 9, height: 4, tiles: MAP_TILES,
  start: { x: 1, y: 1 }, spawns: [{ x: 2, y: 1 }], drifts: [{ x: 6, y: 1, dir: 'right' }],
};
const VIEW = { width: 640, height: 480 };
const makeState = () => ({
  seed: 0, tick: 0, levelTicks: 0, levels: [], levelIndex: 0,
  level: LEVEL, player: { x: 1, y: 1 }, carried: [],
  patches: [{ x: 2, y: 1, color: 2 }],
  drifts: [{ x: 6, y: 1, dir: 'right' }],
  conflicts: [],
  score: 0, lives: 3, merges: 0, open: false, invuln: 0,
  status: 'playing', paused: false, events: [],
});
const list = (s, view = VIEW) => drawList(s, view);
const HEX = /^#[0-9a-f]{6}$/;

test('PALETTE is exactly DESIGN.md §11\'s', () => {
  assert.deepEqual(PALETTE, {
    bg: '#111111', panel: '#1a1a1a', wall: '#2c2c2c', floor: '#161616', text: '#f2f2f2', dim: '#8f8f8f',
    accent: '#ffd400', danger: '#ff6b4a', agents: ['#c79bff', '#6aa8ff', '#ff9f45', '#4ade80'],
  });
});

test('HUD_HEIGHT is 48', () => {
  assert.equal(HUD_HEIGHT, 48);
});

test('layout fits the level and centres it', () => {
  assert.deepEqual(layout({ width: 9, height: 4 }, VIEW), { cell: 71, ox: 0, oy: 48 + Math.floor((432 - 284) / 2) });
  assert.deepEqual(layout({ width: 10, height: 10 }, { width: 800, height: 448 }), { cell: 40, ox: 200, oy: 48 });
});

test('the list starts with the background', () => {
  assert.deepEqual(list(makeState())[0], { op: 'rect', kind: 'bg', x: 0, y: 0, w: 640, h: 480, color: '#111111' });
});

test('one wall rect per wall cell, at its cell', () => {
  const s = makeState();
  const { cell, ox, oy } = layout(s.level, VIEW);
  const walls = list(s).filter((o) => o.kind === 'wall');
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

test('every op has a palette colour and a kind', () => {
  const colours = new Set([...Object.values(PALETTE).filter((v) => typeof v === 'string'), ...PALETTE.agents]);
  for (const o of list(makeState())) {
    assert.ok(typeof o.kind === 'string' && o.kind.length > 0);
    assert.ok(HEX.test(o.color) && colours.has(o.color), o.color);
  }
});

test('the exit is dim when closed and accent when open', () => {
  const s = makeState();
  assert.equal(list(s).find((o) => o.kind === 'exit').color, '#8f8f8f');
  assert.equal(list({ ...s, open: true }).find((o) => o.kind === 'exit').color, '#ffd400');
});

test('a hold is dim when closed and floor-coloured when open', () => {
  const s = makeState();
  assert.equal(list(s).find((o) => o.kind === 'hold').color, '#8f8f8f');
  assert.equal(list({ ...s, open: true }).find((o) => o.kind === 'hold').color, '#161616');
});

test('merge pads, patches, drifts, conflicts, and the player each get ops', () => {
  const s = { ...makeState(), conflicts: [{ x: 5, y: 2, ttl: 3 }] };
  const ops = list(s);
  const count = (k) => ops.filter((o) => o.kind === k).length;
  assert.equal(count('merge'), 1);
  assert.equal(count('patch'), 1);
  assert.equal(count('drift'), 1);
  assert.equal(count('conflict'), 1);
  assert.equal(count('player'), 1);
});

test('patches take their agent colour; the player is accent; drifts are danger', () => {
  const s = makeState();
  const ops = list({ ...s, patches: [{ x: 2, y: 1, color: 3 }] });
  assert.equal(ops.find((o) => o.kind === 'patch').color, '#4ade80');
  assert.equal(ops.find((o) => o.kind === 'player').color, '#ffd400');
  assert.equal(ops.find((o) => o.kind === 'drift').color, '#ff6b4a');
});

test('the player op lies inside the player\'s cell', () => {
  const s = makeState();
  const { cell, ox, oy } = layout(s.level, VIEW);
  const p = list(s).find((o) => o.kind === 'player');
  assert.ok(p.x >= ox + cell && p.x <= ox + 2 * cell);
  assert.ok(p.y >= oy + cell && p.y <= oy + 2 * cell);
});

test('the HUD shows score, lives, and merges/quorum', () => {
  const s = { ...makeState(), score: 1234, lives: 2, merges: 1 };
  const texts = list(s).filter((o) => o.kind === 'hud' && o.op === 'text').map((o) => o.text).join(' | ');
  assert.ok(texts.includes('SCORE 1234'), texts);
  assert.ok(texts.includes('LIVES 2'), texts);
  assert.ok(texts.includes('1/1'), texts);
});

test('banners: PAUSED, ALL MERGED, GAME OVER, and none while playing', () => {
  const s = makeState();
  const banner = (x) => list(x).filter((o) => o.kind === 'banner').map((o) => o.text);
  assert.deepEqual(banner(s), []);
  assert.deepEqual(banner({ ...s, paused: true }), ['PAUSED']);
  assert.deepEqual(banner({ ...s, status: 'won' }), ['ALL MERGED']);
  assert.deepEqual(banner({ ...s, status: 'lost' }), ['GAME OVER']);
});

test('drawList is pure', () => {
  const s = deepFreeze(makeState());
  assert.deepEqual(list(s), list(s));
});

test('paint draws rects, circles, and text on a context', () => {
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

test('paint draws one fillRect per rect op', () => {
  const ops = drawList(makeState(), VIEW);
  const ctx = fakeCtx();
  paint(ctx, ops);
  assert.equal(ctx.calls.filter((c) => c.name === 'fillRect').length, ops.filter((o) => o.op === 'rect').length);
});

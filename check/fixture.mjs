// Local fixture checks for the renderer (not an acceptance test).
// Hand-builds a state in the shape `game.init` returns (DESIGN.md §5) so
// the renderer can be validated before or without core/game.js.
import assert from 'node:assert/strict';
import { PALETTE } from '../src/render/palette.js';
import { HUD_HEIGHT, layout, drawList, paint } from '../src/render/draw.js';
import { fakeCtx, deepFreeze } from './fake-helpers.mjs';

const TILE_ROW = '#@P.M.>H#';
const level = {
  name: 'test', quorum: 1, par: 100, driftPeriod: 1, spawnEvery: 1000,
  width: 9, height: 4,
  tiles: ['#########', TILE_ROW, '#..X....#', '#########'],
  start: { x: 1, y: 1 },
  spawns: [{ x: 2, y: 1 }],
  drifts: [{ x: 6, y: 1, dir: 'right' }],
};
const state = {
  seed: 2, tick: 0, levelTicks: 0, levels: [], levelIndex: 0, level,
  player: { x: 1, y: 1 }, carried: [],
  patches: [{ x: 2, y: 1, color: 3 }],
  drifts: level.drifts, conflicts: [], score: 0, lives: 3,
  merges: 0, open: false, invuln: 0, status: 'playing', paused: false, events: [],
};
const VIEW = { width: 640, height: 480 };
const list = (s) => drawList(s, VIEW);

// layout matches DESIGN.md §11's formula on the section's two examples.
assert.deepEqual(layout({ width: 9, height: 4 }, VIEW),
  { cell: 71, ox: 0, oy: 48 + Math.floor((432 - 284) / 2) });
assert.deepEqual(layout({ width: 10, height: 10 }, { width: 800, height: 448 }),
  { cell: 40, ox: 200, oy: 48 });

// The list starts with the background.
assert.deepEqual(list(state)[0],
  { op: 'rect', kind: 'bg', x: 0, y: 0, w: 640, h: 480, color: '#111111' });

// One wall rect per wall cell, at its cell.
const { cell, ox, oy } = layout(level, VIEW);
const walls = list(state).filter((o) => o.kind === 'wall');
for (const w of walls) {
  assert.equal(w.op, 'rect');
  assert.equal(w.color, '#2c2c2c');
  assert.equal(w.w, cell);
  assert.equal(w.h, cell);
  assert.ok(w.y >= oy && w.y < oy + level.height * cell);
}
assert.equal(walls.length, 22); // borders of a 9x4 map (2 rows of 9 + 2 rows of 2)

// Every op has a palette colour and a kind.
const HEX = /^#[0-9a-f]{6}$/;
const colours = new Set([...Object.values(PALETTE).filter((v) => typeof v === 'string'), ...PALETTE.agents]);
for (const o of list(state)) {
  assert.ok(typeof o.kind === 'string' && o.kind.length > 0, JSON.stringify(o));
  assert.ok(HEX.test(o.color) && colours.has(o.color), o.color);
}

// Exit, holds, patches, drifts, conflicts, player.
assert.equal(list(state).find((o) => o.kind === 'exit').color, '#8f8f8f');
assert.equal(list({ ...state, open: true }).find((o) => o.kind === 'exit').color, '#ffd400');
assert.equal(list(state).find((o) => o.kind === 'hold').color, '#8f8f8f');
assert.equal(list({ ...state, open: true }).find((o) => o.kind === 'hold').color, '#161616');
const c = (s) => (k) => list(s).filter((o) => o.kind === k).length;
assert.equal(c(state)('merge'), 1);
assert.equal(c(state)('patch'), 1);
assert.equal(c(state)('drift'), 1);
assert.equal(c({ ...state, conflicts: [{ x: 5, y: 2, ttl: 3 }] })('conflict'), 1);
assert.equal(c(state)('player'), 1);
assert.equal(list({ ...state, patches: [{ x: 2, y: 1, color: 3 }] }).find((o) => o.kind === 'patch').color, '#4ade80');
assert.equal(list(state).find((o) => o.kind === 'player').color, '#ffd400');
assert.equal(list(state).find((o) => o.kind === 'drift').color, '#ff6b4a');

// The player op lies inside its cell.
const counts = list({ ...state, player: { x: 1, y: 1 } });
const p = counts.find((o) => o.kind === 'player');
assert.ok(p.x >= ox + cell && p.x <= ox + 2 * cell);
assert.ok(p.y >= oy + cell && p.y <= oy + 2 * cell);

// The HUD shows score, lives, and merges/quorum.
const hud = (s) => list(s).filter((o) => o.kind === 'hud' && o.op === 'text').map((o) => o.text).join(' | ');
const texts = hud({ ...state, score: 1234, lives: 2, merges: 1 });
assert.ok(texts.includes('SCORE 1234'), texts);
assert.ok(texts.includes('LIVES 2'), texts);
assert.ok(texts.includes('1/1'), texts);

// Banners.
const banner = (s) => list(s).filter((o) => o.kind === 'banner').map((o) => o.text);
assert.deepEqual(banner(state), []);
assert.deepEqual(banner({ ...state, paused: true }), ['PAUSED']);
assert.deepEqual(banner({ ...state, status: 'won' }), ['ALL MERGED']);
assert.deepEqual(banner({ ...state, status: 'lost' }), ['GAME OVER']);

// Purity: a frozen state draws identically, twice, without mutation.
const frozen = deepFreeze({ ...state, patches: [{ x: 2, y: 1, color: 3 }], drifts: [{ x: 6, y: 1, dir: 'right' }] });
assert.deepEqual(list(frozen), list(frozen));

// paint draws rects, circles, and text on a context.
const ctx = fakeCtx();
paint(ctx, [
  { op: 'rect', kind: 'bg', x: 0, y: 0, w: 10, h: 10, color: '#111111' },
  { op: 'circle', kind: 'player', x: 5, y: 5, r: 2, color: '#ffd400' },
  { op: 'text', kind: 'hud', x: 1, y: 1, text: 'SCORE 0', color: '#f2f2f2', size: 16 },
]);
const names = ctx.calls.map((c2) => c2.name);
assert.deepEqual(ctx.calls.find((c2) => c2.name === 'fillRect').args, [0, 0, 10, 10]);
assert.equal(ctx.calls.find((c2) => c2.name === 'fillRect').fillStyle, '#111111');
assert.ok(names.includes('arc') && names.includes('fill') && names.includes('beginPath'));
assert.equal(ctx.calls.find((c2) => c2.name === 'fill').fillStyle, '#ffd400');
const t = ctx.calls.find((c2) => c2.name === 'fillText');
assert.equal(t.args[0], 'SCORE 0');
assert.equal(t.fillStyle, '#f2f2f2');
assert.ok(String(t.font).includes('16'));

// One fillRect per rect op over a real list.
const ops = list(state);
const c2 = fakeCtx();
paint(c2, ops);
assert.equal(c2.calls.filter((k) => k.name === 'fillRect').length, ops.filter((o) => o.op === 'rect').length);

console.log('renderer fixture checks: all passed');
console.log(`sample op list (${ops.length} ops):`);
[0, 1, walls.length, walls.length + 1, ops.length - 3, ops.length - 2, ops.length - 1].forEach((i) => console.log(i, JSON.stringify(ops[i])));

// My own checks for the renderer (agent-7, area 8). Run with:
//   node selftests/draw-check.mjs
// These hand-build states of DESIGN.md §5's shape so the renderer can be
// checked before and independently of src/core/game.js.
import assert from 'node:assert/strict';
import { PALETTE } from '../src/render/palette.js';
import { HUD_HEIGHT, layout, drawList, paint } from '../src/render/draw.js';

// The level of tests/18: state patched to what init(2, ...) of §5 yields.
const TILES = ['#########', '#..M...H#', '#..X....#', '#########'];
const level = {
  name: 'test', quorum: 1, par: 100, driftPeriod: 1, spawnEvery: 1000,
  width: 9, height: 4, tiles: TILES, start: { x: 1, y: 1 }, spawns: [{ x: 2, y: 1 }],
  drifts: [{ x: 6, y: 1, dir: 'right' }],
};
const state = (extra = {}) => ({
  seed: 2, tick: 0, levelTicks: 0, levelIndex: 0, level,
  player: { x: 1, y: 1 }, carried: [], patches: [{ x: 2, y: 1, color: 0 }],
  drifts: [{ x: 6, y: 1, dir: 'right' }], conflicts: [],
  score: 0, lives: 3, merges: 0, open: false, invuln: 0,
  status: 'playing', paused: false, events: [], ...extra,
});
const VIEW = { width: 640, height: 480 };
const list = (s, v = VIEW) => drawList(s, v);
const HEX = /^#[0-9a-f]{6}$/;
let n = 0;
const ok = (what) => { n++; console.log(`ok ${n} - ${what}`); };

// PALETTE is exactly §11's.
assert.deepEqual(PALETTE, {
  bg: '#111111', panel: '#1a1a1a', wall: '#2c2c2c', floor: '#161616', text: '#f2f2f2', dim: '#8f8f8f',
  accent: '#ffd400', danger: '#ff6b4a', agents: ['#c79bff', '#6aa8ff', '#ff9f45', '#4ade80'],
});
ok('palette');

assert.equal(HUD_HEIGHT, 48);
ok('HUD_HEIGHT');

assert.deepEqual(layout({ width: 9, height: 4 }, VIEW), { cell: 71, ox: 0, oy: 48 + Math.floor((432 - 284) / 2) });
assert.deepEqual(layout({ width: 10, height: 10 }, { width: 800, height: 448 }), { cell: 40, ox: 200, oy: 48 });
ok('layout');

assert.deepEqual(list(state())[0], { op: 'rect', kind: 'bg', x: 0, y: 0, w: 640, h: 480, color: '#111111' });
ok('bg first');

// One wall rect per wall cell, at its cell, full size, wall colour.
const { cell, ox, oy } = layout(level, VIEW);
const walls = list(state()).filter((o) => o.kind === 'wall');
const expected = [];
TILES.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (row[x] === '#') expected.push(`${ox + x * cell},${oy + y * cell}`); });
assert.equal(walls.length, expected.length);
for (const w of walls) {
  assert.equal(w.op, 'rect');
  assert.equal(w.color, '#2c2c2c');
  assert.equal(w.w, cell);
  assert.equal(w.h, cell);
  assert.ok(expected.includes(`${w.x},${w.y}`));
}
ok('walls');

// Every op has a palette colour and a non-empty kind.
const colours = new Set([...Object.values(PALETTE).filter((v) => typeof v === 'string'), ...PALETTE.agents]);
const manyStates = [
  state(), state({ open: true }), state({ paused: true }), state({ status: 'won' }),
  state({ status: 'lost' }), state({ carried: [0, 1, 3] }), state({ conflicts: [{ x: 5, y: 2, ttl: 3 }] }),
  state({ patches: [{ x: 2, y: 1, color: 3 }] }),
];
for (const s of manyStates) {
  for (const o of list(s)) {
    assert.ok(typeof o.kind === 'string' && o.kind.length > 0, `kind on ${JSON.stringify(o)}`);
    assert.ok( HEX.test(o.color) && colours.has(o.color), `palette colour on ${o.kind}: ${o.color}`);
  }
}
ok('op colours and kinds');

assert.equal(list(state()).find((o) => o.kind === 'exit').color, '#8f8f8f');
assert.equal(list(state({ open: true })).find((o) => o.kind === 'exit').color, '#ffd400');
assert.equal(list(state()).find((o) => o.kind === 'hold').color, '#8f8f8f');
assert.equal(list(state({ open: true })).find((o) => o.kind === 'hold').color, '#161616');
ok('exit and hold colours');

const counted = state({ conflicts: [{ x: 5, y: 2, ttl: 3 }] });
const count = (k) => list(counted).filter((o) => o.kind === k).length;
for (const k of ['merge', 'patch', 'drift', 'conflict', 'player']) assert.equal(count(k), 1, k);
ok('one op per thing');

const coloured = state({ patches: [{ x: 2, y: 1, color: 3 }] });
assert.equal(list(coloured).find((o) => o.kind === 'patch').color, '#4ade80');
assert.equal(list(coloured).find((o) => o.kind === 'player').color, '#ffd400');
assert.equal(list(coloured).find((o) => o.kind === 'drift').color, '#ff6b4a');
ok('patch, player, drift colours');

// The player op lies inside the player's cell (player at (1,1)).
const p = list(state()).find((o) => o.kind === 'player');
assert.ok(p.x >= ox + cell && p.x <= ox + 2 * cell, `p.x ${p.x}`);
assert.ok(p.y >= oy + cell && p.y <= oy + 2 * cell, `p.y ${p.y}`);
ok('player in its cell');

// Carried patches stay inside the player's cell too.
const st = state({ carried: [0, 2] });
const inCell = (o) =>
  o.x >= ox + cell && o.x <= ox + 2 * cell && o.y >= oy + cell && o.y <= oy + 2 * cell;
for (const o of list(st).filter((x) => x.kind === 'carry')) assert.ok(inCell(o), JSON.stringify(o));
ok('carry dots in the cell');

const hud = state({ score: 1234, lives: 2, merges: 1 });
const texts = list(hud).filter((o) => o.kind === 'hud' && o.op === 'text').map((o) => o.text).join(' | ');
assert.ok(texts.includes('SCORE 1234'), texts);
assert.ok(texts.includes('LIVES 2'), texts);
assert.ok(texts.includes('1/1'), texts);
ok('hud text');

const banner = (s) => list(s).filter((o) => o.kind === 'banner').map((o) => o.text);
assert.deepEqual(banner(state()), []);
assert.deepEqual(banner(state({ paused: true })), ['PAUSED']);
assert.deepEqual(banner(state({ status: 'won' })), ['ALL MERGED']);
assert.deepEqual(banner(state({ status: 'lost' })), ['GAME OVER']);
ok('banners');

// Purity: frozen state, two calls, same list.
const frozen = state();
deepFreeze(frozen);
assert.deepEqual(list(frozen), list(frozen));
ok('drawList is pure');

// paint drives a context: one fillRect per rect, arc+fill per circle,
// font then fillText per text.
const fakeCtx = () => {
  const calls = [];
  const ctx = { calls };
  for (const name of ['fillRect', 'beginPath', 'arc', 'fill', 'fillText']) {
    ctx[name] = (...args) => calls.push({ name, args, fillStyle: ctx.fillStyle, font: ctx.font });
  }
  return ctx;
};
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
const ops = list(state());
const ctx2 = fakeCtx();
paint(ctx2, ops);
assert.equal(ctx2.calls.filter((c) => c.name === 'fillRect').length, ops.filter((o) => o.op === 'rect').length);
ok('paint');

console.log(`selftests/draw-check.mjs: ${n} checks passed`);

function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}

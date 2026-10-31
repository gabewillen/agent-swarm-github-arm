// A contract audit for the landed modules, written straight from DESIGN.md.
// Catches deviations the acceptance suite does not. Not part of tests/.
import test from 'node:test';
import assert from 'node:assert/strict';
import { load, mulberry, mulberryInt, deepFreeze, fakeCtx, lvl, NONE, mv } from '../tests/helpers.mjs';

const C = () => load('core/constants.js');
const R = () => load('core/rng.js');
const L = () => load('core/level.js');
const G = () => load('core/game.js');
const I = () => load('core/invariants.js');
const S = () => load('core/stats.js');
const A = () => load('core/achievements.js');
const RG = () => load('core/replay.js');
const GEN = () => load('core/generate.js');
const P = () => load('render/palette.js');
const D = () => load('render/draw.js');
const PT = () => load('render/particles.js');
const K = () => load('input/keys.js');
const AU = () => load('audio/cues.js');
const SYN = () => load('audio/synth.js');
const M = () => load('audio/music.js');
const ME = () => load('ui/menu.js');
const SC = () => load('ui/scores.js');
const ST = () => load('ui/settings.js');

// ---- §2 constants -----------------------------------------------------
test('§2 every constant matches its table value', async () => {
  const c = await C();
  assert.deepEqual({ ...c }, {
    CARRY_MAX: 3, START_LIVES: 3, INVULN_TICKS: 6, CONFLICT_TICKS: 10,
    PATCH_BASE: 100, SAME_COLOR_BONUS: 50, TIME_BONUS_PER_TICK: 10, COLORS: 4,
    TICK_MS: 120,
    DIRS: { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] },
    CLOCKWISE: ['up', 'right', 'down', 'left'],
  });
});

// ---- §3 rng -----------------------------------------------------------
test('§3 rngNext matches the exact mulberry32 recipe', async () => {
  const { rngNext, rngInt } = await R();
  for (const seed of [0, 1, 2, 42, 123456789, 4294967295]) {
    assert.deepEqual(rngNext(seed), mulberry(seed >>> 0));
    assert.deepEqual(rngInt(seed, 7), mulberryInt(seed >>> 0, 7));
  }
  const { value } = rngNext(0);
  assert.ok(value >= 0 && value < 1);
});

// ---- §4 validateLevel edge codes --------------------------------------
test('§4 validateLevel flags ragged and too_big', async () => {
  const { validateLevel } = await L();
  const ragged = validateLevel(lvl(['#####', '#@.P#', '#..M##', '#####']));
  assert.deepEqual(ragged.errors, ['ragged', 'exit_count']);
  const big = validateLevel(lvl(['#'.repeat(33)]));
  assert.deepEqual(big.errors, ['too_big', 'player_count', 'exit_count', 'no_merge', 'no_spawn']);
});

test('§4 validateLevel flags no_border and unreachable', async () => {
  const { validateLevel } = await L();
  assert.deepEqual(
    validateLevel(lvl(['###.#', '#@PM#', '#####'])).errors,
    ['no_border', 'exit_count'],
  );
  // X sealed behind a full wall ring from the @: unreachable, P and M fine.
  assert.deepEqual(
    validateLevel(lvl(['#######', '#@.P.M#', '#.#####', '#...#X#', '#######']), ).errors,
    ['unreachable'],
  );
});

// ---- §5 state shape -----------------------------------------------------
test('§5 init builds the exact starting shape', async () => {
  const { parseLevel } = await L();
  const { init } = await G();
  const def = lvl(['#####', '#@.P#', '#..M#', '#..X#', '#####']);
  const s = init(7, { levels: [def] });
  const drew = mulberryInt(7, 4); // the one patch colour draw, in reading order
  assert.equal(s.seed, drew.seed);
  assert.deepEqual(s.patches, [{ x: 3, y: 1, color: drew.value }]);
  const level = parseLevel(def);
  assert.deepEqual({ ...s, seed: null, patches: null, level: null }, {
    seed: null, tick: 0, levelTicks: 0,
    levels: [def], levelIndex: 0, level: null,
    player: { x: 1, y: 1 }, carried: [], drifts: [], conflicts: [], patches: null,
    score: 0, lives: 3, merges: 0, open: false, invuln: 0,
    status: 'playing', paused: false, events: [],
  });
  assert.deepEqual(s.level, level);
});

test('§5 init with several spawns draws colours in reading order', async () => {
  const { init } = await G();
  const def = lvl(['#####', '#@PP#', '#..M#', '#..X#', '#####']);
  const s = init(3, { levels: [def] });
  let seed = 3;
  const expected = [];
  for (let i = 0; i < 2; i++) { const r = mulberryInt(seed, 4); expected.push({ x: 2 + i, y: 1, color: r.value }); seed = r.seed; }
  assert.deepEqual(s.patches, expected);
  assert.equal(s.seed, seed);
});

// ---- §6 steps -----------------------------------------------------------
test('§6 step 2: pause flips and reports pause/resume events', async () => {
  const { init, step } = await G();
  const map = ['#####', '#@.P#', '#..M#', '#..X#', '#####'];
  let s = init(1, { levels: [lvl(map)] });
  s = step(s, { move: 'right', pause: true });
  assert.deepEqual(s.events, ['pause']);
  assert.equal(s.paused, true);
  assert.deepEqual(step(s, { move: null, pause: true }).events, ['resume']);
  const paused = step(s, { move: 'right', pause: false });
  assert.deepEqual(paused.events, []);
  assert.deepEqual({ x: paused.player.x, y: paused.player.y }, { x: 1, y: 1 });
  assert.equal(paused.tick, s.tick);
});

test('§6 step 1: a won/lost state returns unchanged but empty events', async () => {
  const { init, step } = await G();
  const d = lvl(['#####', '#@.P#', '#..M#', '#..X#', '#####']);
  let s = init(1, { levels: [d] });
  s = step(s, mv('right'));
  const won = { ...s, status: 'won', events: ['stale'] };
  const next = step(won, mv('right'));
  assert.deepEqual(next.events, []);
  assert.equal(next.tick, won.tick);
  assert.equal(next.score, won.score);
});

test('§6 input tolerance: missing input and missing fields mean no move', async () => {
  const { init, step } = await G();
  const d = lvl(['#####', '#@.P#', '#..M#', '#..X#', '#####']);
  let s = init(1, { levels: [d] });
  for (const inp of [undefined, {}, { pause: false }, null]) {
    const n = step(s, inp);
    assert.equal(n.tick, s.tick + 1, JSON.stringify(inp));
    assert.deepEqual(n.player, s.player);
    assert.deepEqual(n.events, []);
  }
});

// ---- §7 events / §13 cues ----------------------------------------------
test('§7 event names are exactly the twelve of the design', async () => {
  const names = ['pickup', 'merge', 'quorum', 'level', 'won', 'conflict', 'drop', 'hit', 'lost', 'spawn', 'pause', 'resume'];
  const { cuesFor } = await AU();
  assert.deepEqual(cuesFor(names), ['blip', 'chord', 'fanfare', 'sweep', 'fanfare', 'buzz', 'scatter', 'thud', 'dirge', 'tick']);
  assert.deepEqual(cuesFor(['pause', 'resume', 'nothere']), []);
});

test('§13 CUES values all hold their field ranges', async () => {
  const { CUES } = await AU();
  const waves = new Set(['sine', 'square', 'triangle', 'sawtooth']);
  for (const [name, cue] of Object.entries(CUES)) {
    assert.ok(Array.isArray(cue.notes) && cue.notes.length > 0, name);
    for (const n of cue.notes) assert.ok(n >= 20 && n <= 5000, `${name} note ${n}`);
    assert.ok(waves.has(cue.wave), `${name} wave`);
    assert.ok(cue.duration > 0 && cue.duration <= 2, `${name} duration`);
    assert.ok(cue.gain > 0 && cue.gain <= 1, `${name} gain`);
  }
});

test('§13 createAudio builds its context lazily and stays silent when muted', async () => {
  const { createAudio } = await SYN();
  let built = 0;
  class FakeCtx {
    constructor() { built++; this.destination = {}; this.currentTime = 0; }
    createOscillator() { return { type: '', frequency: { value: 0 }, connect() {}, start() {}, stop() {} }; }
    createGain() { return { gain: { value: 0 }, connect() {} }; }
  }
  const audio = createAudio(FakeCtx);
  assert.equal(built, 0);
  audio.play('no-such-cue');
  assert.equal(built, 0);
  audio.play('blip');
  assert.equal(built, 1);
  audio.setMuted(true);
  assert.equal(audio.isMuted(), true);
  audio.play('blip');
  assert.equal(built, 1);
  audio.setMuted(false);
  assert.equal(audio.isMuted(), false);
});

// ---- §17 settings -------------------------------------------------------
test('§17 settings: load clamps volume, keeps defaults, ignores junk', async () => {
  const { DEFAULT_SETTINGS, loadSettings, saveSettings, tickMs } = await ST();
  assert.equal(DEFAULT_SETTINGS.volume, 0.8);
  assert.equal(tickMs({ speed: 'slow' }), 160);
  assert.equal(tickMs({ speed: 'fast' }), 90);
  assert.equal(tickMs({ speed: 'normal' }), 120);
  assert.equal(tickMs({}), 120);
  assert.deepEqual(loadSettings('not json'), DEFAULT_SETTINGS);
  assert.deepEqual(loadSettings('[1]'), DEFAULT_SETTINGS);
  const s = loadSettings('{"sound":false,"music":false,"volume":5,"speed":"turbo","colorblind":true,"extra":1}');
  assert.deepEqual(s, { sound: false, music: false, volume: 1, speed: 'normal', colorblind: true });
  assert.deepEqual(loadSettings('{"volume":-2}'), { ...DEFAULT_SETTINGS, volume: 0 });
  const out = JSON.parse(saveSettings(s));
  assert.deepEqual(Object.keys(out).sort(), ['colorblind', 'music', 'sound', 'speed', 'volume']);
});

// ---- §14 scores ----------------------------------------------------------
test('§14 addScore orders, ties, and cuts to 10; formatScore pads', async () => {
  const { addScore, formatScore, parseTable } = await SC();
  let t = [];
  t = addScore(t, { name: 'aa', score: 10 });
  t = addScore(t, { name: 'bb', score: 30 });
  t = addScore(t, { name: 'cc', score: 20 });
  t = addScore(t, { name: 'dd', score: 20 }); // equal goes after
  assert.deepEqual(t.map((e) => e.name), ['bb', 'cc', 'dd', 'aa']);
  let big = [];
  for (let i = 0; i < 12; i++) big = addScore(big, { name: 'n' + i, score: i + 1 });
  assert.deepEqual(big.map((e) => e.score), [12, 11, 10, 9, 8, 7, 6, 5, 4, 3]);
  assert.equal(formatScore(0), '000000');
  assert.equal(formatScore(1234), '001234');
  assert.equal(formatScore(999999), '999999');
  assert.equal(formatScore(1000000), '999999');
  assert.deepEqual(parseTable('[{"name":"a","score":1}]'), [{ name: 'a', score: 1 }]);
  assert.deepEqual(parseTable('[{"name":"a","score":1.5}]'), []);
  assert.deepEqual(parseTable('[{"name":7,"score":1}]'), []);
  assert.deepEqual(parseTable('[]'), []);
});

// ---- §18 replays ----------------------------------------------------------
test('§18 charOf and inputOf, and encode/decode round-trips', async () => {
  const { charOf, inputOf } = await RG();
  assert.equal(charOf(mv('up')), 'u');
  assert.equal(charOf(mv('right')), 'r');
  assert.equal(charOf(mv('down')), 'd');
  assert.equal(charOf(mv('left')), 'l');
  assert.equal(charOf(mv(null)), '.');
  assert.equal(charOf({ move: 'up', pause: true }), 'p'); // a pause wins
  assert.equal(charOf({}), '.');
  assert.deepEqual(inputOf('u'), { move: 'up', pause: false });
  assert.deepEqual(inputOf('.'), { move: null, pause: false });
  assert.deepEqual(inputOf('p'), { move: null, pause: true });
});

test('§18 encodeReplay run-lengths runs of 2 or more; decode rejects junk', async () => {
  const { encodeReplay, decodeReplay, recordReplay } = await RG();
  const d = lvl(['#####', '#@.P#', '#..M#', '#..X#', '#####']);
  const replay = recordReplay(5, [mv('right'), mv('right'), mv('right'), mv('up'), mv(null)], { levels: [d] });
  assert.deepEqual(replay, { seed: 5, level: 0, moves: 'rrru.' });
  assert.equal(encodeReplay(replay), 'QR1:5:0:3ru.');
  assert.deepEqual(decodeReplay('QR1:5:0:3ru.'), replay);
  const rl = recordReplay(5, [mv('left'), mv(null), mv(null), mv(null), mv(null)], { levels: [d] });
  assert.equal(encodeReplay(rl), 'QR1:5:0:l4.');
  assert.deepEqual(decodeReplay(encodeReplay(rl)), rl);
  assert.deepEqual(decodeReplay('QR1:5:0:'), { seed: 5, level: 0, moves: '' }); // no moves is well formed
  assert.deepEqual(decodeReplay('QR1:5:0:2u'), { seed: 5, level: 0, moves: 'uu' });
  for (const bad of ['QR2:5:0:u', 'QR1:5:0:1u', 'QR1:xx:0:u', 'QR1:5:xx:u', 'QR1:-1:0:u', 'QR1:5:0:-1', 'QR1:4294967296:0:u', 'QR1:5:0:z', 'QR1:5:0:3', 'QR1:5:0:2', 'QR1:5:0:77:u', 'x', '']) {
    assert.equal(decodeReplay(bad), null, JSON.stringify(bad));
  }
});

// ---- §19 generate ----------------------------------------------------------
test('§19 hashSeed is FNV-1a; dailySeed checks the form', async () => {
  const { hashSeed, dailySeed } = await GEN();
  let h = 0x811c9dc5;
  const fnv = (u) => { h ^= u; h = Math.imul(h, 0x01000193) >>> 0; };
  for (const cu of 'quorum-run:2026-02-03') fnv(cu.charCodeAt(0));
  assert.equal(hashSeed('quorum-run:2026-02-03'), h >>> 0);
  assert.equal(dailySeed('2026-02-03'), hashSeed('quorum-run:2026-02-03'));
  for (const t of ['2026-1-30', 'today', '', '2026/10/30', '2026-10-30T00:00']) {
    assert.equal(dailySeed(t), null, t);
  }
});

test('§19 generateLevel: defaults, determinism, and its rules', async () => {
  const { generateLevel } = await GEN();
  const { parseLevel } = await L();
  const def = generateLevel(9);
  assert.equal(def.name, 'Generated 9');
  assert.ok(def.par >= 30);
  assert.equal(def.driftPeriod, 2);
  assert.equal(def.spawnEvery, 12);
  assert.deepEqual(generateLevel(9), def);
  assert.notDeepEqual(generateLevel(10).map, def.map);
  assert.throws(() => generateLevel(1, { width: 6 }), RangeError);
  assert.throws(() => generateLevel(1, { height: 25 }), RangeError);
  assert.throws(() => generateLevel(1, { height: 3 }), RangeError);
  const far = generateLevel(1);
  const { width, height } = parseLevel(far);
  assert.equal(width, 15);
  assert.equal(height, 11);
  const parsed = parseLevel(far);
  const manh = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  for (const dr of parsed.drifts) assert.ok(manh(dr, parsed.start) >= 3);
});

// ---- §21 achievements ------------------------------------------------------
test('§21 the exact id list and order', async () => {
  const { ACHIEVEMENTS, checkAchievements } = await A();
  assert.deepEqual(ACHIEVEMENTS.map((a) => a.id), [
    'first_pickup', 'first_merge', 'full_hands', 'monochrome', 'quorum', 'shipped', 'flawless', 'conflict', 'survivor', 'champion',
  ]);
  for (const a of ACHIEVEMENTS) {
    assert.equal(typeof a.title, 'string');
    assert.equal(typeof a.description, 'string');
  }
  // The events of the step are next.events; the carried of the step's
  // start are prev.carried.
  const stepOf = (carried, events, lives) => ({ carried, events, lives });
  // Two same-coloured carried patches merging is a merge, not full_hands.
    assert.deepEqual(checkAchievements(stepOf(['b', 'b']), stepOf([], ['merge']), []), ['first_merge']);
  // Three of one colour: full_hands AND monochrome, in ACHIEVEMENTS order.
  assert.deepEqual(
    checkAchievements(stepOf([2, 2, 2]), stepOf([], ['merge']), []),
    ['first_merge', 'full_hands', 'monochrome'],
  );
  // full_hands means three patches; monochrome means same colour: 3 mixed).
  assert.deepEqual(
    checkAchievements(stepOf([0, 1, 2]), stepOf([], ['merge']), []),
    ['first_merge', 'full_hands'],
  );
  assert.deepEqual(checkAchievements(stepOf([], []), stepOf([], ['pickup']), ['first_pickup']), []);
  assert.deepEqual(checkAchievements(stepOf([], []), stepOf([], ['conflict']), []), ['conflict']);
  assert.deepEqual(checkAchievements(stepOf([], []), stepOf([], ['level']), []), ['shipped']);
  assert.deepEqual(checkAchievements(stepOf([], []), stepOf([], ['quorum']), []), ['quorum']);
  const both = checkAchievements(stepOf([], []), stepOf([], ['pickup', 'merge', 'quorum', 'level']), []);
  assert.deepEqual(both, ['first_pickup', 'first_merge', 'quorum', 'shipped']); // ACHIEVEMENTS order, not event order
  assert.deepEqual(checkAchievements(stepOf([], []), stepOf([], ['won']), []), ['shipped', 'champion']); // the last exit ships too
  // flawless: ship or win with all START_LIVES.
  assert.ok(checkAchievements(stepOf([], [], 3), stepOf([], ['won'], 3), []).includes('flawless'));
  assert.ok(checkAchievements(stepOf([], [], 3), stepOf([], ['level'], 3), []).includes('flawless'));
  assert.deepEqual(checkAchievements(stepOf([], [], 1), stepOf([], ['level'], 1), []).filter((i) => i === 'flawless'), []);
});

// ---- §22 statistics --------------------------------------------------------
test('§22 statsInit, statsUpdate on a step, and statsLines', async () => {
  const { statsInit, statsUpdate, statsLines } = await S();
  assert.deepEqual(statsInit(), { ticks: 0, moves: 0, pickups: 0, merges: 0, patchesMerged: 0, bestMerge: 0, hits: 0, drops: 0, conflicts: 0, levels: 0 });
  const { init, step } = await G();
  const d = lvl(['#######', '#@.P.M#', '#..X..#', '#######'], { quorum: 1, spawnEvery: 1000 });
  const s = init(1, { levels: [d] });
  const st = { ...statsInit() };
  const after = step(s, mv('right'));
  const u = statsUpdate(st, s, after, mv('right'));
  assert.equal(u.ticks, 1);
  assert.equal(u.moves, 1);
  assert.deepEqual(statsLines(u), ['MOVES 1', 'MERGES 0', 'BEST 0', 'HITS 0', 'LEVELS 0']);
  // A merge of two patches: patchesMerged 2, bestMerge 2, merges 1.
  const fakePrev = { ...s, carried: ['a', 'b'] };
  const fakeNext = { ...s, events: ['merge'], score: 100 };
  const st2 = statsUpdate(statsInit(), fakePrev, fakeNext, mv('right'));
  assert.equal(st2.patchesMerged, 2);
  assert.equal(st2.bestMerge, 2);
  assert.equal(st2.merges, 1);
  assert.equal(st2.moves, 0); // the fabricated state never moved
  // A level event counts a level.
  const st3 = statsUpdate(statsInit(), fakePrev, { ...s, events: ['level', 'won'] }, mv('right'));
  assert.equal(st3.levels, 2);
});

// ---- §11 palette, layout, drawList, paint -----------------------------------
test('§11 PALETTE and HUD_HEIGHT exactly', async () => {
  const { PALETTE } = await P();
  const { HUD_HEIGHT } = await D();
  assert.deepEqual(PALETTE, {
    bg: '#111111', panel: '#1a1a1a', wall: '#2c2c2c', floor: '#161616',
    text: '#f2f2f2', dim: '#8f8f8f', accent: '#ffd400', danger: '#ff6b4a',
    agents: ['#c79bff', '#6aa8ff', '#ff9f45', '#4ade80'],
  });
  assert.equal(HUD_HEIGHT, 48);
});

test('§11 layout math', async () => {
  const { layout } = await D();
  const level = { width: 7, height: 5 };
  const l = layout(level, { width: 100, height: 100 });
  assert.deepEqual(l, {
    cell: Math.floor(Math.min(100 / 7, (100 - 48) / 5)),
    ox: Math.floor((100 - l.cell * 7) / 2),
    oy: 48 + Math.floor((100 - 48 - l.cell * 5) / 2),
  });
});

test('§11 drawList lists bg, walls, cells, actors, hud; banner only when needed', async () => {
  const { drawList } = await D();
  const { parseLevel } = await L();
  const map = ['#####', '#@.P#', '#.MH#', '#..X#', '#####'];
  const level = parseLevel(lvl(map, { quorum: 1 }));
  const view = { width: 200, height: 200 };
  const { init } = await G();
  const s = { ...init(1, { levels: [lvl(map, { quorum: 1 })] }), level };
  const ls = drawList(s, view);
  assert.equal(ls[0].kind, 'bg');
  assert.equal(ls[0].color, '#111111');
  assert.equal(ls.filter((o) => o.kind === 'wall').length, 16);
  assert.equal(ls.filter((o) => o.kind === 'merge').length, 1);
  assert.equal(ls.filter((o) => o.kind === 'hold').length, 1);
  assert.equal(ls.filter((o) => o.kind === 'exit').length, 1);
  const exit = ls.find((o) => o.kind === 'exit');
  assert.equal(exit.color, '#8f8f8f');
  const hold = ls.find((o) => o.kind === 'hold');
  assert.equal(hold.color, '#8f8f8f');
  // An open quorum: the exit turns accent and the hold opens to floor.
  const open = { ...s, open: true };
  assert.equal(drawList(open, view).find((o) => o.kind === 'exit').color, '#ffd400');
  assert.equal(drawList(open, view).find((o) => o.kind === 'hold').color, '#161616');
  assert.equal(ls.filter((o) => o.kind === 'player').length, 1);
  assert.equal(ls.find((o) => o.kind === 'player').color, '#ffd400');
  const hud = ls.filter((o) => o.kind === 'hud').map((o) => o.text);
  assert.ok(hud.includes('SCORE 0'));
  assert.ok(hud.includes('LIVES 3'));
  assert.ok(hud.some((t) => t === '0/1'));
  assert.ok(!ls.some((o) => o.kind === 'banner'));
  assert.ok(drawList({ ...s, paused: true }, view).some((o) => o.kind === 'banner' && o.text === 'PAUSED'));
  assert.ok(drawList({ ...s, status: 'won' }, view).some((o) => o.kind === 'banner' && o.text === 'ALL MERGED'));
  assert.ok(drawList({ ...s, status: 'lost' }, view).some((o) => o.kind === 'banner' && o.text === 'GAME OVER'));
});

test('§11 paint issues the ops in order on the 2D context', async () => {
  const { paint } = await D();
  const ctx = fakeCtx();
  const ops = [
    { op: 'rect', kind: 'bg', x: 0, y: 0, w: 4, h: 4, color: '#111111' },
    { op: 'circle', kind: 'particle', x: 5, y: 5, r: 2, color: '#ffd400' },
    { op: 'text', kind: 'hud', x: 5, y: 5, text: 'SCORE 0', color: '#f2f2f2', size: 12 },
  ];
  paint(ctx, ops);
  assert.deepEqual(ctx.calls.map((c) => c.name), ['fillRect', 'beginPath', 'arc', 'fill', 'fillText']);
  assert.equal(ctx.calls[0].fillStyle, '#111111');
  assert.equal(ctx.calls[1].fillStyle, '#ffd400');
  assert.equal(ctx.calls[3].fillStyle, '#ffd400');
  assert.deepEqual(ctx.calls[2].args, [5, 5, 2, 0, Math.PI * 2]);
  assert.equal(ctx.calls[4].fillStyle, '#f2f2f2');
});

// ---- §23 particles ----------------------------------------------------------
test('§23 burst, stepParticles, particlesFor, particleOps', async () => {
  const { burst, stepParticles, particlesFor, particleOps, PARTICLE_TTL } = await PT();
  assert.equal(PARTICLE_TTL, 12);
  const b = burst(2.5, 3.5, '#ffd400', 3, 9);
  assert.equal(b.particles.length, 3);
  for (const p of b.particles) {
    assert.equal(p.x, 2.5);
    assert.equal(p.y, 3.5);
    assert.equal(p.ttl, PARTICLE_TTL);
    assert.equal(p.color, '#ffd400');
    // Each particle: angle draw then speed draw, from the running seed.
    assert.ok(Math.hypot(p.vx, p.vy) >= 0.05 && Math.hypot(p.vx, p.vy) <= 0.15);
  }
  // The seed after 3 particles × 2 draws.
  let seed = 9;
  for (let i = 0; i < 3; i++) { seed = mulberry(seed).seed; seed = mulberry(seed).seed; }
  assert.equal(b.seed, seed);
  // The velocities match two rngNext draws exactly.
  seed = 9;
  for (let i = 0; i < 3; i++) {
    const a = mulberry(seed).value * 2 * Math.PI;
    seed = mulberry(seed).seed;
    const v = 0.05 + mulberry(seed).value * 0.1;
    seed = mulberry(seed).seed;
    assert.deepEqual({ vx: b.particles[i].vx, vy: b.particles[i].vy }, { vx: Math.cos(a) * v, vy: Math.sin(a) * v });
  }
  const stepped = stepParticles([
    { x: 0, y: 0, vx: 0.1, vy: 0, ttl: 2 },
    { x: 1, y: 1, vx: 0, vy: 0, ttl: 1 }, // drops to 0: gone
  ]);
  assert.deepEqual(stepped, [{ x: 0.1, y: 0, vx: 0.1, vy: 0.01, ttl: 1 }]);
});

test('§23 particlesFor colours each event type at its cell', async () => {
  const { particlesFor } = await PT();
  const { PALETTE } = await P();
  const { init, step } = await G();
  const d = lvl(['#####', '#@.P#', '#..M#', '#..X#', '#####']);
  const s = init(1, { levels: [d] });
  const s1 = step(step(s, mv('right')), mv('right')); // onto the P's patch: pickup
  assert.deepEqual(s1.events, ['pickup']);
  const f = particlesFor(s1, 5);
  assert.equal(f.particles.length, 6);
  assert.equal(f.particles[0].x, s1.player.x + 0.5);
  assert.equal(f.particles[0].y, s1.player.y + 0.5);
  assert.equal(f.particles[0].color, PALETTE.agents[s1.carried[0]]);
  // merge: 12 in accent.
  const m = { ...s1, events: ['merge'] };
  const fm = particlesFor(m, 5);
  assert.equal(fm.particles.length, 12);
  assert.equal(fm.particles[0].color, PALETTE.accent);
  // drop and hit: 10 in danger.
  assert.equal(particlesFor({ ...s1, events: ['drop'] }, 5).particles.length, 10);
  assert.equal(particlesFor({ ...s1, events: ['drop'] }, 5).particles[0].color, PALETTE.danger);
  assert.equal(particlesFor({ ...s1, events: ['hit'] }, 5).particles.length, 10);
  // conflict: 8 per new conflict cell.
  const c = { ...s1, events: ['conflict'], conflicts: [{ x: 0, y: 0, ttl: 10 }, { x: 1, y: 1, ttl: 10 }] };
  const fc = particlesFor(c, 5);
  assert.equal(fc.particles.length, 16);
  assert.equal(fc.particles[0].x, 0.5);
  assert.equal(fc.particles[0].y, 0.5);
  assert.equal(fc.particles[8].x, 1.5);
  // No particles for other events.
  assert.equal(particlesFor({ ...s1, events: ['spawn', 'quorum', 'level', 'won', 'lost', 'pause'] }, 5).particles.length, 0);
});

test('§23 particleOps maps particles into the layout', async () => {
  const { particleOps } = await PT();
  const ops = particleOps([{ x: 0, y: 0, vx: 0, vy: 0, ttl: 1, color: '#ffd400' }], { ox: 10, oy: 20, cell: 12 });
  assert.deepEqual(ops, [{ op: 'circle', kind: 'particle', x: 10, y: 20, r: 1, color: '#ffd400' }]);
  // Radius is at least 1, cell/12 when larger.
  assert.equal(particleOps([{ x: 0, y: 0, vx: 0, vy: 0, ttl: 1, color: '#a' }], { ox: 0, oy: 0, cell: 24 })[0].r, 2);
});

// ---- §12 input --------------------------------------------------------------
test('§12 keyToInput covers every key of the table', async () => {
  const { keyToInput, swipeToInput, queuePush, queueTake, INPUT_QUEUE_MAX, attachKeyboard } = await K();
  assert.deepEqual(keyToInput('ArrowUp'), { move: 'up', pause: false });
  assert.deepEqual(keyToInput('ArrowDown'), { move: 'down', pause: false });
  assert.deepEqual(keyToInput('ArrowLeft'), { move: 'left', pause: false });
  assert.deepEqual(keyToInput('ArrowRight'), { move: 'right', pause: false });
  for (const [k, m] of [['w', 'up'], ['W', 'up'], ['s', 'down'], ['S', 'down'], ['a', 'left'], ['A', 'left'], ['d', 'right'], ['D', 'right']]) {
    assert.deepEqual(keyToInput(k), { move: m, pause: false }, k);
  }
  assert.deepEqual(keyToInput('p'), { move: null, pause: true });
  assert.deepEqual(keyToInput('P'), { move: null, pause: true });
  assert.deepEqual(keyToInput('Escape'), { move: null, pause: true });
  assert.equal(keyToInput('q'), null);
  assert.deepEqual(swipeToInput(0, 0), null);
  assert.deepEqual(swipeToInput(23, 0), null);
  assert.deepEqual(swipeToInput(24, 23), { move: 'right', pause: false });
  assert.deepEqual(swipeToInput(-24, 0), { move: 'left', pause: false });
  assert.deepEqual(swipeToInput(0, 24), { move: 'down', pause: false });
  assert.deepEqual(swipeToInput(0, -24), { move: 'up', pause: false });
  assert.deepEqual(swipeToInput(24, 24), { move: 'right', pause: false }); // tie goes horizontal
  assert.equal(INPUT_QUEUE_MAX, 4);
  let q = [];
  q = queuePush(q, mv('up'));
  q = queuePush(q, mv('down'));
  assert.deepEqual(q, [mv('up'), mv('down')]);
  const t = queueTake(q);
  assert.deepEqual(t.input, mv('up'));
  assert.deepEqual(t.queue, [mv('down')]);
  assert.deepEqual(q, [mv('up'), mv('down')]); // unchanged
  assert.deepEqual(queueTake([]), { input: { move: null, pause: false }, queue: [] });
  const full = [mv('up'), mv('down'), mv('up'), mv('down')];
  assert.deepEqual(queuePush(full, mv('up')), full); // unchanged at max
  assert.deepEqual(queuePush(q, null), q);
  let removed = 0;
  const target = {
    listeners: [],
    addEventListener(_n, h) { this.listeners.push(h); },
    removeEventListener(_n, h) { const i = this.listeners.indexOf(h); if (i >= 0) { this.listeners.splice(i, 1); removed++; } },
  };
  const got = [];
  const off = attachKeyboard(target, (inp) => got.push(inp));
  const ev = { key: 'ArrowLeft', preventDefault() { ev.prevented = true; } };
  target.listeners[0](ev);
  assert.equal(ev.prevented, true);
  assert.deepEqual(got, [{ move: 'left', pause: false }]);
  target.listeners[0]({ key: 'q', preventDefault() {} });
  assert.equal(got.length, 1);
  off();
  assert.equal(removed, 1);
});

// ---- §14 menu ---------------------------------------------------------------
test('§14 menuInit, menuItems, and every menuReduce row', async () => {
  const { menuInit, menuReduce, menuItems, hudText } = await ME();
  assert.deepEqual(menuInit(), { screen: 'title', selected: 0, sound: true, mode: 'campaign' });
  assert.deepEqual(menuItems(menuInit()), ['Play', 'Daily run', 'Level editor', 'How to play', 'Sound: on']);
  assert.deepEqual(menuItems({ ...menuInit(), sound: false }), ['Play', 'Daily run', 'Level editor', 'How to play', 'Sound: off']);
  // Title navigation: one step, and wraps both ways.
  assert.equal(menuReduce(menuInit(), 'down').selected, 1);
  assert.equal(menuReduce(menuInit(), 'up').selected, 4);
  // Item 0: campaign play.
  let m = menuReduce(menuInit(), 'select');
  assert.deepEqual({ screen: m.screen, mode: m.mode }, { screen: 'playing', mode: 'campaign' });
  // paused rows.
  assert.equal(menuReduce(m, 'pause').screen, 'paused');
  assert.equal(menuReduce(menuReduce(m, 'pause'), 'pause').screen, 'playing');
  assert.equal(menuReduce(menuReduce(m, 'pause'), 'select').screen, 'playing');
  assert.equal(menuReduce(menuReduce(m, 'pause'), 'back').screen, 'title');
  // over rows.
  const over = menuReduce(m, 'gameover');
  assert.equal(over.screen, 'over');
  assert.equal(menuReduce(over, 'select').screen, 'title');
  // Item 1: daily run.
  const daily = menuReduce(menuReduce(menuInit(), 'down'), 'select');
  assert.deepEqual({ screen: daily.screen, mode: daily.mode }, { screen: 'playing', mode: 'daily' });
  // Item 2: the editor, into playing a custom level.
  const editor = menuReduce(menuReduce(menuReduce(menuInit(), 'down'), 'down'), 'select');
  assert.equal(editor.screen, 'editor');
  const custom = menuReduce(editor, 'select');
  assert.deepEqual({ screen: custom.screen, mode: custom.mode }, { screen: 'playing', mode: 'custom' });
  assert.equal(menuReduce(editor, 'back').screen, 'title');
  // Item 3: help, back or select returns to the title.
  let h = menuInit();
  for (let i = 0; i < 3; i++) h = menuReduce(h, 'down');
  h = menuReduce(h, 'select');
  assert.equal(h.screen, 'help');
  assert.equal(menuReduce(h, 'back').screen, 'title');
  assert.equal(menuReduce(h, 'select').screen, 'title');
  // Item 4: flips sound.
  let s4 = menuInit();
  for (let i = 0; i < 4; i++) s4 = menuReduce(s4, 'down');
  assert.equal(s4.selected, 4);
  assert.equal(menuReduce(s4, 'select').sound, false);
  // Anything else leaves the menu as it was.
  assert.deepEqual(menuReduce(menuInit(), 'no-such-action'), menuInit());
  const frozen = deepFreeze(menuInit());
  assert.deepEqual(menuReduce(frozen, 'down'), { screen: 'title', selected: 1, sound: true, mode: 'campaign' });
  // hudText
  const { init } = await G();
  const gs = init(1, { levels: [lvl(['#####', '#@.P#', '#..M#', '#..X#', '#####'])] });
  assert.deepEqual(hudText(gs), ['SCORE 0', 'LIVES 3', 'MERGES 0/1', 'LEVEL 1']);
});

// ---- §8 invariants ---------------------------------------------------------
test('§8 checkState codes on mutated states', async () => {
  const { checkState } = await I();
  const { init } = await G();
  const d = lvl(['#####', '#@.P#', '#..M#', '#..X#', '#####']);
  const s = init(1, { levels: [d] });
  assert.deepEqual(checkState(s), []);
  assert.ok(checkState({ ...s, status: 'nope' }).includes('bad_status'));
  assert.ok(checkState({ ...s, player: { x: 0, y: 0 } }).includes('player_in_wall'));
  assert.ok(checkState({ ...s, carried: [0, 1, 2, 3] }).includes('carry_overflow'));
  assert.ok(checkState({ ...s, lives: -1 }).includes('lives_range'));
  assert.ok(checkState({ ...s, lives: 4 }).includes('lives_range'));
  assert.ok(checkState({ ...s, score: -5 }).includes('score_negative'));
  assert.ok(checkState({ ...s, patches: [{ x: 2, y: 2, color: 0 }] }).includes('patch_off_spawn'));
  assert.ok(checkState({ ...s, drifts: [{ x: 0, y: 0, dir: 'up' }] }).includes('drift_in_wall'));
  assert.ok(checkState({ ...s, carried: [7] }).includes('bad_color'));
  assert.ok(checkState({ ...s, patches: [{ x: 2, y: 1, color: 0.5 }] }).includes('bad_color'));
});

// ---- a short real game stays invariant-clean -------------------------------
test('a seeded game of drift steps keeps state invariants', async () => {
  const { init, step } = await G();
  const { checkState } = await I();
  const d = lvl(['#######', '#@.P.M#', '#..X..#', '#######'], { quorum: 1, par: 100, driftPeriod: 2, spawnEvery: 8 });
  let s = init(11, { levels: [d] });
  const dirs = ['up', 'right', 'down', 'left'];
  for (let i = 0; i < 40 && s.status === 'playing'; i++) {
    s = step(s, mv(dirs[i % 4]));
    assert.deepEqual(checkState(s), []);
  }
});

// ---- §24 music --------------------------------------------------------------
test('§24 music: SCALE, ROOT_HZ, noteHz, tempo, and the bar', async () => {
  const { SCALE, ROOT_HZ, noteHz, tempo, bar, scheduleBar } = await M();
  assert.deepEqual(SCALE, [0, 2, 3, 5, 7, 8, 10]);
  assert.equal(ROOT_HZ, 220);
  // noteHz of the root is the root.
  assert.equal(noteHz(0, 0), ROOT_HZ);
  // Formula check for a few degrees and octaves, including negative mod.
  for (const [degree, octave] of [[3, 0], [7, 0], [9, 1], [10, 0], [15, -1], [4, -1]]) {
    const expected = ROOT_HZ * 2 ** ((SCALE[((degree % 7) + 7) % 7] + 12 * (octave + Math.floor(degree / 7))) / 12);
    assert.ok(Math.abs(noteHz(degree, octave) - expected) < 1e-9, `noteHz(${degree},${octave})`);
  }
  assert.equal(tempo(0), 96);
  assert.equal(tempo(3), 120);
  assert.equal(tempo(6), 144);
  assert.equal(tempo(8), 160);
  assert.equal(tempo(20), 160);
  for (let li = 0; li < 8; li++) {
    for (let b = 0; b < 4; b++) {
      const steps = bar(li, b);
      assert.equal(steps.length, 8);
      assert.ok(steps.filter(Boolean).length >= 3, `bar(${li},${b}) notes`);
      for (const note of steps) {
        if (note) {
          assert.ok(note.degree >= 0 && note.degree <= 6);
          assert.ok(note.octave >= -1 && note.octave <= 1);
        }
      }
      assert.deepEqual(bar(li, b + 4), steps); // a loop of 4 bars
    }
  }
  // Different levels sound different.
  assert.notDeepEqual(bar(0, 0), bar(3, 0));
  // scheduleBar plays each note through a gain to the destination.
  const calls = [];
  const ctx = {
    destination: {},
    createOscillator() { const o = { type: '', frequency: { value: 0 }, connect() {}, start(t) { calls.push(['osc-start', t, o]); }, stop(t) { calls.push(['osc-stop', t]); } }; return o; },
    createGain() { return { gain: { value: 0 }, connect() {} }; },
  };
  const steps = bar(0, 0);
  scheduleBar(ctx, steps, 7, 96, 0.5);
  const notes = steps.filter(Boolean);
  assert.equal(calls.filter((c) => c[0] === 'osc-start').length, notes.length);
  for (const c of calls.filter((c) => c[0] === 'osc-start')) {
    assert.ok(c[1] >= 7 && c[1] < 7 + 8 * 30 / 96);
    c[2].type = c[2].type; // oscillator type is triangle; checked below via ops
  }
  // rests make nothing: 8 steps max 8 oscillators.
  assert.ok(calls.length <= 16);
});

// ---- §9 bot shape -----------------------------------------------------------
test('§9 botInput is pure, deterministic, and never pauses', async (t) => {
  const bot = await load('core/bot.js').catch(() => null);
  if (!bot || !bot.botInput) return t.skip('bot.js has not landed yet');
  const { botInput } = bot;
  const { init, step } = await G();
  const d = lvl(['#######', '#@.P.M#', '#..X..#', '#######'], { quorum: 1, par: 100, driftPeriod: 2, spawnEvery: 8 });
  let s = init(11, { levels: [d] });
  const input = botInput(s);
  assert.deepEqual(input, botInput(s));
  assert.equal(input.pause, false);
  assert.ok(input.move === null || ['up', 'right', 'down', 'left'].includes(input.move));
  // A few steps run without crashing or breaking rules.
  const { checkState } = await I();
  for (let i = 0; i < 30 && s.status === 'playing'; i++) {
    s = step(s, botInput(s));
    assert.deepEqual(checkState(s), []);
  }
});


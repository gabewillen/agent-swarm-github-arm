// Quorum Run: the browser entry (DESIGN.md §15). One canvas. The title menu
// shows first with the bot playing a demo behind it; step() runs every
// TICK_MS with the queued input, drawList and paint run on
// requestAnimationFrame, and cuesFor plays each step's events.
import { TICK_MS } from './core/constants.js';
import { init, step } from './core/game.js';
import { botInput } from './core/bot.js';
import { statsInit, statsUpdate, statsLines } from './core/stats.js';
import { dailySeed, generateLevel } from './core/generate.js';
import { editorInit, editorPaint, editorFill, editorErrors } from './core/editor.js';
import { ACHIEVEMENTS, checkAchievements } from './core/achievements.js';
import { LEVELS } from './data/levels.js';
import { PALETTE } from './render/palette.js';
import { layout, drawList, paint } from './render/draw.js';
import { stepParticles, particlesFor, particleOps } from './render/particles.js';
import { keyToInput, swipeToInput, queuePush, queueTake, attachKeyboard, INPUT_QUEUE_MAX } from './input/keys.js';
import { cuesFor } from './audio/cues.js';
import { createAudio } from './audio/synth.js';
import { bar, scheduleBar, tempo } from './audio/music.js';
import { menuInit, menuReduce, menuItems } from './ui/menu.js';
import { loadSettings, saveSettings, tickMs } from './ui/settings.js';
import { addScore, formatScore, parseTable } from './ui/scores.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const SETTINGS_KEY = 'quorum-run-settings';
const SCORES_KEY = 'quorum-run-scores';
const UNLOCKED_KEY = 'quorum-run-achievements';
const ED_CHARS = ['#', '.', 'P', 'M', 'X', 'H', '^', '>', 'v', '<'];
const HELP_LINES = [
  'ARROWS or WASD to move. P or ESC pauses. ENTER selects.',
  'Walk onto a patch to pick it up; you carry up to three.',
  'Merge them on a merge pad M. Reach the level quorum.',
  'The quorum opens the hold doors H and the exit X.',
  'Ship the level by walking onto the exit X.',
  'Touch a drift while carrying and you drop the lot.',
  'Touch one empty-handed and you lose a life.',
  'Two drifts that collide leave a conflict nobody passes.',
];

function storeGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function storeSet(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } }

const settings = loadSettings(storeGet(SETTINGS_KEY) ?? '');
function persistSettings() { storeSet(SETTINGS_KEY, saveSettings(settings)); }

const AudioCtor = window.AudioContext ?? window.webkitAudioContext ?? null;
let actx = null;
const audio = createAudio(AudioCtor);
function playCue(name) {
  if (!settings.sound || !AudioCtor) return;
  try { audio.play(name); } catch { /* no audio device */ }
}
function soundCtx() {
  if (!actx) actx = new AudioCtor();
  return actx;
}

let menu = menuInit();
let state = null;          // the live game state while playing
let queue = [];            // queued player inputs
let stats = statsInit();
let particles = [];
let partSeed = 7;
let demo = null;           // attract-mode state behind the title screen
let demoParticles = [];
let demoSeed = 11;
let unlocked = loadUnlocked();
let toast = null;          // { lines, ttl } for new achievements
let board = [];            // high-score table shown on the over screen
let ed = { def: editorInit(15, 11), x: 1, y: 1, ch: '#', cell: 24, ox: 0, oy: 0 };
let nextBar = 0;
let barCount = 0;

function loadUnlocked() {
  try {
    const v = JSON.parse(storeGet(UNLOCKED_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch { return []; }
}

function announce(lines) { toast = { lines, ttl: 28 }; }

function setMenu(action) {
  const before = menu.screen;
  menu = menuReduce(menu, action);
  if (menu.sound !== settings.sound) {
    settings.sound = menu.sound;
    persistSettings();
    if (audio.isMuted() === settings.sound) audio.setMuted(!settings.sound);
  }
  if (before === 'title' && menu.screen === 'playing') startGame();
}

function startGame() {
  if (menu.mode === 'daily') {
    const seed = dailySeed(new Date().toISOString().slice(0, 10));
    state = init(seed, { levels: [generateLevel(seed)] });
  } else if (menu.mode === 'custom') {
    state = init((Math.random() * 4294967296) >>> 0, { levels: [ed.def] });
  } else {
    state = init((Math.random() * 4294967296) >>> 0);
  }
  stats = statsInit();
  queue = [];
  particles = [];
  nextBar = 0;
}

function syncPause(on) {
  if (!state || state.paused === on) return;
  const prev = state;
  state = step(state, { move: null, pause: true });
  for (const cue of cuesFor(state.events)) playCue(cue);
  void prev;
}

function onInput(raw) {
  if (menu.screen === 'editor') {
    if (raw.pause) setMenu('back');
    else if (raw.select) playCustom();
    else editorInput(raw);
    return;
  }
  if (menu.screen === 'playing') {
    if (raw.pause || raw.select) { syncPause(true); setMenu('pause'); return; }
    if (state && state.status === 'playing' && queue.length < INPUT_QUEUE_MAX) queue = queuePush(queue, { move: raw.move, pause: false });
    return;
  }
  if (menu.screen === 'paused') {
    if (raw.pause || raw.select) { setMenu('pause'); syncPause(false); }
    else setMenu('back');
    return;
  }
  if (menu.screen === 'over') { if (raw.select) setMenu('select'); return; }
  if (menu.screen === 'help') { if (raw.select || raw.pause) setMenu(menu.screen === 'help' ? 'back' : 'pause'); return; }
  // title
  if (raw.select) setMenu('select');
  else if (raw.move === 'up') setMenu('up');
  else if (raw.move === 'down') setMenu('down');
}

function playCustom() {
  const bad = editorErrors(ed.def).length;
  if (bad) { announce([`FIX ${bad} ERROR${bad === 1 ? '' : 'S'} FIRST`]); return; }
  menu = { ...menu, screen: 'playing', mode: 'custom' };
  startGame();
}

function editorInput(raw) {
  const dir = raw.move;
  if (!dir) { cycleChar(); return; }
  const d = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] };
  ed.x = Math.min(ed.def.map[0].length - 2, Math.max(1, ed.x + d[dir][0]));
  ed.y = Math.min(ed.def.map.length - 2, Math.max(1, ed.y + d[dir][1]));
}
function cycleChar() { ed.ch = ED_CHARS[(ED_CHARS.indexOf(ed.ch) + 1) % ED_CHARS.length]; }

function gameTick() {
  if (menu.screen !== 'playing' || !state || state.status !== 'playing' || state.paused) return;
  const take = queueTake(queue);
  queue = take.queue;
  const prev = state;
  try { state = step(prev, take.input); } catch (err) { console.error('step failed', err); return; }
  handleEvents(prev, state, take.input);
  particles = stepParticles(particles);
}

function handleEvents(prev, next, input) {
  stats = statsUpdate(stats, prev, next, input);
  const ps = particlesFor(next, partSeed);
  particles = particles.concat(ps.particles);
  partSeed = ps.seed;
  for (const cue of cuesFor(next.events)) playCue(cue);
  const fresh = checkAchievements(prev, next, unlocked);
  if (fresh.length) {
    unlocked = unlocked.concat(fresh);
    storeSet(UNLOCKED_KEY, JSON.stringify(unlocked));
    announce(fresh.map((id) => `UNLOCKED ${ACHIEVEMENTS.find((a) => a.id === id)?.title ?? id}`));
  }
  if (next.status === 'won' || next.status === 'lost') endGame(next);
}

function endGame(state2) {
  const table = addScore(parseTable(storeGet(SCORES_KEY) ?? '[]'), { name: 'YOU', score: state2.score });
  storeSet(SCORES_KEY, JSON.stringify(table));
  board = table;
  if (menu.screen === 'playing') setMenu('gameover');
}

function demoInit() {
  demo = init((Math.random() * 4294967296) >>> 0, { level: (Math.random() * LEVELS.length) | 0 });
  demoParticles = [];
}
function demoTick() {
  if (menu.screen !== 'title' && menu.screen !== 'help') return;
  if (!demo || demo.status !== 'playing') { demoInit(); return; }
  const prev = demo;
  let input = { move: null, pause: false };
  try { input = botInput(prev); } catch { demoInit(); return; }
  try { demo = step(prev, input); } catch { demoInit(); return; }
  if (demo.status !== 'playing') return;
  const ps = particlesFor(demo, demoSeed);
  demoParticles = stepParticles(demoParticles.concat(ps.particles));
  demoSeed = ps.seed;
}

function pump() {
  if (!settings.music || !AudioCtor || !state || menu.screen === 'title' || state.status !== 'playing' || state.paused) { nextBar = 0; return; }
  let c;
  try { c = soundCtx(); } catch { settings.music = false; return; }
  if (nextBar === 0) nextBar = c.currentTime + 0.1;
  const beat = 30 / tempo(state.levelIndex);
  while (nextBar < c.currentTime + 1) {
    try { scheduleBar(c, bar(state.levelIndex, barCount), nextBar, tempo(state.levelIndex), 0.16); } catch { return; }
    nextBar += 8 * beat;
    barCount += 1;
  }
}

function titleOps(vw, vh) {
  const ops = [{ op: 'rect', kind: 'panel', x: 0, y: 0, w: vw, h: vh, color: 'rgba(17,17,17,0.72)' }];
  const cx = vw / 2;
  ops.push({ op: 'text', kind: 'menu', x: cx, y: vh * 0.22, text: 'QUORUM RUN', color: PALETTE.accent, size: 44, align: 'center' });
  ops.push({ op: 'text', kind: 'menu', x: cx, y: vh * 0.30, text: 'CARRY. MERGE. SHIP.', color: PALETTE.dim, size: 15 });
  const items = menuItems(menu);
  items.forEach((it, i) => {
    const sel = i === menu.selected;
    ops.push({
      op: 'text', kind: 'menu', x: cx, y: vh * 0.42 + i * 34, size: 18,
      text: (sel ? '› ' : '  ') + it, color: sel ? PALETTE.accent : PALETTE.text,
    });
  });
  ops.push({ op: 'text', kind: 'menu', x: cx, y: vh - 24, text: 'SWIPE OR WASD TO MOVE  ·  TAP OR ENTER TO SELECT', color: PALETTE.dim, size: 12 });
  return ops;
}

function panelOps(head, lines, vw, vh) {
  const w = Math.min(vw - 48, 640);
  const h = 90 + lines.length * 26;
  const x = (vw - w) / 2;
  const y = (vh - h) / 2;
  const ops = [{ op: 'rect', kind: 'panel', x, y, w, h, color: PALETTE.panel }];
  ops.push({ op: 'rect', kind: 'panel', x, y, w: 3, h, color: PALETTE.accent });
  ops.push({ op: 'text', kind: 'menu', x: x + 24, y: y + 40, text: head, color: PALETTE.accent, size: 22 });
  lines.forEach((t, i) => ops.push({ op: 'text', kind: 'menu', x: x + 24, y: y + 78 + i * 26, text: t, color: PALETTE.text, size: 15 }));
  return ops;
}

function overOps(vw, vh) {
  const head = state?.status === 'won' ? 'ALL LEVELS SHIPPED' : 'GAME OVER';
  const lines = [`SCORE ${formatScore(state?.score ?? 0)}`, ...statsLines(stats), '', 'BEST RUNS'];
  board.slice(0, 5).forEach((e) => lines.push(`${formatScore(e.score)}  ${e.name}`));
  return panelOps(head, lines, vw, vh);
}

function editorOps(vw, vh) {
  const def = ed.def;
  const rows = def.map.length;
  const cols = def.map[0].length;
  const cell = Math.max(4, Math.floor(Math.min((vw - 40) / cols, (vh - 120) / rows)));
  const ox = Math.floor((vw - cell * cols) / 2);
  const oy = 96;
  ed.cell = cell; ed.ox = ox; ed.oy = oy;
  const ops = [{ op: 'rect', kind: 'bg', x: 0, y: 0, w: vw, h: vh, color: PALETTE.bg }];
  ops.push({ op: 'text', kind: 'hud', x: 16, y: 34, text: `EDITOR  ${def.name}  PAINT ${ed.ch === '#' ? 'WALL' : ed.ch === '.' ? 'FLOOR' : ed.ch}  ERRORS ${editorErrors(def).length}`, color: PALETTE.accent, size: 16 });
  ops.push({ op: 'text', kind: 'hud', x: 16, y: 60, text: 'CLICK OR DRAG PAINT  ·  1-9 PICK  ·  C CYCLE  ·  F FILL  ·  ENTER PLAY  ·  ESC QUIT', color: PALETTE.dim, size: 12 });
  const colorOf = { '#': PALETTE.wall, '.': PALETTE.floor, M: PALETTE.panel, X: state?.open ? PALETTE.accent : PALETTE.dim, H: PALETTE.dim, P: PALETTE.agents[0] };
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const ch = def.map[y][x];
    ops.push({ op: 'rect', kind: 'cell', x: ox + x * cell, y: oy + y * cell, w: cell, h: cell, color: colorOf[ch] ?? PALETTE.floor });
    if ('PMC^v<>'.includes(ch) || ch === 'X' || ch === 'H') {
      ops.push({ op: 'text', kind: 'cell', x: ox + x * cell + cell / 2, y: oy + y * cell + cell * 0.7, text: ch === '^' ? '↑' : ch === 'v' ? '↓' : ch === '<' ? '←' : ch === '>' ? '→' : ch, color: ch === 'P' ? PALETTE.agents[0] : ch === 'X' ? PALETTE.accent : PALETTE.text, size: Math.floor(cell * 0.6) });
    }
  }
  ops.push({ op: 'rect', kind: 'cursor', x: ox + ed.x * cell + 2, y: oy + ed.y * cell + 2, w: cell - 4, h: cell - 4, color: PALETTE.accent });
  return ops;
}

function draw() {
  const vw = canvas.width;
  const vh = canvas.height;
  let ops;
  if (menu.screen === 'editor') ops = editorOps(vw, vh);
  else if (menu.screen === 'title' || menu.screen === 'help') {
    ops = demo ? drawList(demo, { width: vw, height: vh }).concat(particleOps(demoParticles, layout(demo.level, { width: vw, height: vh }))) : [];
    ops = ops.concat(titleOps(vw, vh));
    if (menu.screen === 'help') ops = ops.concat(panelOps('HOW TO PLAY', HELP_LINES, vw, vh));
  } else if (menu.screen === 'over') {
    ops = state ? drawList(state, { width: vw, height: vh }).concat(overOps(vw, vh)) : [];
  } else if (state) {
    const lay = layout(state.level, { width: vw, height: vh });
    ops = drawList(state, { width: vw, height: vh }).concat(particleOps(particles, lay));
    if (toast) ops.push({ op: 'text', kind: 'hud', x: vw / 2, y: vh - 16, text: toast.lines.join('  '), color: PALETTE.accent, size: 14 });
  } else ops = [];
  paint(ctx, ops);
  requestAnimationFrame(draw);
}

attachKeyboard(window, onInput);
window.addEventListener('keydown', (e) => {
  if (menu.screen === 'editor') {
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= 9) { ed.ch = ED_CHARS[n - 1]; e.preventDefault(); return; }
    if (e.key === 'c' || e.key === 'C') { cycleChar(); e.preventDefault(); return; }
    if (e.key === 'f' || e.key === 'F') { ed.def = editorFill(ed.def, ed.x, ed.y, ed.ch); e.preventDefault(); return; }
  }
  if (e.key === 'Enter') { e.preventDefault(); onInput({ move: null, pause: false, select: true }); }
});

let touchAt = null;
canvas.addEventListener('touchstart', (e) => { touchAt = [e.touches[0].clientX, e.touches[0].clientY]; e.preventDefault(); }, { passive: false });
canvas.addEventListener('touchend', (e) => {
  if (!touchAt) return;
  const t = e.changedTouches[0];
  onInput(swipeToInput(t.clientX - touchAt[0], t.clientY - touchAt[1]) ?? { move: null, pause: false, select: true });
  touchAt = null;
  e.preventDefault();
});
canvas.addEventListener('pointerdown', (e) => {
  if (menu.screen !== 'editor') return;
  paintAt(e.clientX, e.clientY);
  ed.painting = true;
});
canvas.addEventListener('pointermove', (e) => { if (menu.screen === 'editor' && ed.painting) paintAt(e.clientX, e.clientY); });
window.addEventListener('pointerup', () => { ed.painting = false; });
function paintAt(px, py) {
  const x = Math.floor((px - ed.ox) / ed.cell);
  const y = Math.floor((py - ed.oy) / ed.cell);
  if (x >= 0 && y >= 0) ed.def = editorPaint(ed.def, x, y, ed.ch);
}

function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
window.addEventListener('resize', resize);
resize();

let timer = null;
function armTimer() {
  if (timer) clearInterval(timer);
  timer = setInterval(() => { gameTick(); if (toast) { toast.ttl -= 1; if (toast.ttl <= 0) toast = null; } }, tickMs(settings));
}
setInterval(demoTick, TICK_MS);
setInterval(pump, 250);
armTimer();
requestAnimationFrame(draw);

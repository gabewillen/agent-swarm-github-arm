// The browser entry point (DESIGN.md §15): this module alone touches the
// DOM, `window`, and an `AudioContext`. It wires the core, renderer, input,
// audio, and UI modules together, runs `step` every TICK_MS with the queued
// input, draws with `drawList` and `paint` on requestAnimationFrame, plays
// `cuesFor` of each step's events, and shows the title menu first, with the
// bot playing a demo behind it.
import { TICK_MS } from './core/constants.js';
import { init, step } from './core/game.js';
import { LEVELS } from './data/levels.js';
import { botInput } from './core/bot.js';
import { checkAchievements, ACHIEVEMENTS } from './core/achievements.js';
import { statsInit, statsUpdate, statsLines } from './core/stats.js';
import { dailySeed, generateLevel, hashSeed } from './core/generate.js';
import { editorInit, editorPaint, editorErrors, editorExport, editorImport } from './core/editor.js';
import { PALETTE } from './render/palette.js';
import { HUD_HEIGHT, layout, drawList, paint } from './render/draw.js';
import { particlesFor, particleOps, stepParticles } from './render/particles.js';
import { keyToInput, swipeToInput, queuePush, queueTake, attachKeyboard } from './input/keys.js';
import { cuesFor } from './audio/cues.js';
import { createAudio } from './audio/synth.js';
import { tempo, bar, scheduleBar } from './audio/music.js';
import { menuInit, menuReduce, menuItems, hudText } from './ui/menu.js';
import { addScore, formatScore, parseTable } from './ui/scores.js';
import { loadSettings, saveSettings, tickMs } from './ui/settings.js';

// ---------------------------------------------------------------------------
// DOM plumbing
// ---------------------------------------------------------------------------

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
// Match the font `paint` uses, so measuring for centering is exact.
const FONT = 'monospace';
const DIM = 0.62;

const store = {
  get(key) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* private mode: things just do not persist */
    }
  },
};

const SETTINGS_KEY = 'quorum-run:settings';
const SCORES_KEY = 'quorum-run:scores';
const EDITOR_KEY = 'quorum-run:editor';

function resize() {
  canvas.width = Math.max(320, window.innerWidth);
  canvas.height = Math.max(240, window.innerHeight);
}
window.addEventListener('resize', resize);
resize();

function getView() {
  return { width: canvas.width, height: canvas.height };
}

function eventPos(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((e.clientX - rect.left) * canvas.width) / rect.width,
    y: ((e.clientY - rect.top) * canvas.height) / rect.height,
  };
}

// ---------------------------------------------------------------------------
// Sound (§13) and music (§24)
// ---------------------------------------------------------------------------

const AudioCtor = window.AudioContext || window.webkitAudioContext || null;
const live = []; // every AudioContext constructed, to resume on the next gesture
let audioCtxCtor = AudioCtor;
if (AudioCtor) {
  // Track constructed contexts so a later gesture can resume them (the first
  // `play` may run on a timer, outside any gesture).
  try {
    class Tracked extends AudioCtor {
      constructor(...args) {
        super(...args);
        live.push(this);
      }
    }
    audioCtxCtor = Tracked;
  } catch {
    audioCtxCtor = AudioCtor;
  }
}
const noAudio = { play() {}, setMuted() {}, isMuted() { return true; } };
const audio = audioCtxCtor ? createAudio(audioCtxCtor) : noAudio;

let settings = loadSettings(store.get(SETTINGS_KEY) || '');
audio.setMuted(!settings.sound);

let musicCtx = null;
let musicAt = 0;
let barNo = 0;

function gesture() {
  for (const c of live) {
    if (c.state === 'suspended' && c.resume) c.resume().catch(() => {});
  }
  if (!musicCtx && AudioCtor) {
    try {
      musicCtx = new(audioCtxCtor)();
      musicAt = musicCtx.currentTime + 0.2;
    } catch {
      musicCtx = null;
    }
  }
}

function pumpMusic() {
  if (!musicCtx || musicCtx.state === 'closed') return;
  if (musicCtx.state === 'suspended' && musicCtx.resume) {
    musicCtx.resume().catch(() => {});
    return; // wait until it really runs before scheduling
  }
  const playing = menu.screen === 'playing' || menu.screen === 'paused';
  const levelIndex = state ? state.levelIndex : 0;
  const bpm = tempo(levelIndex);
  const barSec = 240 / bpm; // a bar is 8 steps of 30/bpm seconds
  const gain = settings.music && settings.sound && playing ? settings.volume * 0.16 : 0;
  if (gain <= 0) {
    musicAt = musicCtx.currentTime + 0.1;
    return;
  }
  if (musicAt < musicCtx.currentTime) musicAt = musicCtx.currentTime + 0.05;
  while (musicAt < musicCtx.currentTime + 0.3) {
    scheduleBar(musicCtx, bar(levelIndex, barNo), musicAt, bpm, gain);
    musicAt += barSec;
    barNo += 1;
  }
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let menu = { ...menuInit(), sound: settings.sound };
let state = null; // the game state while playing/paused/over
let stats = null;
let unlocked = []; // ids of the achievements earned this run
let queue = []; // queued inputs (§12)
let pool = []; // particles (§23)
let particleSeed = 0x9e3779b9;
let toasts = []; // { text, until }
let board = parseTable(store.get(SCORES_KEY) || '[]');
let scored = false;
let acc = 0;
let lastNow = 0;
let ms = tickMs(settings) || TICK_MS; // the step cadence: 160, TICK_MS, or 90
let hits = []; // rows of the current overlay the pointer can hit: { y0, y1, run }
let lastPoint = { x: 0, y: 0 };

// The attract-mode demo behind the title screen (§15).
const DEMO_SEED = 0xc0ffee;
let attract = null;
let demoNo = 0;

// The level editor (§20 in main: definition, cursor, brush).
const BRUSHES = ['#', '.', 'P', 'M', 'X', 'H', '^', '>', 'v', '<'];
const BRUSH_NAMES = ['WALL', 'FLOOR', 'SPAWN', 'MERGE', 'EXIT', 'HOLD', 'DRIFT up', 'DRIFT right', 'DRIFT down', 'DRIFT left'];
const BRUSH_KEYS = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 7: 6, 8: 7, 9: 8, 0: 9 };
const BRUSH_COLOR = {
  '#': PALETTE.wall,
  '.': PALETTE.floor,
  P: PALETTE.agents[0],
  M: PALETTE.accent,
  X: PALETTE.dim,
  H: PALETTE.text,
  '^': PALETTE.danger,
  '>': PALETTE.danger,
  v: PALETTE.danger,
  '<': PALETTE.danger,
};
let ed = null; // { def, cx, cy, brush, painting }

function editorLoad() {
  const text = store.get(EDITOR_KEY);
  let def = null;
  if (text) {
    try {
      def = editorImport(text);
    } catch {
      def = null;
    }
  }
  ed = { def: def || editorInit(15, 11), cx: 7, cy: 5, brush: '#', painting: false };
}

function editorSave() {
  if (ed) store.set(EDITOR_KEY, editorExport(ed.def));
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function toastnow(text) {
  if (toasts.length > 5) toasts = toasts.slice(-5);
  toasts.push({ text, until: performance.now() + 2800 });
}

function achTitle(id) {
  const a = ACHIEVEMENTS.find((x) => x.id === id);
  return a ? a.title : id;
}

function textWidth(text, size) {
  ctx.font = size + 'px ' + FONT;
  return ctx.measureText(text).width;
}

function txt(out, text, x, y, size, color, kind) {
  out.push({ op: 'text', kind: kind || 'menu', x: Math.round(x), y: Math.round(y), text, color, size });
}

function ctxt(out, text, y, size, color, kind, view) {
  txt(out, text, (view.width - textWidth(text, size)) / 2, y, size, color, kind);
}

// ---------------------------------------------------------------------------
// Game flow
// ---------------------------------------------------------------------------

function startGame(mode) {
  const today = new Date().toISOString().slice(0, 10);
  let seed;
  let levels;
  if (mode === 'daily') {
    seed = dailySeed(today) || 0;
    levels = [generateLevel(seed)];
  } else if (mode === 'custom') {
    const errors = editorErrors(ed.def);
    if (errors.length > 0) {
      toastnow('LEVEL PROBLEM: ' + errors.join(', '));
      return false;
    }
    seed = hashSeed('custom ' + ed.def.name + ' ' + editorExport(ed.def));
    levels = [ed.def];
  } else {
    campaignNonce = (campaignNonce + 1) >>> 0;
    seed = hashSeed('campaign ' + today + ':' + Date.now() + ':' + campaignNonce);
    levels = LEVELS;
  }
  state = init(seed, { levels });
  stats = statsInit();
  unlocked = [];
  toasts = [];
  pool = [];
  queue = [];
  scored = false;
  acc = 0;
  return true;
}
let campaignNonce = 0;

function toTitle() {
  if (menu.screen === 'paused') menu = menuReduce(menu, 'back');
  else menu = menuReduce(menu, 'select');
  state = null;
}

function chooseTitle() {
  const item = menu.selected;
  if (item < 0 || item > 4) return;
  if (item === 4) {
    // Sound: on/off flips the menu item and the persisted settings.
    menu = menuReduce(menu, 'select');
    settings = { ...settings, sound: menu.sound };
    audio.setMuted(!settings.sound);
    store.set(SETTINGS_KEY, saveSettings(settings));
    ms = tickMs(settings) || TICK_MS;
    if (settings.sound) audio.play('tick');
    return;
  }
  menu = menuReduce(menu, 'select');
  if (menu.screen === 'editor') {
    editorLoad();
  } else if (menu.screen === 'playing') {
    if (!startGame(menu.mode)) menu = { ...menu, screen: 'title' };
  }
  if (settings.sound) audio.play('tick');
}

// One step of the real game, with everything that follows it (§15).
function stepGame(input) {
  const prev = state;
  let next;
  try {
    next = step(state, input);
  } catch (err) {
    toastnow('STEP FAILED: ' + (err && err.message ? err.message : String(err)));
    return;
  }
  state = next;
  // Menu sync (§14): step events drive the playing/paused/over screens.
  for (const ev of next.events) {
    if (ev === 'pause') {
      menu = menu.screen === 'playing' ? menuReduce(menu, 'pause') : { ...menu, screen: 'paused' };
    } else if (ev === 'resume') {
      menu = menu.screen === 'paused' ? menuReduce(menu, 'select') : { ...menu, screen: 'playing' };
      queue = [];
    }
  }
  // Particles for this step's events (§23).
  const pf = particlesFor(next, particleSeed);
  particleSeed = pf.seed >>> 0;
  pool = stepParticles(pool.concat(pf.particles));
  if (next.events.includes('level')) pool = [];
  // Sound for each event (§13, §15).
  for (const cue of cuesFor(next.events)) audio.play(cue);
  // Statistics (§22) and achievements (§21).
  stats = statsUpdate(stats, prev, next, input);
  for (const id of checkAchievements(prev, next, unlocked)) {
    if (!unlocked.includes(id)) {
      unlocked.push(id);
      toastnow('ACHIEVEMENT: ' + achTitle(id));
    }
  }
  // Game over: record the run once and go to the over screen.
  if (next.status !== 'playing' && menu.screen === 'playing') {
    if (!scored && next.score > 0) {
      scored = true;
      board = addScore(board, { name: 'COURIER', score: next.score });
      store.set(SCORES_KEY, JSON.stringify(board));
    }
    menu = menuReduce(menu, 'gameover');
  }
}

// One tick of the attract demo behind the title screen.
function demoStep() {
  const prev = attract;
  try {
    attract = step(attract, botInput(attract));
  } catch {
    attract = init((DEMO_SEED + ++demoNo * 7) >>> 0, { levels: LEVELS });
    pool = [];
    return;
  }
  const pf = particlesFor(attract, particleSeed);
  particleSeed = pf.seed >>> 0;
  pool = stepParticles(pool.concat(pf.particles));
  if (attract.events.includes('level') || attract.status !== 'playing') pool = [];
  if (attract.status !== 'playing' || prev.tick > 20000) {
    demoNo += 1;
    attract = init((DEMO_SEED + demoNo * 7) >>> 0, { levels: LEVELS });
  }
}

// ---------------------------------------------------------------------------
// The tick loop: one step every TICK_MS of the chosen speed (§15, §17)
// ---------------------------------------------------------------------------

function tick() {
  switch (menu.screen) {
    case 'title':
    case 'help': {
      queue = [];
      if (!attract) {
        attract = init((DEMO_SEED + demoNo * 7) >>> 0, { levels: LEVELS });
        pool = [];
      }
      demoStep();
      break;
    }
    case 'playing': {
      if (!state) {
        if (!startGame(menu.mode)) menu = { ...menu, screen: 'title' };
        break;
      }
      const t = queueTake(queue);
      queue = t.queue;
      stepGame(t.input);
      break;
    }
    case 'paused': {
      if (!state) {
        menu = { ...menu, screen: 'title' };
        break;
      }
      const t = queueTake(queue);
      queue = [];
      const pauseInput = [t.input].concat(t.queue).find((i) => i && i.pause);
      if (pauseInput) stepGame(pauseInput);
      break;
    }
    case 'editor':
    case 'over':
      queue = [];
      break;
    default:
      queue = [];
      break;
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  try {
    if (!lastNow) lastNow = now;
    acc += now - lastNow;
    lastNow = now;
    if (acc > ms * 6) acc = ms * 6; // no runaway catch-up after a stall
    let n = 0;
    while (acc >= ms && n < 6) {
      acc -= ms;
      n += 1;
      tick();
    }
    toasts = toasts.filter((t) => t.until > performance.now());
    pumpMusic();
    render();
  } catch (err) {
    toastnow('ERROR: ' + (err && err.message ? err.message : String(err)));
    menu = { ...menu, screen: 'title' };
    state = null;
  }
}

// ---------------------------------------------------------------------------
// Overlays
// ---------------------------------------------------------------------------

function addRow(y0, y1, run) {
  hits.push({ y0, y1, run });
}

function titleOverlay(view) {
  hits = [];
  const ops = [];
  const w = view.width;
  let y = HUD_HEIGHT + 46;
  ctxt(ops, 'QUORUM RUN', y, Math.min(54, Math.max(28, Math.floor(w / 12))), PALETTE.accent, 'title', view);
  y += 36;
  ctxt(ops, 'COURIER AGENT ON A GRID', y, 15, PALETTE.dim, 'title', view);
  y += 56;
  const top = y;
  const items = menuItems(menu);
  for (let i = 0; i < items.length; i++) {
    const chosen = i === menu.selected;
    const size = chosen ? 26 : 21;
    const color = chosen ? PALETTE.accent : PALETTE.text;
    txt(ops, chosen ? '>' : ' ', w / 2 - textWidth(items[i], size) / 2 - 36, top + i * 42 + size - 5, 26, PALETTE.accent, 'title');
    txt(ops, items[i], w / 2 - textWidth(items[i], size) / 2, top + i * 42 + size - 5, size, color, 'title');
    addRow(top + i * 42 - 8, top + i * 42 + 36, ((idx) => () => {
      menu = { ...menu, selected: idx };
      chooseTitle();
    })(i));
  }
  y = top + items.length * 42 + 44;
  if (board.length > 0) ctxt(ops, 'BEST ' + formatScore(board[0].score), y, 16, PALETTE.text, 'title', view);
  y += 32;
  ctxt(ops, 'ARROWS OR WASD MOVE   P PAUSE   ENTER SELECT   M SOUND', y, 13, PALETTE.dim, 'title', view);
  y += 22;
  ctxt(ops, 'TOUCH: SWIPE TO MOVE, TAP TO SELECT', y, 13, PALETTE.dim, 'title', view);
  return ops;
}

function helpOverlay(view) {
  hits = [];
  const ops = [];
  let y = HUD_HEIGHT + 36;
  ctxt(ops, 'HOW TO PLAY', y, 30, PALETTE.accent, 'help', view);
  const lines = [
    'YOU ARE A COURIER AGENT. PATCHES APPEAR AT SPAWN POINTS.',
    '',
    'WALK OVER A PATCH TO PICK IT UP, UP TO THREE AT A TIME.',
    '',
    'CARRY THEM TO A MERGE PAD: THE MORE AT ONCE, THE MORE SCORE.',
    "MERGE THE LEVEL'S QUORUM OF PATCHES AND THE HOLD DOORS",
    'AND THE EXIT OPEN.',
    '',
    'REACH THE OPEN EXIT TO SHIP THE LEVEL.',
    '',
    'DRIFTS PATROL THE GRID. TOUCH ONE CARRYING PATCHES AND',
    'YOU DROP THEM ALL. TOUCH ONE EMPTY-HANDED AND YOU LOSE A',
    'LIFE. WHERE TWO DRIFTS COLLIDE, A CONFLICT BLOCKS THE CELL',
    'FOR A WHILE.',
    '',
    'ARROWS OR WASD MOVE, P OR ESC PAUSE, ENTER SELECTS,',
    'M TOGGLES SOUND. SWIPE MOVES, TAP SELECTS, ON A TOUCH.',
  ];
  for (const line of lines) {
    y += 25;
    ctxt(ops, line, y, 16, line ? PALETTE.text : PALETTE.dim, 'help', view);
  }
  y += 42;
  ctxt(ops, 'ESC OR ENTER: BACK', y, 18, PALETTE.accent, 'help', view);
  addRow(y - 28, y + 14, () => {
    menu = menuReduce(menu, 'back');
  });
  return ops;
}

function overOverlay(view) {
  hits = [];
  const ops = [];
  const won = state && state.status === 'won';
  let y = HUD_HEIGHT + 44;
  ctxt(ops, won ? 'ALL MERGED - YOU WIN' : 'GAME OVER', y, 32, won ? PALETTE.accent : PALETTE.danger, 'over', view);
  y += 44;
  if (state) {
    for (const line of hudText(state)) {
      y += 24;
      ctxt(ops, line, y, 17, PALETTE.text, 'over', view);
    }
    y += 12;
    if (stats) {
      for (const line of statsLines(stats)) {
        y += 22;
        ctxt(ops, line, y, 14, PALETTE.dim, 'over', view);
      }
    }
  }
  y += 28;
  if (board.length > 0) {
    y += 8;
    ctxt(ops, 'HIGH SCORES', y, 14, PALETTE.dim, 'over', view);
    for (const e of board.slice(0, 5)) {
      y += 20;
      ctxt(ops, e.name + '  ' + formatScore(e.score), y, 16, PALETTE.text, 'over', view);
    }
    y += 22;
  }
  if (unlocked.length > 0) {
    const titles = ACHIEVEMENTS.filter((a) => unlocked.includes(a.id)).map((a) => a.title);
    ctxt(ops, 'ACHIEVEMENTS: ' + titles.join(' - '), y, 13, PALETTE.accent, 'over', view);
    y += 28;
  }
  ctxt(ops, 'ENTER: BACK TO TITLE', y, 18, PALETTE.accent, 'over', view);
  addRow(y - 26, y + 14, () => {
    toTitle();
  });
  return ops;
}

// The editor screen shows its own hint bar under the map.
function editorOverlay(view) {
  hits = [];
  const ops = [];
  const errors = editorErrors(ed.def);
  let y = view.height - 104;
  ctxt(ops, 'BRUSH [' + ed.brush + '] ' + BRUSH_NAMES[BRUSHES.indexOf(ed.brush)], y, 16, PALETTE.accent, 'editor', view);
  y += 24;
  ctxt(ops, '1-0 BRUSH   SPACE OR CLICK PAINT   ARROWS MOVE   ENTER PLAY   ESC MENU   N NEW', y, 13, PALETTE.dim, 'editor', view);
  y += 24;
  if (errors.length > 0) {
    ctxt(ops, 'PROBLEMS: ' + errors.join('  '), y, 15, PALETTE.danger, 'editor', view);
  } else {
    ctxt(ops, 'LEVEL READY - ENTER TO PLAY IT', y, 15, PALETTE.text, 'editor', view);
  }
  txt(ops, 'LEVEL EDITOR  ' + ed.def.map[0].length + 'x' + ed.def.map.length, 14, HUD_HEIGHT + 24, 15, PALETTE.dim, 'editor');
  return ops;
}

// ---------------------------------------------------------------------------
// Rendering (§11)
// ---------------------------------------------------------------------------

function toastOps(view) {
  const out = [];
  const shown = toasts.slice(-4);
  shown.forEach((t, i) => {
    const w = textWidth(t.text, 14);
    txt(out, t.text, view.width - w - 16, HUD_HEIGHT + 22 + i * 22, 14, PALETTE.accent, 'toast');
  });
  return out;
}

function dim(view) {
  ctx.globalAlpha = DIM;
  ctx.fillStyle = PALETTE.bg;
  ctx.fillRect(0, 0, view.width, view.height);
  ctx.globalAlpha = 1;
}

function render() {
  const view = getView();
  ctx.fillStyle = PALETTE.bg;
  ctx.fillRect(0, 0, view.width, view.height);
  let base = [{ op: 'rect', kind: 'bg', x: 0, y: 0, w: view.width, h: view.height, color: PALETTE.bg }];
  let overlay = null;
  let needDim = false;
  if (menu.screen === 'editor' && ed) {
    base = editorBase(view);
    overlay = editorOverlay(view);
  } else {
    const s = menu.screen === 'playing' || menu.screen === 'paused' || menu.screen === 'over' ? state : attract;
    if (s) {
      const la = layout(s.level, view);
      base = drawList(s, view).concat(particleOps(pool, la));
    }
    if (menu.screen === 'title') {
      needDim = true;
      overlay = titleOverlay(view);
    } else if (menu.screen === 'help') {
      needDim = true;
      overlay = helpOverlay(view);
    } else if (menu.screen === 'over') {
      needDim = true;
      overlay = overOverlay(view);
    }
  }
  paint(ctx, base.concat(toastOps(view)));
  if (needDim) dim(view);
  if (overlay) paint(ctx, overlay);
}

// The editor screen draws its own grid: no game state exists there.
function editorBase(view) {
  const def = ed.def;
  const w = def.map[0].length;
  const h = def.map.length;
  const la = layout({ width: w, height: h }, view);
  const cell = la.cell;
  const ops = [{ op: 'rect', kind: 'bg', x: 0, y: 0, w: view.width, h: view.height, color: PALETTE.bg }];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = def.map[y][x];
      const nx = la.ox + x * cell;
      const ny = la.oy + y * cell;
      if (ch !== '.') {
        ops.push({ op: 'rect', kind: 'cell', x: nx, y: ny, w: cell, h: cell, color: BRUSH_COLOR[ch] || PALETTE.floor });
      }
      if (ch !== '#' && ch !== '.') {
        const size = Math.max(8, Math.floor(cell * 0.55));
        ops.push({
          op: 'text', kind: 'cell', x: nx + Math.round(cell * 0.28), y: ny + Math.round(cell * 0.72),
          text: ch, color: PALETTE.text, size,
        });
      }
      if (x === ed.cx && y === ed.cy) {
        const c = Math.max(3, Math.round(cell / 4));
        ops.push({ op: 'rect', kind: 'cursor', x: nx + Math.floor((cell - c) / 2), y: ny + Math.floor((cell - c) / 2), w: c, h: c, color: PALETTE.accent });
      }
    }
  }
  return ops;
}

// ---------------------------------------------------------------------------
// Keyboard (§12, §14, §16)
// ---------------------------------------------------------------------------

const detachKeys = attachKeyboard(window, (input) => {
  queue = queuePush(queue, input);
});

window.addEventListener('keydown', (e) => {
  gesture();
  const k = e.key;
  if (k === 'm' || k === 'M') {
    settings = { ...settings, sound: !settings.sound };
    audio.setMuted(!settings.sound);
    menu = { ...menu, sound: settings.sound };
    store.set(SETTINGS_KEY, saveSettings(settings));
    ms = tickMs(settings) || TICK_MS;
    if (settings.sound) audio.play('tick');
    e.preventDefault();
    return;
  }
  const up = k === 'ArrowUp' || k === 'w' || k === 'W';
  const down = k === 'ArrowDown' || k === 's' || k === 'S';
  switch (menu.screen) {
    case 'title':
      if (up) {
        menu = menuReduce(menu, 'up');
        e.preventDefault();
      } else if (down) {
        menu = menuReduce(menu, 'down');
        e.preventDefault();
      } else if (k === 'Enter' || k === ' ') {
        e.preventDefault();
        chooseTitle();
      }
      break;
    case 'help':
      if (k === 'Escape' || k === 'Enter' || k === ' ') {
        menu = menuReduce(menu, 'back');
        e.preventDefault();
      }
      break;
    case 'editor':
      editorKey(e);
      break;
    case 'paused':
      // P and Escape already arrive here as pause inputs via the keys module;
      // Enter and tap also resume. Escape abandons the run instead.
      if (k === 'Enter' || k === ' ') {
        queue = queuePush(queue, { move: null, pause: true });
        e.preventDefault();
      } else if (k === 'Escape') {
        menu = menuReduce(menu, 'back');
        queue = [];
        state = null;
        e.preventDefault();
      }
      break;
    case 'over':
      if (k === 'Enter' || k === ' ') {
        toTitle();
        e.preventDefault();
      }
      break;
    default:
      break;
  }
});

function editorKey(e) {
  if (e.repeat) return; // no repeat for painting
  const k = e.key;
  let used = true;
  if (BRUSH_KEYS[k] !== undefined) {
    ed.brush = BRUSHES[BRUSH_KEYS[k]];
  } else if (k === 'ArrowUp') {
    if (ed.cy > 0) ed.cy -= 1;
  } else if (k === 'ArrowDown') {
    if (ed.cy < ed.def.map.length - 1) ed.cy += 1;
  } else if (k === 'ArrowLeft') {
    if (ed.cx > 0) ed.cx -= 1;
  } else if (k === 'ArrowRight') {
    if (ed.cx < ed.def.map[0].length - 1) ed.cx += 1;
  } else if (k === ' ') {
    ed.def = editorPaint(ed.def, ed.cx, ed.cy, ed.brush);
    editorSave();
  } else if (k === 'Enter') {
    menu = menuReduce(menu, 'select'); // play the edited level (§14)
    if (!startGame('custom')) menu = { ...menu, screen: 'editor' };
  } else if (k === 'Escape') {
    menu = menuReduce(menu, 'back');
  } else if (k === 'n' || k === 'N') {
    ed = { ...ed, def: editorInit(15, 11) };
    editorSave();
  } else {
    used = false;
  }
  if (used) e.preventDefault();
}

// ---------------------------------------------------------------------------
// Pointer and touch (§16)
// ---------------------------------------------------------------------------

function tapSelect() {
  gesture();
  switch (menu.screen) {
    case 'title': {
      const hit = hits.find((h) => lastPoint.y >= h.y0 && lastPoint.y < h.y1);
      if (hit) hit.run();
      break;
    }
    case 'help':
      menu = menuReduce(menu, 'back');
      break;
    case 'over':
      toTitle();
      break;
    case 'paused':
    case 'playing':
      queue = queuePush(queue, { move: null, pause: true });
      break;
    default:
      break;
  }
}

canvas.addEventListener('mousedown', (e) => {
  gesture();
  lastPoint = eventPos(e);
  if (menu.screen === 'editor' && ed) {
    editorPointer(e, true);
    ed.painting = true;
  } else {
    tapSelect();
  }
  e.preventDefault();
});

canvas.addEventListener('mousemove', (e) => {
  lastPoint = eventPos(e);
  if (menu.screen === 'editor' && ed && ed.painting) {
    editorPointer(e, true);
    e.preventDefault();
  }
});

window.addEventListener('mouseup', () => {
  if (ed) ed.painting = false;
});

function editorPointer(e, doPaint) {
  const p = eventPos(e);
  const def = ed.def;
  const w = def.map[0].length;
  const h = def.map.length;
  const la = layout({ width: w, height: h }, getView());
  const cx = Math.floor((p.x - la.ox) / la.cell);
  const cy = Math.floor((p.y - la.oy) / la.cell);
  if (cx >= 0 && cy >= 0 && cx < w && cy < h) {
    ed.cx = cx;
    ed.cy = cy;
    if (doPaint) {
      ed.def = editorPaint(def, cx, cy, ed.brush);
      editorSave();
    }
  }
}

let touchOrigin = null;
let touchMoved = false;

canvas.addEventListener('touchstart', (e) => {
  gesture();
  e.preventDefault();
  const t = e.changedTouches[0];
  touchOrigin = { x: t.clientX, y: t.clientY };
  touchMoved = false;
}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
  e.preventDefault();
  if (!touchOrigin) return;
  const t = e.changedTouches[0];
  const dx = t.clientX - touchOrigin.x;
  const dy = t.clientY - touchOrigin.y;
  const input = swipeToInput(dx, dy);
  if (input) {
    touchOrigin = { x: t.clientX, y: t.clientY };
    touchMoved = true;
    queue = queuePush(queue, input);
  }
}, { passive: false });

canvas.addEventListener('touchend', (e) => {
  e.preventDefault();
  touchOrigin = null;
  if (!touchMoved) tapSelect();
}, { passive: false });

// Kick off the loop: frame re-arms itself on every call from here on.
requestAnimationFrame(frame);

// Quorum Run: the page (DESIGN.md §15).
// The only module in src/ that touches the DOM, window, or AudioContext.
// It wires the core, renderer, input, audio, and UI modules together:
// a title menu first, then a game stepped every tick with the queued
// input and drawn with drawList and paint on requestAnimationFrame.

import { TICK_MS } from './core/constants.js';
import { init, step } from './core/game.js';
import { botInput } from './core/bot.js';
import { dailySeed, generateLevel } from './core/generate.js';
import { editorInit, editorPaint, editorFill, editorErrors, editorExport } from './core/editor.js';
import { ACHIEVEMENTS, checkAchievements } from './core/achievements.js';
import { statsInit, statsUpdate, statsLines } from './core/stats.js';
import { LEVELS } from './data/levels.js';
import { PALETTE } from './render/palette.js';
import { layout, drawList, paint } from './render/draw.js';
import { particleOps, particlesFor, stepParticles } from './render/particles.js';
import { attachKeyboard, keyToInput, queuePush, queueTake, swipeToInput } from './input/keys.js';
import { cuesFor } from './audio/cues.js';
import { createAudio } from './audio/synth.js';
import { bar, tempo, scheduleBar } from './audio/music.js';
import { menuInit, menuItems, menuReduce } from './ui/menu.js';
import { addScore, formatScore, parseTable } from './ui/scores.js';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, tickMs } from './ui/settings.js';

// --- the page's own plumbing -------------------------------------------------

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const AudioCtor = typeof window.AudioContext === 'function' ? window.AudioContext
  : typeof window.webkitAudioContext === 'function' ? window.webkitAudioContext
  : null;
const audio = createAudio(AudioCtor);

const SETTINGS_KEY = 'quorum-run.settings';
const SCORES_KEY = 'quorum-run.scores';

function storeGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function storeSet(key, text) {
  try { localStorage.setItem(key, text); } catch { /* private mode etc. */ }
}

let settings;
{
  const text = storeGet(SETTINGS_KEY);
  settings = loadSettings(text === null ? '' : text);
}
let ms = TICK_MS;               // §15's baseline; tickMs(settings) sets the real one
ms = tickMs(settings);
audio.setMuted(!settings.sound);

function persistSettings() {
  settings = loadSettings(saveSettings(settings));
  storeSet(SETTINGS_KEY, saveSettings(settings));
}

let hiscores = parseTable(storeGet(SCORES_KEY) ?? '[]');

// --- the game ----------------------------------------------------------------

let menu = menuInit();
let state = null;               // the player's game (null outside play)
let demo = null;                // the attract-mode game behind the title
let queue = [];                 // queued player inputs (§12)
let particles = [];
let renderSeed = 0x51fa11;
let stats = statsInit();
let unlocked = [];              // achievement ids earned this run
let overHandled = false;
let hiscoresShown = hiscores;
let editor = null;              // editor screen's brush, cursor, definition

function freshSeed() {
  return (Date.now() ^ Math.floor(Math.random() * 4294967296)) >>> 0;
}

function startGame(defs, seed, levelIndex, playMode) {
  state = init(seed >>> 0, { levels: defs, level: levelIndex });
  stats = statsInit();
  unlocked = [];
  queue = [];
  particles = [];
  renderSeed = (seed >>> 3) ^ 0x9e3779b9;
  overHandled = false;
  return playMode;
}

function today() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
    + '-' + String(d.getDate()).padStart(2, '0');
}

function startDaily() {
  const seed = dailySeed(today()) ?? dailySeed('1970-01-01');
  try {
    startGame([generateLevel(seed)], seed, 0, 'daily');
  } catch {
    startGame(LEVELS, seed, 0, 'daily');
  }
}

function tryStep(s, input) {
  try {
    return step(s, input);
  } catch (err) {
    console.error(err);
    return s;
  }
}

function saveScore(st) {
  hiscoresShown = addScore(hiscores, { name: 'COURIER', score: st.score });
  storeSet(SCORES_KEY, JSON.stringify(hiscoresShown));
}

// One game tick on the timer: take one queued input and step.
function gameTick() {
  if (menu.screen === 'title' || menu.screen === 'help' || menu.screen === 'over') {
    // The attract mode plays the shipped levels behind the menus.
    if (demo && demo.status === 'playing') demo = tryStep(demo, botInput(demo));
    else {
      try { demo = init(0x51fada, { levels: LEVELS }); } catch { demo = null; }
    }
    return;
  }
  if (!state || menu.screen === 'editor') return;
  const taken = queueTake(queue);
  queue = taken.queue;
  const prev = state;
  state = tryStep(prev, taken.input);
  stats = statsUpdate(stats, prev, state, taken.input);
  const fresh = checkAchievements(prev, state, unlocked);
  if (fresh.length) unlocked = unlocked.concat(fresh);
  for (const cue of cuesFor(state.events)) {
    try { audio.play(cue); } catch { /* audio may be unavailable */ }
  }
  const grown = particlesFor(state, renderSeed);
  particles = stepParticles(particles.concat(grown.particles));
  renderSeed = grown.seed;
  if (state.status !== 'playing' && !overHandled) {
    overHandled = true;
    saveScore(state);
    menu = menuReduce(menu, 'gameover');
  }
}

// --- starting games from the title menu --------------------------------------

// item 0 Play (campaign), 1 Daily run, 2 Level editor, 3 How to play,
// 4 Sound (menuReduce already flipped it)
function startFromTitle(chosen) {
  if (chosen === 0) startGame(LEVELS, freshSeed(), 0, 'campaign');
  else if (chosen === 1) startDaily();
  else if (chosen === 2) editor = { def: editorInit(17, 11), brush: '#', cursor: null };
  else if (chosen === 4) {
    settings = { ...DEFAULT_SETTINGS, ...settings, sound: menu.sound };
    persistSettings();
    audio.setMuted(!menu.sound);
  }
}

// --- input: keyboard ---------------------------------------------------------

attachKeyboard(window, (input) => {
  if (menu.screen !== 'playing') return;
  queue = queuePush(queue, input);
  if (input.pause) menu = menuReduce(menu, 'pause');
});

window.addEventListener('keydown', (e) => {
  const k = e.key;
  const input = keyToInput(k);
  const screen = menu.screen;
  if (screen === 'playing') return; // attachKeyboard owns the play keys
  if (input || k === 'Enter') e.preventDefault();
  resumeAudio();

  if (screen === 'paused') {
    if (k === 'p' || k === 'P' || k === 'Escape') {
      menu = menuReduce(menu, 'pause');
      queue = queuePush(queue, { move: null, pause: true });
    } else if (k === 'Enter') {
      menu = menuReduce(menu, 'select');
      queue = queuePush(queue, { move: null, pause: true });
    }
    return;
  }

  if (screen === 'editor') {
    if (k === 'Enter') playCustom();
    else if (k === 'f' || k === 'F') fillCursor();
    else if (k === 'c' || k === 'C') copyEditor();
    else if (k === 'Escape') menu = menuReduce(menu, 'back');
    else if (EDITOR_BRUSHES.has(k)) editor.brush = EDITOR_BRUSHES.get(k);
    return;
  }

  // title, help, over
  const action = k === 'Enter' ? 'select'
    : k === 'ArrowUp' || k === 'w' || k === 'W' ? 'up'
    : k === 'ArrowDown' || k === 's' || k === 'S' ? 'down'
    : input ? 'back' : null;
  if (action) {
    const chosen = menu.selected;
    menu = menuReduce(menu, action);
    if (action === 'select' && screen === 'title') startFromTitle(chosen);
  }
});

// --- input: touch (swipe moves, tap selects) ---------------------------------

let touchStart = null;
canvas.addEventListener('touchstart', (e) => {
  const t = e.changedTouches[0];
  touchStart = { x: t.clientX, y: t.clientY };
  e.preventDefault();
}, { passive: false });

canvas.addEventListener('touchend', (e) => {
  if (touchStart) {
    const t = e.changedTouches[0];
    const swipe = swipeToInput(t.clientX - touchStart.x, t.clientY - touchStart.y);
    touchStart = null;
    resumeAudio();
    if (menu.screen === 'playing') {
      if (swipe) queue = queuePush(queue, swipe);
    } else if (menu.screen === 'editor') {
      playCustom();
    } else if (swipe && menu.screen === 'title') {
      menu = menuReduce(menu, swipe.move === 'up' ? 'up' : 'down');
    } else {
      const chosen = menu.screen === 'title' ? menu.selected : undefined;
      menu = menuReduce(menu, 'select');
      if (chosen !== undefined) startFromTitle(chosen);
    }
  }
  e.preventDefault();
}, { passive: false });

// --- input: mouse (the editor paints; taps select in menus) -------------------

let painting = false;
canvas.addEventListener('mousedown', (e) => {
  resumeAudio();
  if (menu.screen === 'editor') {
    painting = true;
    paintAt(e);
    e.preventDefault();
    return;
  }
  if (menu.screen === 'playing') return;
  const chosen = menu.screen === 'title' ? menu.selected : undefined;
  menu = menuReduce(menu, 'select');
  if (chosen !== undefined) startFromTitle(chosen);
});
window.addEventListener('mouseup', () => { painting = false; });
canvas.addEventListener('mousemove', (e) => {
  if (menu.screen === 'editor') {
    trackCursor(e);
    if (painting) paintAt(e);
  }
});

window.addEventListener('blur', () => {
  if (menu.screen === 'playing' && state && state.status === 'playing' && !state.paused) {
    queue = queuePush(queue, { move: null, pause: true });
    menu = menuReduce(menu, 'pause');
  }
});

// --- the level editor screen -------------------------------------------------

const EDITOR_BRUSHES = new Map([
  ['0', '#'], ['1', '.'], ['2', 'P'], ['3', 'M'], ['4', 'X'],
  ['5', 'H'], ['6', '^'], ['7', '>'], ['8', 'v'], ['9', '<'],
]);

function editorGeom() {
  const def = editor.def;
  const w = def.map[0].length;
  const h = def.map.length;
  const cell = Math.floor(Math.min((canvas.width - 24) / w, (canvas.height - 110) / h));
  const ox = Math.floor((canvas.width - cell * w) / 2);
  const oy = 84 + Math.floor((canvas.height - 110 - cell * h) / 2);
  return { cell, ox, oy, w, h };
}

function pointerCell(e) {
  const r = canvas.getBoundingClientRect();
  const g = editorGeom();
  return {
    x: Math.floor(((e.clientX - r.left) * (canvas.width / r.width) - g.ox) / g.cell),
    y: Math.floor(((e.clientY - r.top) * (canvas.height / r.height) - g.oy) / g.cell),
  };
}

function trackCursor(e) { editor.cursor = pointerCell(e); }

function paintAt(e) {
  const c = pointerCell(e);
  editor.cursor = c;
  if (c.y >= 0 && c.y < editor.def.map.length && c.x >= 0 && c.x < editor.def.map[0].length) {
    editor.def = editorPaint(editor.def, c.x, c.y, editor.brush);
  }
}

function fillCursor() {
  if (editor.cursor) editor.def = editorFill(editor.def, editor.cursor.x, editor.cursor.y, editor.brush);
}

function playCustom() {
  if (editorErrors(editor.def).length === 0) {
    menu = menuReduce(menu, 'select');
    startGame([editor.def], freshSeed(), 0, 'custom');
  }
}

function copyEditor() {
  try { navigator.clipboard.writeText(editorExport(editor.def)); } catch { /* deny etc. */ }
}

// --- drawing -----------------------------------------------------------------

function uiText(list, text, x, y, size, color) {
  list.push({ op: 'text', kind: 'ui', x, y, text, color, size });
}

const HELP_ROWS = [
  ['MOVE', 'arrow keys or WASD'],
  ['PAUSE', 'P or Escape'],
  ['MENUS', 'Enter selects, Escape backs'],
  ['PICK', 'walk onto a patch to carry it, up to three'],
  ['MERGE', 'step on a merge pad to merge what you carry'],
  ['QUORUM', 'enough merges open the hold doors and the exit'],
  ['DRIFT', 'touch one with patches: you drop them all'],
  ['DRIFT', 'touch one empty-handed: you lose a life'],
  ['CONFLICT', 'two drifts colliding leave an impassable block'],
  ['SHIP', 'reach the open exit to finish the level'],
];

function drawMenus(W, H) {
  const ops = [];
  const left = Math.round(W * 0.38);
  if (menu.screen === 'title') {
    uiText(ops, 'QUORUM RUN', left, Math.round(H * 0.3), 40, PALETTE.accent);
    const items = menuItems(menu);
    let y = Math.round(H * 0.5);
    for (let i = 0; i < items.length; i++) {
      const color = i === menu.selected ? PALETTE.accent : PALETTE.dim;
      if (i === menu.selected) uiText(ops, '>', left - 28, y, 20, color);
      uiText(ops, items[i], left, y, 20, color);
      y += 32;
    }
    uiText(ops, 'arrows move  enter selects  P pauses', left, y + 26, 14, PALETTE.dim);
    if (hiscores.length) uiText(ops, 'BEST ' + formatScore(hiscores[0].score), left, y + 52, 14, PALETTE.text);
  } else if (menu.screen === 'help') {
    uiText(ops, 'HOW TO PLAY', Math.round(W / 2) - 200, Math.round(H * 0.16), 26, PALETTE.accent);
    let y = Math.round(H * 0.28);
    for (const [label, text] of HELP_ROWS) {
      uiText(ops, label, Math.round(W / 2) - 200, y, 15, PALETTE.accent);
      uiText(ops, text, Math.round(W / 2) - 80, y, 15, PALETTE.text);
      y += 30;
    }
    uiText(ops, 'enter or escape returns to the title', Math.round(W / 2) - 200, y + 18, 14, PALETTE.dim);
  } else if (menu.screen === 'paused' && state) {
    uiText(ops, 'P or Escape resumes, holding nothing back', left - 40, Math.round(H * 0.6), 15, PALETTE.text);
  } else if (menu.screen === 'over') {
    const y0 = Math.round(H * 0.34);
    uiText(ops, 'SCORE ' + formatScore(state ? state.score : 0), left, y0, 24, PALETTE.accent);
    if (hiscoresShown.length) uiText(ops, 'BEST ' + formatScore(hiscoresShown[0].score), left, y0 + 34, 16, PALETTE.dim);
    let y = y0 + 72;
    for (const line of statsLines(stats)) {
      uiText(ops, line, left, y, 16, PALETTE.text);
      y += 26;
    }
    uiText(ops, 'ACHIEVEMENTS ' + unlocked.length + '/' + ACHIEVEMENTS.length, left, y + 8, 16, PALETTE.accent);
    let ax = left + 230;
    let ay = y0;
    for (const a of ACHIEVEMENTS) {
      const got = unlocked.includes(a.id);
      uiText(ops, (got ? '[x] ' : '[ ] ') + a.title, ax, ay, 14, got ? PALETTE.text : PALETTE.dim);
      ay += 22;
      if (ay > H - 40) { ay = y0; ax += 170; }
    }
    uiText(ops, 'enter returns to the title', left, H - 28, 14, PALETTE.dim);
  } else if (menu.screen === 'editor' && editor) {
    const g = editorGeom();
    uiText(ops, 'LEVEL EDITOR  brush <' + editor.brush + '>', 14, 26, 18, PALETTE.accent);
    uiText(ops, '0# 1. 2P 3M 4X 5H 6-9 drifts  click paints  f fills', 14, 46, 13, PALETTE.dim);
    uiText(ops, 'enter plays it  c copies the json  escape leaves', 14, 64, 13, PALETTE.dim);
    const errs = editorErrors(editor.def);
    uiText(ops, errs.length ? 'errors: ' + errs.join(', ') : 'the level validates', 14, 82, 13, errs.length ? PALETTE.danger : PALETTE.text);
    const colors = {
      '#': PALETTE.wall, '.': PALETTE.floor, '@': PALETTE.accent, P: PALETTE.agents[0],
      M: PALETTE.accent, X: PALETTE.accent, H: PALETTE.dim,
      '^': PALETTE.danger, '>': PALETTE.danger, v: PALETTE.danger, '<': PALETTE.danger,
    };
    for (let y = 0; y < g.h; y++) {
      for (let x = 0; x < g.w; x++) {
        const ch = editor.def.map[y][x];
        ops.push({ op: 'rect', kind: 'grid', x: g.ox + x * g.cell, y: g.oy + y * g.cell, w: g.cell - 1, h: g.cell - 1, color: colors[ch] ?? PALETTE.floor });
      }
    }
    if (editor.cursor && editor.cursor.y >= 0 && editor.cursor.y < g.h && editor.cursor.x >= 0 && editor.cursor.x < g.w) {
      ctx.fillStyle = 'rgba(242, 242, 242, 0.4)';
      ctx.fillRect(g.ox + editor.cursor.x * g.cell, g.oy + editor.cursor.y * g.cell, g.cell - 1, g.cell - 1);
    }
  }
  if (ops.length) paint(ctx, ops);
}

// --- generative background music (never sampled) ------------------------------

let musicCtx = null;
let musicBarIndex = 0;

function resumeAudio() {
  if (musicCtx && musicCtx.state === 'suspended') {
    try { musicCtx.resume().catch(() => {}); } catch { /* noop */ }
  }
}

function musicLoop() {
  let bpm = tempo(0);
  try {
    const active = settings.music && settings.sound && menu.screen !== 'editor'
      && state && state.status === 'playing';
    if (active && AudioCtor) {
      musicCtx = musicCtx || new AudioCtor();
      const bpmNow = tempo(state.levelIndex);
      bpm = bpmNow;
      scheduleBar(musicCtx, bar(state.levelIndex, musicBarIndex++),
        musicCtx.currentTime + 0.08, bpmNow,
        Math.min(1, Math.max(0.02, (settings.volume ?? DEFAULT_SETTINGS.volume) * 0.24)));
    }
  } catch { /* audio may be unavailable; keep the page alive */ }
  const wait = Math.max(900, Math.round(240000 / bpm)); // eight steps of 30/bpm s
  setTimeout(musicLoop, wait);
}

// --- the loops ---------------------------------------------------------------

function tickLoop() {
  gameTick();
  setTimeout(tickLoop, ms);
}

function fit() {
  const w = canvas.clientWidth | 0;
  const h = canvas.clientHeight | 0;
  if (w > 0 && h > 0 && (w !== canvas.width || h !== canvas.height)) {
    canvas.width = w;
    canvas.height = h;
  }
}

function tryDraw(fn) {
  try {
    fn();
  } catch (err) {
    if (!tryDraw.warned) { tryDraw.warned = true; console.error(err); }
  }
}

function drawFrame() {
  fit();
  const W = canvas.width;
  const H = canvas.height;
  const screen = menu.screen;
  tryDraw(() => {
    // the board behind the screen: the player's game, or the attract demo
    const live = state && screen !== 'title' && screen !== 'help';
    const shown = live ? state : demo;
    if (shown) {
      const lo = layout(shown.level, { width: W, height: H });
      const ops = drawList(shown, { width: W, height: H });
      paint(ctx, ops.concat(live ? particleOps(particles, lo) : []));
    }
  });
  if (screen !== 'playing') {
    tryDraw(() => {
      ctx.fillStyle = 'rgba(17, 17, 17, 0.82)';
      ctx.fillRect(0, 0, W, H);
      drawMenus(W, H);
    });
  }
  requestAnimationFrame(drawFrame);
}

// --- boot --------------------------------------------------------------------

try { demo = init(0x51fada, { levels: LEVELS }); } catch { demo = null; }
requestAnimationFrame(drawFrame);
setTimeout(tickLoop, ms);
musicLoop();

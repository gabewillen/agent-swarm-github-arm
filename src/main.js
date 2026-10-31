// Quorum Run — the browser entry point (DESIGN.md §15).
//
// This is the only module that touches the DOM: it owns the canvas, the
// frame loop, the menu screens, the audio contexts, and the touch/keyboard
// plumbing. It runs `step` every TICK_MS (adjusted by player settings)
// with the queued input, draws each frame with `drawList` + `paint` on
// requestAnimationFrame, plays `cuesFor` of each step's events, shows the
// title menu first, and (per §15) lets a bot demo play behind the title.

import { TICK_MS } from './core/constants.js';
import { init, step } from './core/game.js';
import { botInput } from './core/bot.js';
import { dailySeed, generateLevel } from './core/generate.js';
import { editorInit, editorPaint, editorFill, editorErrors } from './core/editor.js';
import { PALETTE } from './render/palette.js';
import { layout, drawList, paint } from './render/draw.js';
import { particleOps, particlesFor, stepParticles } from './render/particles.js';
import { attachKeyboard, queuePush, queueTake, swipeToInput } from './input/keys.js';
import { cuesFor } from './audio/cues.js';
import { createAudio } from './audio/synth.js';
import { bar, scheduleBar, tempo } from './audio/music.js';
import { menuInit, menuReduce, menuItems } from './ui/menu.js';
import { loadSettings, saveSettings, tickMs } from './ui/settings.js';
import { addScore, formatScore, parseTable } from './ui/scores.js';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
const SETTING_KEY = 'quorum-run-settings';
const SCORE_KEY = 'quorum-run-scores';
const TOOL_CHARS = ['#', '.', 'P', 'M', 'X', 'H', '@', '^', '>', 'v', '<'];

const HELP_LINES = [
  'Move with the arrow keys or WASD. P or Escape pauses.',
  'Patches (colored) appear on spawn points as you play.',
  'Walk over a patch to pick it up; carry up to 3.',
  'Stand on a merge pad (M) to merge what you carry.',
  'Reach the quorum: holds and the exit (X) open.',
  'Take the exit to ship the level. Beat the par for style.',
  'Drifts (red) hurt: carrying, they spill your patches;',
  'empty-handed, they cost a life. Conflicts block.',
];

const CELL_FILL = {
  '#': PALETTE.wall,
  '.': PALETTE.floor,
  '@': PALETTE.accent,
  P: PALETTE.agents[1],
  M: PALETTE.agents[3],
  X: PALETTE.accent,
  H: PALETTE.dim,
  '^': PALETTE.danger,
  '>': PALETTE.danger,
  v: PALETTE.danger,
  '<': PALETTE.danger,
};

// --- boot ----------------------------------------------------------------

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const AudioCtor = window.AudioContext || window.webkitAudioContext || null;
const audio = createAudio(AudioCtor);

let view = fit(canvas);
window.addEventListener('resize', () => {
  view = fit(canvas);
});

let settings = loadSettings(readStore(SETTING_KEY) || '');
let scores = parseTable(readStore(SCORE_KEY) || '');
let menu = Object.assign(menuInit(), { sound: settings.sound });
audio.setMuted(settings.sound === false);

let st = null; // the live game state
let queue = []; // queued inputs (DESIGN.md §12)
let particles = [];
let pseed = randomSeed();
let demo = null; // the attract-mode game behind the title
let demoHold = 0;
let editorDef = editorInit(16, 12);
let editorTool = '#';
let editorMetrics = null;
let editorPalette = null;
let pointer = null;
let barCount = 0;
let barClock = 0;
let audioCtx = null;
let acc = 0;
let last = performance.now();

// --- frame loop ----------------------------------------------------------

function frame(now) {
  const dt = Math.min(1000, now - last);
  last = now;
  if (menu.screen === 'playing' || menu.screen === 'title' || menu.screen === 'help' || menu.screen === 'over') {
    acc += dt;
    const iv = tickMs(settings) || TICK_MS;
    while (acc >= iv) {
      acc -= iv;
      tickActive();
    }
  } else {
    acc = 0;
  }
  ensureDemo();
  pumpMusic();
  draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// One step of whatever is on stage: the live game on the playing screen,
// the attract-mode demo behind the title and help screens.
function tickActive() {
  if (menu.screen === 'title' || menu.screen === 'help') {
    if (demo && demo.status !== 'playing') {
      if (--demoHold <= 0) resetDemo();
    } else if (demo) {
      demo = step(demo, botInput(demo));
    }
    return;
  }
  if (menu.screen !== 'playing' || !st || st.status !== 'playing') return;
  liveStep();
}

// Runs one playing step of the live game from the queued input (§15: a step
// every TICK_MS with the queued input) and wires its fallout — cues (§13),
// particles (§23), and the game-over transition (§14).
function liveStep() {
  if (!st || st.status !== 'playing') return;
  const take = queueTake(queue);
  queue = take.queue;
  const next = step(st, take.input);
  st = next;
  for (const name of cuesFor(next.events)) {
    audio.play(name);
  }
  if (next.events.length > 0) {
    const made = particlesFor(next, pseed);
    particles = particles.concat(made.particles);
    pseed = made.seed;
  }
  if (next.status !== 'playing') {
    scores = addScore(scores, { name: 'YOU', score: next.score });
    store(SCORE_KEY, JSON.stringify(scores));
    menu = menuReduce(menu, 'gameover');
  }
}

// --- starting games ------------------------------------------------------

function newGame(mode) {
  let seed = randomSeed();
  let theInit;
  if (mode === 'daily') {
    seed = dailySeed(todayString()) ?? seed;
    theInit = init(seed, { levels: [generateLevel(seed)] });
  } else if (mode === 'custom') {
    theInit = init(1, { levels: [editorDef] });
  } else {
    theInit = init(seed);
  }
  st = theInit;
  queue = [];
  particles = [];
  pseed = randomSeed();
  barCount = 0;
  barClock = 0;
  acc = 0;
}

function resetDemo() {
  demo = init(randomSeed());
  demoHold = 240; // frames (~4s) to linger on the demo's end screen
  particles = [];
}

function ensureDemo() {
  if ((menu.screen === 'title' || menu.screen === 'help') && !demo) resetDemo();
}

// --- menu actions --------------------------------------------------------

// The pause key and the tap both land here; entering or leaving the paused
// screen always queues a pause input so the menu and `status.paused` agree
// (DESIGN.md §6 rule 2, §14).
function togglePause() {
  if (!st || (menu.screen !== 'playing' && menu.screen !== 'paused')) return;
  queue = queuePush(queue, { move: null, pause: true });
  menu = menuReduce(menu, 'pause');
}

function menuAction(action) {
  if (menu.screen === 'title' && action === 'select') {
    if (menu.selected === 0) newGame('campaign');
    else if (menu.selected === 1) newGame('daily');
  }
  if (menu.screen === 'editor' && action === 'select') {
    if (editorErrors(editorDef).length > 0) return; // fix the level first
    newGame('custom');
  }
  menu = menuReduce(menu, action);
  if (settings.sound !== menu.sound) {
    settings = Object.assign({}, settings, { sound: menu.sound });
    audio.setMuted(!menu.sound);
    store(SETTING_KEY, saveSettings(settings));
  }
}

// Maps a KeyboardEvent-mapped input to its effect on the current screen
// (DESIGN.md §16: arrows and WASD move in play, Enter selects, P/Escape pause).
function keyAction(input) {
  if (menu.screen === 'playing') {
    if (input.pause) return togglePause();
    if (st && st.paused) return; // paused: only the pause key speaks
    if (input.move) queue = queuePush(queue, input);
    return;
  }
  if (menu.screen === 'paused') {
    if (input.pause) return togglePause();
    if (!input.move) {
      queue = queuePush(queue, { move: null, pause: true }); // resume
      menu = menuReduce(menu, 'select');
    }
    return;
  }
  if (menu.screen === 'over') {
    if (!input.move) menuAction('select');
    return;
  }
  if (menu.screen === 'editor') {
    if (input.pause) return menuAction('back');
    if (!input.move) return menuAction('select');
    return;
  }
  // title and help
  if (input.pause) return menuAction('back');
  if (input.move === 'up') return menuAction('up');
  if (input.move === 'down') return menuAction('down');
  if (!input.move) return menuAction('select');
}

// --- pointer input (§16: swipe to move, tap to select) -------------------

function pointerCell(e) {
  if (!editorMetrics || !editorDef) return null;
  const r = canvas.getBoundingClientRect();
  const sx = canvas.width / Math.max(1, r.width);
  const sy = canvas.height / Math.max(1, r.height);
  const x = (e.clientX - r.left) * sx;
  const y = (e.clientY - r.top) * sy;
  const m = editorMetrics;
  const cx = Math.floor((x - m.ox) / m.cell);
  const cy = Math.floor((y - m.oy) / m.cell);
  if (cx < 0 || cy < 0 || cx >= editorDef.width || cy >= editorDef.height) return null;
  return { x: cx, y: cy };
}

function editorApply(cell, flood) {
  if (!cell) return;
  if (flood) editorDef = editorFill(editorDef, cell.x, cell.y, editorTool);
  else editorDef = editorPaint(editorDef, cell.x, cell.y, editorTool);
}

canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  unlockAudio();
  const cell = menu.screen === 'editor' ? pointerCell(e) : null;
  pointer = { x: e.clientX, y: e.clientY, t: performance.now(), cell, flood: e.shiftKey === true };
  if (cell) editorApply(cell, pointer.flood);
});
canvas.addEventListener('pointermove', (e) => {
  if (!pointer || menu.screen !== 'editor' || !pointer.cell) return;
  const cell = pointerCell(e);
  if (cell && (cell.x !== pointer.cell.x || cell.y !== pointer.cell.y)) {
    pointer.cell = cell;
    editorApply(cell, pointer.flood);
  }
});
canvas.addEventListener('pointerup', (e) => {
  if (!pointer) return;
  const dx = e.clientX - pointer.x;
  const dy = e.clientY - pointer.y;
  const dt = performance.now() - pointer.t;
  const wasEditor = menu.screen === 'editor';
  const tailCell = wasEditor ? pointerCell(e) : null;
  pointer = null;
  if (tailCell) {
    editorApply(tailCell, false);
  } else if (wasEditor && editorPalette && yOf(e) >= editorPalette.y0) {
    pickTool(e);
  } else if (Math.abs(dx) < 8 && Math.abs(dy) < 8 && dt < 400) {
    if (menu.screen === 'playing' || menu.screen === 'paused') togglePause();
    else if (menu.screen !== 'editor') menuAction('select');
  } else {
    const input = swipeToInput(dx, dy);
    if (input && menu.screen === 'playing' && st && !st.paused) queue = queuePush(queue, input);
  }
});

function yOf(e) {
  const r = canvas.getBoundingClientRect();
  return (e.clientY - r.top) * (canvas.height / Math.max(1, r.height));
}

function pickTool(e) {
  if (!editorPalette) return;
  const r = canvas.getBoundingClientRect();
  const x = (e.clientX - r.left) * (canvas.width / Math.max(1, r.width));
  const i = Math.floor((x - editorPalette.x0) / editorPalette.sw);
  if (i >= 0 && i < TOOL_CHARS.length) editorTool = TOOL_CHARS[i];
}

const detachKeyboard = attachKeyboard(window, keyAction);
window.addEventListener('pagehide', () => {
  if (typeof detachKeyboard === 'function') detachKeyboard();
}, { once: true });

// --- audio ---------------------------------------------------------------

function unlockAudio() {
  if (!AudioCtor) return;
  if (!audioCtx) {
    try {
      audioCtx = new AudioCtor();
    } catch {
      audioCtx = null;
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    try {
      const woke = audioCtx.resume();
      if (woke && typeof woke.catch === 'function') woke.catch(() => {});
    } catch {
      /* context stays suspended; cues still try other means */
    }
  }
}

// Background music per §24: schedule the next bar in wall-clock time while
// the game plays.
function pumpMusic() {
  const running = audioCtx && audioCtx.state === 'running';
  if (!settings.music || !running || !st || st.status !== 'playing' || st.paused || menu.screen !== 'playing') {
    barClock = 0;
    return;
  }
  const t = audioCtx.currentTime;
  if (barClock <= t) {
    const bpm = tempo(st.levelIndex);
    const ahead = t + 0.08;
    scheduleBar(audioCtx, bar(st.levelIndex, barCount), ahead, bpm, Math.max(0.02, Math.min(1, settings.volume) * 0.18));
    barClock = ahead + 240 / bpm; // a bar is 8 steps of 30/bpm seconds (§24)
    barCount += 1;
  }
}

// --- drawing -------------------------------------------------------------

function draw() {
  const w = view.width;
  const h = view.height;
  ctx.globalAlpha = 1;
  switch (menu.screen) {
    case 'title':
    case 'help': {
      drawAttract();
      drawMenuChrome(w, h);
      break;
    }
    case 'playing':
    case 'paused':
      drawGame();
      break;
    case 'over':
      drawGame();
      drawGameOver(w, h);
      break;
    case 'editor':
      drawEditor(w, h);
      break;
    default: {
      ctx.fillStyle = PALETTE.bg;
      ctx.fillRect(0, 0, w, h);
    }
  }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

function drawGame() {
  if (!st) return;
  const ops = drawList(st, view);
  paint(ctx, ops);
  if (particles.length > 0) {
    const lay = layout(st.level, view);
    paint(ctx, particleOps(particles, lay));
  }
}

function drawAttract() {
  if (!demo) return;
  const prev = ctx.globalAlpha;
  ctx.globalAlpha = 0.35;
  paint(ctx, drawList(demo, view));
  ctx.globalAlpha = prev;
}

function drawMenuChrome(w, h) {
  const veil = Math.round(h * 0.62);
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = PALETTE.bg;
  ctx.fillRect(0, 0, w, veil);
  ctx.globalAlpha = 1;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const big = Math.max(22, Math.round(Math.min(w / 14, h / 9)));

  if (menu.screen === 'help') {
    ctx.fillStyle = PALETTE.accent;
    ctx.font = `700 ${big}px ${MONO}`;
    ctx.fillText('HOW TO PLAY', w / 2, Math.round(h * 0.06));
    const lh = Math.max(18, Math.round(h * 0.042));
    const size = Math.max(11, Math.round(lh * 0.55));
    ctx.fillStyle = PALETTE.text;
    ctx.font = `400 ${size}px ${MONO}`;
    const y0 = Math.round(h * 0.06) + big + Math.round(lh * 0.8);
    for (let i = 0; i < HELP_LINES.length; i++) {
      ctx.fillText(HELP_LINES[i], w / 2, y0 + i * lh);
    }
    ctx.fillStyle = PALETTE.dim;
    ctx.fillText('Enter or Escape: back', w / 2, veil - Math.round(lh * 1.4));
    return;
  }

  ctx.fillStyle = PALETTE.accent;
  ctx.font = `700 ${big}px ${MONO}`;
  ctx.fillText('QUORUM RUN', w / 2, Math.round(h * 0.06));
  ctx.fillStyle = PALETTE.dim;
  ctx.font = `400 ${Math.max(10, Math.round(big * 0.34))}px ${MONO}`;
  ctx.fillText('patch courier, the merge arcade', w / 2, Math.round(h * 0.06) + big + 8);

  const items = menuItems(menu);
  const lh = Math.max(22, Math.round(h * 0.05));
  const size = Math.max(12, Math.round(lh * 0.55));
  const y0 = Math.round(h * 0.06) + big + 34;
  for (let i = 0; i < items.length; i++) {
    const sel = i === menu.selected;
    ctx.fillStyle = sel ? PALETTE.accent : PALETTE.text;
    ctx.font = `${sel ? '700' : '400'} ${size}px ${MONO}`;
    ctx.fillText((sel ? '\u203a ' : '\u2003') + items[i], w / 2, y0 + i * lh);
  }

  const small = Math.max(10, Math.round(size * 0.8));
  ctx.fillStyle = PALETTE.dim;
  ctx.font = `400 ${small}px ${MONO}`;
  const foot = scores.length > 0 ? `BEST ${formatScore(scores[0].score)}` : 'BEST 000000';
  ctx.fillText(`${foot} \u00b7 arrows/WASD choose \u00b7 Enter play \u00b7 P pause`, w / 2, veil - small * 1.2);
}

function drawGameOver(w, h) {
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = PALETTE.bg;
  ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const big = Math.max(20, Math.round(Math.min(w / 16, h / 14)));
  ctx.fillStyle = st && st.status === 'won' ? PALETTE.accent : PALETTE.danger;
  ctx.font = `700 ${Math.round(big * 1.6)}px ${MONO}`;
  ctx.fillText('ALL MERGED', w / 2, h / 2 - big * 1.4);
  if (!st || st.status !== 'won') {
    ctx.fillStyle = PALETTE.accent;
    ctx.fillText('GAME OVER', w / 2, h / 2 - big * 0.2);
  }
  ctx.fillStyle = PALETTE.text;
  ctx.font = `700 ${big}px ${MONO}`;
  ctx.fillText(`SCORE ${formatScore(st ? st.score : 0)}`, w / 2, h / 2 + big * 1.2);
  ctx.fillStyle = PALETTE.dim;
  ctx.font = `400 ${Math.max(10, Math.round(big * 0.6))}px ${MONO}`;
  ctx.fillText('Enter: menu', w / 2, h / 2 + big * 2.4);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

function drawEditor(w, h) {
  ctx.fillStyle = PALETTE.bg;
  ctx.fillRect(0, 0, w, h);
  const def = editorDef;
  const bottom = 64;
  const cell = Math.max(4, Math.floor(Math.min(w / def.width, (h - bottom - 56) / def.height)));
  const ox = Math.floor((w - cell * def.width) / 2);
  const oy = 56 + Math.floor((h - bottom - 56 - cell * def.height) / 2);
  editorMetrics = { cell, ox, oy };

  ctx.fillStyle = PALETTE.panel;
  ctx.fillRect(0, 0, w, 52);
  ctx.fillStyle = PALETTE.accent;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.font = `700 ${Math.max(12, Math.round(h * 0.03))}px ${MONO}`;
  ctx.fillText('LEVEL EDITOR', 12, 26);
  ctx.fillStyle = PALETTE.text;
  ctx.font = `400 ${Math.max(9, Math.round(h * 0.022))}px ${MONO}`;
  ctx.fillText('drag: paint \u00b7 shift+drag: flood \u00b7 Enter: play \u00b7 Escape: back', ox < 230 ? 12 : 150, 26);

  const errs = editorErrors(def);
  ctx.fillStyle = errs.length > 0 ? PALETTE.danger : PALETTE.dim;
  ctx.textAlign = 'right';
  if (errs.length > 0) ctx.fillText(errs.slice(0, 3).join(' '), w - 12, 26);

  const s = Math.max(2, cell - Math.max(2, Math.floor(cell * 0.16)));
  for (let y = 0; y < def.height; y++) {
    const row = def.map[y] || '';
    for (let x = 0; x < def.width; x++) {
      const ch = row[x] || '.';
      ctx.fillStyle = CELL_FILL[ch] || PALETTE.floor;
      ctx.fillRect(ox + x * cell + Math.floor((cell - s) / 2), oy + y * cell + Math.floor((cell - s) / 2), s, s);
      if (ch === 'X' || ch === '@' || ch === 'M') {
        ctx.fillStyle = PALETTE.bg;
        ctx.font = `700 ${Math.max(6, Math.floor(s * 0.55))}px ${MONO}`;
        ctx.textAlign = 'center';
        ctx.fillText(ch === 'X' ? 'X' : ch, ox + x * cell + Math.floor(cell / 2), oy + y * cell + Math.floor(cell / 2));
      }
    }
  }

  // The tool palette row.
  const sw = Math.min(Math.floor((w - 24) / TOOL_CHARS.length), 34);
  editorPalette = { x0: Math.floor((w - sw * TOOL_CHARS.length) / 2), sw, y0: h - bottom + 16 };
  ctx.textAlign = 'center';
  ctx.font = `700 ${Math.max(10, Math.floor(sw * 0.5))}px ${MONO}`;
  for (let i = 0; i < TOOL_CHARS.length; i++) {
    const x0 = editorPalette.x0 + i * sw;
    const ch = TOOL_CHARS[i];
    if (ch === editorTool) {
      ctx.fillStyle = PALETTE.accent;
      ctx.fillRect(x0 + 1, h - bottom + 2, sw - 2, sw - 2);
    }
    ctx.fillStyle = ch === editorTool ? PALETTE.bg : (CELL_FILL[ch] || PALETTE.text);
    ctx.fillText(ch === '.' ? '\u00b7' : ch, x0 + Math.floor(sw / 2), h - bottom + 2 + sw / 2);
  }
  ctx.fillStyle = PALETTE.dim;
  ctx.textAlign = 'center';
  ctx.font = `400 ${Math.max(9, Math.floor(sw * 0.4))}px ${MONO}`;
  ctx.fillText('pick a character below, then paint the grid', w / 2, h - 12);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

// --- helpers -------------------------------------------------------------

function fit(c) {
  const dpr = window.devicePixelRatio || 1;
  const cssW = c.clientWidth || window.innerWidth;
  const cssH = c.clientHeight || window.innerHeight;
  c.width = Math.max(1, Math.floor(cssW * dpr));
  c.height = Math.max(1, Math.floor(cssH * dpr));
  return { width: c.width, height: c.height };
}

// Settings and scores live in localStorage; file:// or private modes may
// refuse it, so every access is guarded.
function readStore(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function store(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* storage unavailable; the run just isn't remembered */
  }
}

function randomSeed() {
  return (Math.random() * 0x100000000) >>> 0;
}

function todayString() {
  const d = new Date();
  const two = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}

// Quorum Run: the browser entry (DESIGN.md §15). This is the only module that
// touches the DOM, `window`, or an AudioContext: it wires core, render, input,
// audio, and UI together, steps the game every TICK_MS with the queued input,
// draws on requestAnimationFrame, and plays a cue for each step's events.

import { TICK_MS } from './core/constants.js';
import { init, step } from './core/game.js';
import { botInput } from './core/bot.js';
import { LEVELS } from './data/levels.js';
import { dailySeed, generateLevel } from './core/generate.js';
import {
  editorInit, editorPaint, editorFill, editorErrors, editorExport,
} from './core/editor.js';
import { PALETTE } from './render/palette.js';
import { HUD_HEIGHT, layout, drawList, paint } from './render/draw.js';
import { particlesFor, stepParticles, particleOps } from './render/particles.js';
import {
  keyToInput, swipeToInput, queuePush, queueTake, attachKeyboard,
} from './input/keys.js';
import { cuesFor } from './audio/cues.js';
import { createAudio } from './audio/synth.js';
import { tempo, bar, scheduleBar } from './audio/music.js';
import { menuInit, menuReduce, menuItems } from './ui/menu.js';
import { addScore, formatScore, parseTable } from './ui/scores.js';
import { loadSettings, saveSettings, tickMs as settingsTickMs } from './ui/settings.js';

// ---------- the pieces the page keeps ----------

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const SCORES_KEY = 'quorum-run:scores';
const SETTINGS_KEY = 'quorum-run:settings';

function storedScores() {
  try {
    return parseTable(localStorage.getItem(SCORES_KEY) ?? '');
  } catch {
    return [];
  }
}

let settings = { sound: true, music: true };
try {
  settings = loadSettings(localStorage.getItem(SETTINGS_KEY) ?? '');
} catch {
  /* keep the defaults */
}

const AudioCtor = typeof AudioContext !== 'undefined' ? AudioContext
  : (typeof window !== 'undefined' && window.webkitAudioContext) ? window.webkitAudioContext
    : null;
const audio = AudioCtor ? createAudio(AudioCtor) : null;
if (audio) audio.setMuted(!settings.sound);

let menu = { ...menuInit(), sound: settings.sound };
const scores = storedScores();

let state = null;     // the game being played
let queue = [];       // queued inputs, capped at INPUT_QUEUE_MAX
let particles = [];   // live particles
let particleSeed = (Math.random() * 4294967296) >>> 0;
let demo = null;      // the attract-mode game behind the title screen
let demoSeed = 20241031;
let editor = null;    // { def, brush } while on the editor screen
let overlay = null;   // a transient message, cleared on the next input
let musicLevel = 0;

function periodMs() {
  const p = settingsTickMs(settings);
  return Number.isFinite(p) && p > 0 ? p : TICK_MS;
}

// ---------- screens and their transitions ----------

// Route every change of screen through menuReduce; start or stop what the new
// screen implies. menuReduce never changes its argument, so this rebinding is
// the one place the page's menu lives.
function act(action) {
  const before = menu;
  const after = menuReduce(before, action);
  if (after === before) return;
  menu = after;
  if (menu.screen === 'playing' && before.screen !== 'playing') {
    startGame(menu.mode ?? 'campaign');
  }
  if (menu.screen === 'playing' && !state) menu.screen = before.screen ?? 'title';
  if (menu.screen === 'editor' && !editor) editor = { def: editorInit(16, 12), brush: '#' };
  if (menu.screen !== 'playing') queue = [];
  if (menu.sound !== before.sound) {
    settings.sound = menu.sound;
    if (audio) audio.setMuted(!settings.sound);
    persistSettings();
  }
}

function persistSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, saveSettings(settings));
  } catch {
    /* private mode: settings just aren't kept */
  }
}

// ---------- starting, stepping, scoring ----------

function startGame(mode) {
  particleSeed = (Math.random() * 4294967296) >>> 0;
  particles = [];
  try {
    if (mode === 'daily') {
      const seed = dailySeed(new Date().toISOString().slice(0, 10));
      state = init(seed, { levels: [generateLevel(seed)] });
    } else if (mode === 'custom') {
      const def = JSON.parse(editorExport(editor?.def ?? editorInit(15, 11)));
      state = init((Math.random() * 4294967296) >>> 0, { levels: [def] });
    } else {
      state = init((Math.random() * 4294967296) >>> 0, { levels: LEVELS, level: 0 });
    }
    musicLevel = state.levelIndex;
  } catch (err) {
    state = null;
    overlay = 'cannot start: ' + (err?.message ? err.message : 'invalid level');
    setTimeout(() => { overlay = null; }, 3000);
  }
  if (settings.music) ensureMusic();
}

function recordScore(finished) {
  if (!finished || finished.score <= 0) return;
  const kept = addScore(storedScores(), { name: 'you', score: finished.score });
  scores.splice(0, scores.length, ...kept);
  try {
    localStorage.setItem(SCORES_KEY, JSON.stringify(kept));
  } catch {
    /* private mode */
  }
}

// One tick of the real game: take the queued input, step, react to events.
function advance(input) {
  if (!state || state.status !== 'playing') return;
  let next;
  try {
    next = step(state, input);
  } catch (err) {
    console.warn('step failed', err);
    return;
  }
  const pod = particlesFor(next, particleSeed);
  particleSeed = pod.seed;
  if (next.events.includes('level')) particles = []; // a fresh level, a fresh sky
  particles = stepParticles([...particles, ...pod.particles]);
  state = next;
  if (state.levelIndex !== musicLevel) musicLevel = state.levelIndex;
  try {
    for (const cue of cuesFor(state.events)) if (audio) audio.play(cue);
  } catch {
    /* audio must never take the game down */
  }
  if (state.status !== 'playing') {
    recordScore(state);
    act('gameover');
  }
}

// Attract mode: the bot plays behind the title screen.
function advanceDemo() {
  if (!demo || demo.status !== 'playing') {
    demoSeed = (demoSeed * 1664525 + 1013904223) >>> 0;
    try {
      demo = init(demoSeed, { levels: LEVELS });
    } catch {
      demo = null;
    }
    return;
  }
  try {
    demo = step(demo, botInput(demo));
  } catch (err) {
    console.warn('demo step failed', err);
    demo = null;
  }
}

// The game's heartbeat: every period the playing game takes one queued input;
// on the title and help screens the demo keeps playing behind them.
setInterval(() => {
  if (menu.screen === 'playing') {
    const t = queueTake(queue);
    queue = t.queue;
    advance(t.input);
  } else if (menu.screen === 'title' || menu.screen === 'help') {
    advanceDemo();
  }
}, periodMs());

// ---------- drawing ----------

function viewSize() {
  return { width: canvas.width, height: canvas.height };
}

function resize() {
  const w = Math.max(320, window.innerWidth);
  const h = Math.max(240, window.innerHeight);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
}
window.addEventListener('resize', resize);
resize();

function text(str, x, y, color, size, align) {
  ctx.fillStyle = color;
  ctx.font = `${size}px ui-monospace, Menlo, Consolas, monospace`;
  ctx.textAlign = align ?? 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(str, x, y);
  ctx.textAlign = 'left';
}

function dim(then) {
  ctx.globalAlpha = 0.35;
  then();
  ctx.globalAlpha = 1;
}

function scrim(a) {
  const w = canvas.width;
  const h = canvas.height;
  ctx.globalAlpha = a;
  ctx.fillStyle = PALETTE.bg;
  ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = 1;
  ctx.fillStyle = PALETTE.accent;
  ctx.fillRect(0, 0, w, 3);
  ctx.fillRect(0, h - 3, w, 3);
}

function renderState(s) {
  const view = viewSize();
  const lay = layout(s.level, view);
  const ops = drawList(s, view);
  if (particles.length > 0) {
    try {
      ops.push(...particleOps(particles, lay));
    } catch {
      /* a particle hiccup should not eat the frame */
    }
  }
  paint(ctx, ops);
  return lay;
}

function helpBar(parts) {
  text(parts.join('   ·   '), canvas.width / 2, canvas.height - 52, PALETTE.dim, 12, 'center');
}

function drawTitle() {
  const w = canvas.width;
  const h = canvas.height;
  if (demo) {
    dim(() => renderState(demo)); // the attract mode plays behind the title
    scrim(0.55);
  } else {
    scrim(0.9);
  }
  const titleSize = Math.max(26, Math.floor(h / 12));
  text('QUORUM RUN', w / 2, h * 0.16, PALETTE.accent, titleSize, 'center');
  text('pick up patches · merge to the quorum · ship the level', w / 2,
    h * 0.16 + Math.floor(titleSize * 0.9), PALETTE.dim,
    Math.max(11, Math.floor(h / 46)), 'center');
  menuItems(menu).forEach((item, i) => {
    const sel = i === menu.selected;
    text(sel ? '» ' + item : item, w / 2, h * 0.32 + i * Math.floor(h / 22),
      sel ? PALETTE.accent : PALETTE.text, Math.max(14, Math.floor(h / 34)), 'center');
  });
  text('BEST ' + formatScore(scores.length > 0 ? scores[0].score : 0), w / 2, h - 96,
    PALETTE.dim, 13, 'center');
  helpBar(['arrows/wasd move', 'p pause', 'enter select']);
}

function drawHelp() {
  const w = canvas.width;
  const h = canvas.height;
  scrim(0.92);
  const lines = [
    'you are a courier agent on a grid.',
    '',
    'patches appear on P spawn points. walk onto one to pick it up,',
    'and carry at most three. step on M to merge what you carry:',
    'the score grows, and merged patches count toward the quorum.',
    '',
    'when enough merges land the hold doors and the X exit open:',
    'reach the exit to ship the level, with a bonus for being quick.',
    '',
    'drifts patrol the grid. touch one carrying patches and you drop',
    'them all; touch one empty-handed and you lose a life.',
    'when two drifts collide they leave a conflict nobody can pass.',
    '',
    'arrow keys or wasd move, p or escape pauses, enter selects,',
    'swipe moves and a tap selects on touch screens.',
  ];
  text('HOW TO PLAY', w / 2, h * 0.14, PALETTE.accent, 24, 'center');
  lines.forEach((line, i) => {
    text(line, w / 2, h * 0.2 + i * (h / 32), PALETTE.text,
      Math.max(11, Math.floor(h / 42)), 'center');
  });
  text('enter or escape: back', w / 2, h - 44, PALETTE.dim, 12, 'center');
}

function drawOver() {
  const w = canvas.width;
  const h = canvas.height;
  if (state) dim(() => renderState(state));
  scrim(0.6);
  const won = state && state.status === 'won';
  text(won ? 'ALL MERGED' : 'GAME OVER', w / 2, h * 0.13, won ? PALETTE.accent : PALETTE.danger,
    Math.max(24, Math.floor(h / 14)), 'center');
  if (state) {
    text('SCORE ' + formatScore(state.score), w / 2, h * 0.13 + Math.floor(h / 20),
      PALETTE.text, 18, 'center');
    text('LEVEL ' + (state.levelIndex + 1) + ' · MERGES ' + state.merges, w / 2,
      h * 0.13 + Math.floor(h / 12), PALETTE.dim, 13, 'center');
  }
  scores.slice(0, 5).forEach((e, i) => {
    text((i + 1) + '. ' + formatScore(e.score), w / 2, h * 0.3 + i * (h / 30),
      i === 0 ? PALETTE.accent : PALETTE.dim, 14, 'center');
  });
  text('enter: back to the title', w / 2, h - 44, PALETTE.dim, 12, 'center');
}

function drawPaused() {
  const w = canvas.width;
  const h = canvas.height;
  if (state) renderState(state);
  ctx.fillStyle = PALETTE.bg;
  ctx.globalAlpha = 0.55;
  ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = 1;
  text('PAUSED', w / 2, h * 0.4, PALETTE.accent, Math.max(24, Math.floor(h / 14)), 'center');
  text('p or enter: resume · escape: title', w / 2, h * 0.4 + Math.floor(h / 22),
    PALETTE.dim, 13, 'center');
}

function drawEditor() {
  const w = canvas.width;
  const h = canvas.height;
  scrim(0.9);
  const rows = def.map.length;
  const cols = def.map[0]?.length ?? 0;
  const cell = Math.max(4, Math.floor(Math.min(w / cols, (h - HUD_HEIGHT - 80) / rows)));
  const ox = Math.floor((w - cell * cols) / 2);
  const oy = 48 + Math.floor((h - HUD_HEIGHT - 80 - cell * rows) / 2);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const ch = def.map[y][x];
      const color = ch === '#' ? PALETTE.wall : ch === 'M' ? PALETTE.dim
        : ch === 'X' || ch === '@' ? PALETTE.accent : ch === 'P' || ch === 'H' ? PALETTE.agents[0]
          : PALETTE.floor;
      ctx.fillStyle = color;
      ctx.fillRect(ox + x * cell, oy + y * cell, cell - 1, cell - 1);
      if (ch !== '#' && ch !== '.') {
        text(ch, ox + x * cell + cell / 2, oy + y * cell + cell / 2, PALETTE.bg,
          Math.max(8, Math.floor(cell * 0.7)), 'center');
      }
    }
  }
  const errs = editorErrors(def);
  text('EDITOR — brush [1..7]: # . P M X H @', 24, 24, PALETTE.text, 14);
  text('drag paints · right-click flood-fills · n new · enter play-test · escape back',
    24, 40, PALETTE.dim, 11);
  if (errs.length > 0) text('problems: ' + errs.join(', '), 24, h - 40, PALETTE.danger, 12);
  else text('valid: enter to play-test this level', 24, h - 40, PALETTE.dim, 12);
  ['#', '.', 'P', 'M', 'X', 'H', '@'].forEach((b, i) => {
    const x = w - 20 - (7 - i) * 28;
    const on = editor.brush === b;
    ctx.fillStyle = on ? PALETTE.accent : PALETTE.panel;
    ctx.fillRect(x, h - 32, 22, 22);
    text(b, x + 11, h - 21, on ? PALETTE.bg : PALETTE.text, 12, 'center');
  });
  text('JSON ' + editorExport(def).slice(0, Math.floor(w / 9)), 24, h - 62, PALETTE.dim, 10);
}

function draw() {
  requestAnimationFrame(draw);
  resize();
  ctx.fillStyle = PALETTE.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  switch (menu.screen) {
    case 'title': drawTitle(); break;
    case 'help': drawHelp(); break;
    case 'paused': drawPaused(); break;
    case 'over': drawOver(); break;
    case 'editor': drawEditor(); break;
    default: if (state) renderState(state); break;
  }
  if (overlay) {
    text(overlay, canvas.width / 2, canvas.height - 78, PALETTE.danger, 13, 'center');
  }
}
requestAnimationFrame(draw);

// ---------- music ----------

let musicCtx = null;
let musicBar = 0;

function ensureMusic() {
  if (!settings.music || musicCtx) return;
  const Ctor = typeof AudioContext !== 'undefined' ? AudioContext
    : (typeof window !== 'undefined' && window.webkitAudioContext) || null;
  if (!Ctor) return;
  try {
    musicCtx = new Ctor();
  } catch {
    musicCtx = null;
    return;
  }
  setInterval(() => {
    if (!settings.music || !musicCtx) return;
    try {
      scheduleBar(musicCtx, bar(musicLevel, musicBar++), musicCtx.currentTime + 0.08,
        tempo(musicLevel), Math.min(0.2, 0.1 + (settings.volume ?? 0.8) * 0.1));
    } catch {
      /* music is garnish */
    }
  }, Math.max(700, Math.floor(8 * 30000 / tempo(musicLevel))));
}

// ---------- input ----------

// Moves flow through keys.js's queue (attached below); pause keys are handled
// in the raw key listener, so the queue never holds a pause input.
function onGameInput(input) {
  if (menu.screen !== 'playing' || input.pause) return;
  queue = queuePush(queue, input);
}
const detachKeyboard = attachKeyboard(window, onGameInput);

const MENU_SELECT = ['Enter', ' '];

window.addEventListener('keydown', (e) => {
  overlay = null;
  ensureMusic();
  const screen = menu.screen;
  const input = keyToInput(e.key);
  if (screen === 'playing') {
    if (!input) return;
    e.preventDefault();
    if (input.pause) act('pause'); // moves reach onGameInput through the queue
    return;
  }
  if (screen === 'paused') {
    e.preventDefault();
    if (e.key === 'Escape') act('back');
    else if (input?.pause || MENU_SELECT.includes(e.key)) act('select');
    return;
  }
  if (screen === 'title') {
    if (['ArrowUp', 'w', 'W'].includes(e.key)) { e.preventDefault(); act('up'); } else if (['ArrowDown', 's', 'S'].includes(e.key)) { e.preventDefault(); act('down'); } else if (MENU_SELECT.includes(e.key)) { e.preventDefault(); act('select'); }
    return;
  }
  if (screen === 'help') {
    if (e.key === 'Escape' || input?.pause) { e.preventDefault(); act('back'); } else if (MENU_SELECT.includes(e.key)) { e.preventDefault(); act('select'); }
    return;
  }
  if (screen === 'over') {
    if (MENU_SELECT.includes(e.key) || input?.pause) { e.preventDefault(); act('select'); }
    return;
  }
  if (screen === 'editor') {
    if (e.key === 'Escape') { e.preventDefault(); act('back'); } else if (MENU_SELECT.includes(e.key)) { e.preventDefault(); act('select'); } else if (e.key >= '1' && e.key <= '7' && editor) editor.brush = ['#', '.', 'P', 'M', 'X', 'H', '@'][Number(e.key) - 1];
    else if (e.key === 'n' && editor) editor.def = editorInit(16, 12);
  }
});

// The mouse plays too: the editor paints.
function editorCellFromEvent(e) {
  const rect = canvas.getBoundingClientRect();
  const px = (e.clientX - rect.left) * (canvas.width / rect.width);
  const py = (e.clientY - rect.top) * (canvas.height / rect.height);
  const def = editor.def;
  const rows = def.map.length;
  const cols = def.map[0].length;
  const cell = Math.max(4, Math.floor(Math.min(canvas.width / cols, (canvas.height - HUD_HEIGHT - 80) / rows)));
  const ox = Math.floor((canvas.width - cell * cols) / 2);
  const oy = 48 + Math.floor((canvas.height - HUD_HEIGHT - 80 - cell * rows) / 2);
  return { x: Math.floor((px - ox) / cell), y: Math.floor((py - oy) / cell) };
}

let painting = false;

canvas.addEventListener('mousedown', (e) => {
  overlay = null;
  ensureMusic();
  if (menu.screen !== 'editor' || !editor) return;
  painting = true;
  const { x, y } = editorCellFromEvent(e);
  try {
    if (e.button === 2) editor.def = editorFill(editor.def, x, y, editor.brush);
    else editor.def = editorPaint(editor.def, x, y, editor.brush);
  } catch {
    /* outside the map or on the border: the editor ignores it */
  }
});
window.addEventListener('mousemove', (e) => {
  if (!painting || menu.screen !== 'editor' || !editor) return;
  const { x, y } = editorCellFromEvent(e);
  try {
    editor.def = editorPaint(editor.def, x, y, editor.brush);
  } catch {
    /* ignored */
  }
});
window.addEventListener('mouseup', () => { painting = false; });
canvas.addEventListener('contextmenu', (e) => { e.preventDefault(); });

// Touch: swipe to move, tap to select (§16). touch-action none in the CSS.
let touchStart = null;
canvas.addEventListener('touchstart', (e) => {
  overlay = null;
  ensureMusic();
  const t = e.changedTouches[0];
  touchStart = { x: t.clientX, y: t.clientY };
}, { passive: true });
canvas.addEventListener('touchmove', (e) => {
  if (!touchStart || menu.screen !== 'playing') return;
  const t = e.changedTouches[0];
  const input = swipeToInput(t.clientX - touchStart.x, t.clientY - touchStart.y);
  if (input) {
    queue = queuePush(queue, input);
    touchStart = { x: t.clientX, y: t.clientY };
  }
}, { passive: true });
canvas.addEventListener('touchend', (e) => {
  if (!touchStart) return;
  const t = e.changedTouches[0];
  const input = swipeToInput(t.clientX - touchStart.x, t.clientY - touchStart.y);
  touchStart = null;
  if (menu.screen === 'playing') {
    if (input) queue = queuePush(queue, input);
    return;
  }
  ensureMusic();
  if (menu.screen === 'title') act('select');
  else if (menu.screen === 'help' || menu.screen === 'over' || menu.screen === 'paused') act(menu.screen === 'paused' ? 'select' : 'back');
  else if (menu.screen === 'editor') act('select');
});

// Tabbing away pauses the game so nobody dies off-screen.
window.addEventListener('blur', () => {
  if (menu.screen === 'playing') act('pause');
});

// Cleanup hooks for whoever hosts this page.
window.quorumRun = {
  detach: () => {
    detachKeyboard();
  },
  mute(sound) {
    settings.sound = !!sound;
    if (audio) audio.setMuted(!settings.sound);
    persistSettings();
  },
};

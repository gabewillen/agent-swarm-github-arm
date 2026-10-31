// Quorum Run — the browser entry (DESIGN.md §15). The only module that
// touches the DOM, window, or an AudioContext. It wires the core, the
// renderer, input, audio, and the UI together: the game steps every
// TICK_MS' worth of time with the queued input, draws with drawList and
// paint on requestAnimationFrame, plays the cues of each step's events,
// and shows the title menu first, with a bot demo behind it.

import { TICK_MS } from './core/constants.js';
import { init, step } from './core/game.js';
import { botInput } from './core/bot.js';
import { LEVELS } from './data/levels.js';
import { dailySeed, generateLevel } from './core/generate.js';
import { editorInit, editorPaint, editorFill, editorErrors, editorExport, editorImport } from './core/editor.js';
import { HUD_HEIGHT, layout, drawList, paint } from './render/draw.js';
import { particlesFor, stepParticles, particleOps } from './render/particles.js';
import { PALETTE } from './render/palette.js';
import { keyToInput, swipeToInput, queuePush, queueTake, attachKeyboard } from './input/keys.js';
import { cuesFor } from './audio/cues.js';
import { createAudio } from './audio/synth.js';
import { tempo, bar, scheduleBar } from './audio/music.js';
import { menuInit, menuItems, menuReduce } from './ui/menu.js';
import { addScore, formatScore, parseTable } from './ui/scores.js';
import { loadSettings, saveSettings, tickMs } from './ui/settings.js';

const canvas = document.getElementById('game');
if (!canvas) throw new Error('Quorum Run: no #game canvas');
const screenCtx = canvas.getContext('2d');
if (!screenCtx) throw new Error('Quorum Run: no 2D context');

// ---- persistence (storage may be blocked; trust no one) ------------------
const SETTINGS_KEY = 'quorum-run.settings';
const SCORES_KEY = 'quorum-run.scores';
const EDITOR_KEY = 'quorum-run.editor';

function readStore(key, fallbackText) {
  try { return window.localStorage.getItem(key) ?? fallbackText; } catch { return fallbackText; }
}
function writeStore(key, text) {
  try { window.localStorage.setItem(key, text); } catch { /* private mode: keep playing */ }
}

const settings = loadSettings(readStore(SETTINGS_KEY, 'null'));
const audio = createAudio(window.AudioContext || window.webkitAudioContext);
audio.setMuted(!settings.sound);

// ---- the session ---------------------------------------------------------
// menu: the UI machine of src/ui/menu.js; run: the live game; attract: the
// bot demo behind the title screen; editor: the level editor session.
const S = {
  menu: menuInit(),
  settings,
  run: null,          // { game, queue, particles, seed }
  attract: null,
  editor: null,       // { def, x, y, tool }
  editorErrors: null,
  scores: parseTable(readStore(SCORES_KEY, '[]')),
  gestured: false,
};

const NONE = { move: null, pause: false };
const MOVE_DIRS = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] };
const EDITOR_TOOLS = ['.', '#', 'P', 'M', 'H', '@', 'X'];

// ---- op helpers: every screen draws through one paint pipeline -----------
function textOp(list, kind, x, y, text, color, size) {
  list.push({ op: 'text', kind, x, y, text, color, size });
}
function rectOp(list, kind, x, y, w, h, color) {
  list.push({ op: 'rect', kind, x, y, w, h, color });
}

function fitCanvas() {
  const w = window.innerWidth || 960;
  const h = window.innerHeight || 600;
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  return { width: canvas.width, height: canvas.height };
}

// ---- starting runs -------------------------------------------------------
function today() {
  return new Date().toISOString().slice(0, 10);
}

function startRun(mode) {
  let seed = (Date.now() & 0xffffffff) >>> 0;
  let defs = LEVELS;
  if (mode === 'daily') {
    seed = dailySeed(today()) ?? seed;
    defs = [generateLevel(seed)];
  } else if (mode === 'custom' && S.editor) {
    seed = 1;
    defs = [S.editor.def];
  }
  S.editorErrors = null;
  try {
    S.run = { game: init(seed, { levels: defs }), queue: [], particles: [], seed: 1 };
    return true;
  } catch (err) {
    // An unplayable custom level keeps the editor open with its errors.
    S.editorErrors = S.editor ? editorErrors(S.editor.def) : [String(err && err.message)];
    S.menu = { ...S.menu, screen: 'editor' };
    return false;
  }
}

function startAttract() {
  try {
    S.attract = init(((Date.now() & 0xfff) | 1) >>> 0, { levels: LEVELS });
  } catch { S.attract = null; }
}

// ---- screens -------------------------------------------------------------
// When the menu's screen changes, set up what the next one needs.
function syncScreen(before, after) {
  if ((before === 'title' || before === 'editor') && after === 'playing') {
    startRun(S.menu.mode || 'campaign');
  } else if (after === 'title') {
    startAttract();
  } else if (after === 'editor') {
    if (!S.editor) {
      try {
        const stored = editorImport(readStore(EDITOR_KEY, 'null'));
        S.editor = { def: stored || editorInit(12, 9), x: 1, y: 1, tool: 0 };
      } catch { S.editor = { def: editorInit(12, 9), x: 1, y: 1, tool: 0 }; }
    }
  } else if (after === 'over' && S.run) {
    S.lastScore = S.run.game.score;
    S.scores = addScore(S.scores, { name: 'you', score: S.run.game.score });
    writeStore(SCORES_KEY, JSON.stringify(S.scores));
    S.run = null;
  }
}

function menuAction(action) {
  const before = S.menu.screen;
  const next = menuReduce(S.menu, action);
  const after = next.screen;
  if (before !== after) syncScreen(before, after);
  if (next.sound !== S.menu.sound) {
    S.settings = { ...S.settings, sound: next.sound };
    audio.setMuted(!next.sound);
    writeStore(SETTINGS_KEY, saveSettings(S.settings));
  }
  S.menu = next;
}

// ---- input ---------------------------------------------------------------
function moveCursor(d) {
  const map = S.editor.def.map;
  S.editor.x = Math.min(Math.max(S.editor.x + d[0], 1), map[0].length - 2);
  S.editor.y = Math.min(Math.max(S.editor.y + d[1], 1), map.length - 2);
}

function onInput(input) {
  S.gestured = true;
  if (!input) return;
  const scr = S.menu.screen;
  if (scr === 'editor') {
    if (input.pause) { menuAction('back'); return; }
    const d = input.move ? (MOVE_DIRS[input.move] ?? null) : null;
    if (d) moveCursor(d);
    return;
  }
  if (scr !== 'playing' && scr !== 'paused') {
    if (input.move === 'up') menuAction('up');
    if (input.move === 'down') menuAction('down');
    return;
  }
  if (scr === 'paused') { menuAction('pause'); return; }
  if (input.pause) { menuAction('pause'); return; }
  if (S.run) {
    S.run = { ...S.run, queue: queuePush(S.run.queue || [], input) };
  }
}

// Enter and some editing keys bypass keyToInput (it maps them to null);
// every key keyToInput maps is already handled by attachKeyboard and would
// otherwise run twice.
function keydown(raw) {
  const key = raw && typeof raw.key === 'string' ? raw.key : '';
  const low = key.toLowerCase();
  if (keyToInput(key)) return;
  S.gestured = true;
  if (key === 'Enter' && S.menu.screen === 'editor') {
    // Enter cycles the tile under the cursor through the editor's tools.
    const tool = EDITOR_TOOLS[S.editor.tool % EDITOR_TOOLS.length];
    S.editor.def = editorPaint(S.editor.def, S.editor.x, S.editor.y, tool);
    S.editor.tool = (S.editor.tool + 1) % EDITOR_TOOLS.length;
    return;
  }
  if (key === ' ' && S.menu.screen === 'editor') {
    menuAction('select'); // space tests the level being edited
    return;
  }
  if (low === 'f' && S.menu.screen === 'editor') {
    S.editor.def = editorFill(S.editor.def, S.editor.x, S.editor.y, '.');
    return;
  }
  if (low === 'c' && raw.shiftKey && S.menu.screen === 'editor') {
    writeStore(EDITOR_KEY, editorExport(S.editor.def));
    return;
  }
  if (low === 'v' && raw.shiftKey && S.menu.screen === 'editor') {
    try {
      const def = editorImport(readStore(EDITOR_KEY, 'null'));
      if (def) { S.editor = { def, x: 1, y: 1, tool: 0 }; S.editorErrors = null; }
    } catch { /* a bad export stays out of the editor */ }
    return;
  }
  if (key === 'Enter') { menuAction('select'); return; }
}

attachKeyboard(window, onInput);
window.addEventListener('keydown', keydown);

// Touch: swipe to move, tap to select.
let touchStart = null;
window.addEventListener('touchstart', (e) => {
  S.gestured = true;
  const t = e.touches && e.touches[0];
  touchStart = t ? { x: t.clientX, y: t.clientY } : null;
});
window.addEventListener('touchend', (e) => {
  const t = e.changedTouches && e.changedTouches[0];
  if (!t || !touchStart) return;
  const dx = t.clientX - touchStart.x;
  const dy = t.clientY - touchStart.y;
  touchStart = null;
  const input = swipeToInput(dx, dy);
  if (input) onInput(input);
  else if (S.menu.screen !== 'playing') menuAction('select');
});
window.addEventListener('touchcancel', () => { touchStart = null; });

// ---- the music pump (§24) ------------------------------------------------
// While playing, schedule the next bar a little ahead of the audio clock.
// An AudioContext of our own: it resumes once the page has a gesture, and
// the settings gate it.
const music = { ctx: null, when: 0, index: 0 };
function musicCtx() {
  if (!S.settings.music || !S.gestured) return null;
  try {
    if (!music.ctx) {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return null;
      music.ctx = new Ctor();
      music.when = music.ctx.currentTime;
    }
    if (music.ctx.state === 'suspended') {
      music.ctx.resume();
      music.when = music.ctx.currentTime;
    }
  } catch { return null; }
  return music.ctx;
}
function pumpMusic() {
  if (S.menu.screen !== 'playing' || !S.run) return;
  const a = musicCtx();
  if (!a) return;
  const bpm = tempo(S.run.game.levelIndex);
  const barDur = 240 / bpm; // eight steps of 30 / bpm seconds
  if (music.when < a.currentTime) music.when = a.currentTime;
  while (music.when < a.currentTime + 0.6) {
    scheduleBar(a, bar(S.run.game.levelIndex, music.index), music.when, bpm, S.settings.volume * 0.2);
    music.when += barDur;
    music.index += 1;
  }
}

// ---- the tick ------------------------------------------------------------
// One step of the live state: the run under its queued input, or the bot's
// attract demo on the title screen. Events drive cues and particles.
function tick() {
  if (S.menu.screen === 'playing' && S.run) {
    const took = queueTake(S.run.queue || []);
    S.run.queue = took.queue;
    const after = step(S.run.game, took.input || NONE);
    S.run.game = after;
    const events = after.events || [];
    for (const cue of cuesFor(events)) {
      try { audio.play(cue); } catch { /* no audio: keep playing */ }
    }
    const made = particlesFor(after, S.run.seed);
    S.run = { ...S.run, particles: stepParticles((S.run.particles || []).concat(made.particles)), seed: made.seed };
    if (events.includes('lost') || events.includes('won')) {
      S.menu = { ...S.menu, overLost: events.includes('lost') };
      menuAction('gameover');
    }
  } else if (S.attract) {
    S.attract = step(S.attract, botInput(S.attract) || NONE);
    const events = S.attract.events || [];
    if (events.includes('won') || events.includes('lost')) startAttract();
  }
}

// ---- rendering -----------------------------------------------------------
function titleOps(view, list) {
  const w = view.width;
  rectOp(list, 'panel', Math.floor(w * 0.2), HUD_HEIGHT + 24, Math.floor(w * 0.6), 190, PALETTE.panel);
  rectOp(list, 'rule', Math.floor(w * 0.2), HUD_HEIGHT + 24, Math.floor(w * 0.6), 2, PALETTE.accent);
  textOp(list, 'title', Math.floor(w * 0.5) - 132, HUD_HEIGHT + 64, 'QUORUM RUN', PALETTE.accent, 24);
  const items = menuItems(S.menu);
  items.forEach((item, i) => {
    const pick = i === S.menu.selected;
    textOp(list, 'item', Math.floor(w * 0.5) - 88, HUD_HEIGHT + 100 + i * 24,
      (pick ? '> ' : '  ') + item, pick ? PALETTE.accent : PALETTE.text, 16);
  });
  textOp(list, 'hint', Math.floor(w * 0.5) - 156, HUD_HEIGHT + 232, 'arrows: navigate, enter: select, P: pause', PALETTE.dim, 14);
}

function helpOps(view, list) {
  rectOp(list, 'panel', Math.floor(view.width * 0.15), HUD_HEIGHT + 16, Math.floor(view.width * 0.7), 250, PALETTE.panel);
  const lines = [
    'quorum run',
    'pick up patches and carry up to three.',
    'merge them on a pad; once the level',
    'opens, leave through the exit.',
    'drifts patrol: carry and they scatter',
    'your patches; walk empty and a life.',
    'two drifts colliding leave a block.',
    'arrows or wasd move; P pauses; enter selects.',
  ];
  lines.forEach((line, i) => {
    textOp(list, 'help', Math.floor(view.width * 0.2), HUD_HEIGHT + 48 + i * 26, line, i === 0 ? PALETTE.accent : PALETTE.text, 16);
  });
  textOp(list, 'hint', Math.floor(view.width * 0.2), HUD_HEIGHT + 262, 'escape: back', PALETTE.dim, 14);
}

function overOps(view, list) {
  const w = view.width;
  const lost = S.menu.overLost !== false;
  rectOp(list, 'panel', Math.floor(w * 0.25), HUD_HEIGHT + 40, Math.floor(w * 0.5), 230, PALETTE.panel);
  textOp(list, 'over', Math.floor(w * 0.5) - 100, HUD_HEIGHT + 84, lost ? 'GAME OVER' : 'ALL MERGED', lost ? PALETTE.danger : PALETTE.accent, 24);
  textOp(list, 'over', Math.floor(w * 0.5) - 70, HUD_HEIGHT + 124, `SCORE ${formatScore(S.lastScore ?? 0)}`, PALETTE.text, 16);
  (S.scores.slice(0, 3)).forEach((entry, i) => {
    textOp(list, 'over', Math.floor(w * 0.5) - 70, HUD_HEIGHT + 156 + i * 22, `${i + 1}. ${entry.name} ${formatScore(entry.score)}`, PALETTE.dim, 14);
  });
  textOp(list, 'hint', Math.floor(w * 0.5) - 90, HUD_HEIGHT + 246, 'enter: back to title', PALETTE.dim, 14);
}

function editorOps(view, list) {
  const ed = S.editor;
  if (!ed) return;
  const map = ed.def.map;
  const rows = map.length;
  const cols = map[0].length;
  const inner = view.height - HUD_HEIGHT - 96;
  const cell = Math.max(4, Math.floor(Math.min((view.width - 80) / cols, inner / rows)));
  const ox = Math.floor((view.width - cols * cell) / 2);
  const oy = HUD_HEIGHT + 56 + Math.floor((inner - rows * cell) / 2);
  rectOp(list, 'panel', ox - 12, oy - 36, cols * cell + 24, rows * cell + 48, PALETTE.panel);
  map.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      const px = ox + x * cell;
      const py = oy + y * cell;
      if (ch === '#') rectOp(list, 'wall', px, py, cell, cell, PALETTE.wall);
      else if (ch === 'M') rectOp(list, 'pad', px + cell * 0.2, py + cell * 0.2, cell * 0.6, cell * 0.6, PALETTE.accent);
      else if (ch === 'P') rectOp(list, 'pad', px + cell * 0.3, py + cell * 0.3, cell * 0.4, cell * 0.4, PALETTE.dim);
      else if (ch === 'X') rectOp(list, 'pad', px + cell * 0.15, py + cell * 0.15, cell * 0.7, cell * 0.7, PALETTE.text);
      else if (ch === 'H') rectOp(list, 'pad', px + cell * 0.2, py + cell * 0.2, cell * 0.6, cell * 0.6, PALETTE.dim);
      else if (ch === '@') list.push({ op: 'circle', kind: 'player', x: px + cell * 0.5, y: py + cell * 0.5, r: Math.max(2, cell * 0.4), color: PALETTE.accent });
    }
  });
  const cx = ox + ed.x * cell;
  const cy = oy + ed.y * cell;
  rectOp(list, 'cursor', cx - cell * 0.2, cy - cell * 0.2, cell * 1.4, cell * 1.4, PALETTE.text);
  textOp(list, 'hint', ox, oy - 14,
    'arrows: cursor; enter: cycle tile; f: fill; space: test; shift+c/v save/load; p: back', PALETTE.dim, 14);
  (S.editorErrors || []).slice(0, 4).forEach((e, i) => {
    textOp(list, 'hint', ox, oy + rows * cell + 12 + i * 16, String(e), PALETTE.danger, 12);
  });
}

function draw(run, view, list) {
  const l = layout(run.game.level, view);
  for (const o of drawList(run.game, view)) list.push(o);
  for (const o of particleOps(run.particles || [], l)) list.push(o);
}

function render() {
  fitCanvas();
  const view = { width: canvas.width, height: canvas.height };
  const scr = S.menu.screen;
  const list = [];
  rectOp(list, 'bg', 0, 0, view.width, view.height, PALETTE.bg);
  if (scr === 'title' && S.attract) {
    draw({ game: S.attract, particles: [] }, view, list);
  } else if ((scr === 'playing' || scr === 'paused' || scr === 'over') && S.run) {
    draw(S.run, view, list);
  }
  if (scr === 'title') titleOps(view, list);
  else if (scr === 'help') helpOps(view, list);
  else if (scr === 'over') overOps(view, list);
  else if (scr === 'editor') editorOps(view, list);
  else if (scr === 'paused') {
    textOp(list, 'banner', Math.floor(view.width / 2) - 52, HUD_HEIGHT + Math.floor((view.height - HUD_HEIGHT) / 2), 'PAUSED', PALETTE.text, 24);
  }
  paint(screenCtx, list);
}

// ---- the loop ------------------------------------------------------------
// Steps on the beat the settings ask for (settings.speed: tickMs), paints
// at the display's rate, and catches up slowly after a background tab.
let last = 0;
function frame(ts) {
  window.requestAnimationFrame(frame);
  const interval = tickMs(S.settings) || TICK_MS;
  const now = typeof ts === 'number' ? ts : 0;
  if (!last) last = now;
  let due = Math.floor((now - last) / interval);
  if (due > 8) due = 8;
  for (let i = 0; i < due; i++) { last += interval; tick(); }
  pumpMusic();
  render();
}

startAttract();
window.requestAnimationFrame(frame);

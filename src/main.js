// Quorum Run — the browser entry (DESIGN.md §1, §15). The only module that
// touches the DOM, window, localStorage, or a real AudioContext; everything
// it uses is pure, so node can test the rest. Serve the repo and open
// index.html: this file wires the core, renderer, input, audio, and UI
// into a game — a title menu first, then the loop.

import { TICK_MS } from './core/constants.js';
import { init, step } from './core/game.js';
import { botInput } from './core/bot.js';
import { LEVELS } from './data/levels.js';
import { PALETTE } from './render/palette.js';
import { HUD_HEIGHT, layout, drawList, paint } from './render/draw.js';
import { particlesFor, stepParticles, particleOps } from './render/particles.js';
import { keyToInput, swipeToInput, queuePush, queueTake, attachKeyboard } from './input/keys.js';
import { cuesFor } from './audio/cues.js';
import { createAudio } from './audio/synth.js';
import { menuInit, menuReduce, menuItems } from './ui/menu.js';
import { addScore, formatScore, parseTable } from './ui/scores.js';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, tickMs } from './ui/settings.js';
import { dailySeed, generateLevel } from './core/generate.js';
import {
  editorInit, editorPaint, editorFill, editorResize, editorErrors,
  editorExport, editorImport,
} from './core/editor.js';
import { ACHIEVEMENTS, checkAchievements } from './core/achievements.js';
import { statsInit, statsUpdate, statsLines } from './core/stats.js';
import { bar, scheduleBar, tempo } from './audio/music.js';

// ---------- persisted bits ----------

const SETTINGS_KEY = 'quorum.run.settings';
const SCORES_KEY = 'quorum.run.scores';
const ACHIEVEMENTS_KEY = 'quorum.run.achievements';
const EDITOR_KEY = 'quorum.run.editor';

function storeGet(key, fallback) {
  try {
    return window.localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function storeSet(key, text) {
  try {
    window.localStorage.setItem(key, text);
  } catch {
    // storage may be unavailable (private mode); the game plays anyway
  }
}

// ---------- canvas ----------

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let view = { width: canvas.width, height: canvas.height };

function fit() {
  view = { width: Math.max(160, window.innerWidth), height: Math.max(120, window.innerHeight) };
  canvas.width = view.width;
  canvas.height = view.height;
}
fit();
window.addEventListener('resize', fit);

// ---------- state the page owns ----------

let settings;
try {
  settings = loadSettings(storeGet(SETTINGS_KEY, ''));
} catch {
  settings = { ...DEFAULT_SETTINGS };
}
if (!settings) settings = { ...DEFAULT_SETTINGS };

let scores = parseTable(storeGet(SCORES_KEY, '[]'));
if (!Array.isArray(scores)) scores = [];

let unlocked = [];
try {
  const ids = JSON.parse(storeGet(ACHIEVEMENTS_KEY, '[]'));
  if (Array.isArray(ids)) unlocked = ids.filter((x) => typeof x === 'string');
} catch {
  unlocked = [];
}

// Sound effects: the context is built lazily by the synth on the first
// audible play, which also keeps browsers happy about autoplay.
const AudioCtor = window.AudioContext || window.webkitAudioContext;
const audio = createAudio(AudioCtor);
audio.setMuted(!settings.sound);

let menu = menuInit(); // the title menu shows first
let demoSeed = 20250101;
let demo = null;
let state = null; // the played game
let queue = [];
let particles = [];
let particleSeed = randomSeed();
let stats = statsInit();
let editor = loadEditor(); // a persisted map, else a fresh 20x13
let brush = 0;
let lastCell = null;
let painting = false;
let origin = null; // where a touch swipe started
let flash = null; // { text, until }
let toastText = '';
let toastTicks = 0;

// The attract mode: a bot plays behind the title screen.
try {
  demo = init(demoSeed, { levels: LEVELS });
} catch (err) {
  demo = null;
  console.error('quorum run: demo did not start', err);
}

function loadEditor() {
  let def = null;
  try {
    def = editorImport(storeGet(EDITOR_KEY, ''));
  } catch {
    def = null;
  }
  return def ?? editorInit(20, 13);
}

// ---------- starting games ----------

function randomSeed() {
  return Math.floor(Math.random() * 4294967296) >>> 0;
}

function resetRun() {
  queue = [];
  particles = [];
  stats = statsInit();
}

function startRun(kind) {
  resetRun();
  if (kind === 'daily') {
    const date = new Date().toISOString().slice(0, 10);
    const seed = dailySeed(date);
    state = init(seed, { levels: [generateLevel(seed)] });
  } else {
    state = init(randomSeed(), { levels: LEVELS });
  }
}

function startCustomRun() {
  resetRun();
  try {
    state = init(randomSeed(), { levels: [editor] });
  } catch (err) {
    console.error('quorum run: custom level did not load', err);
    flash = { text: 'custom level did not load; starting a campaign', until: performance.now() + 3000 };
    state = init(randomSeed(), { levels: LEVELS });
  }
}

// ---------- sound and music ----------

function applySound(on) {
  audio.setMuted(!on);
  settings = { ...settings, sound: on };
  storeSet(SETTINGS_KEY, saveSettings(settings));
  if (on) musicStart();
  else musicStop();
}

// Background music: generated bars on their own context, started once a
// gesture happens (browsers refuse audio before one).
const music = { ctx: null, next: 0, index: 0, timer: null };

function musicStart() {
  if (music.timer || !settings.music || !AudioCtor) return;
  try {
    music.ctx = new AudioCtor();
  } catch {
    return;
  }
  music.next = music.ctx.currentTime + 0.1;
  music.index = 0;
  music.timer = setInterval(musicPump, 350);
}

function musicStop() {
  if (music.timer) clearInterval(music.timer);
  music.timer = null;
}

function musicPump() {
  if (!music.ctx) {
    musicStop();
    return;
  }
  try {
    const idx = state ? state.levelIndex : 0;
    const bpm = tempo(idx);
    const barSec = (30 / bpm) * 8; // eight steps of 30/bpm seconds
    const gain = 0.09 * settings.volume;
    if (music.next < music.ctx.currentTime) music.next = music.ctx.currentTime + 0.05;
    while (music.next < music.ctx.currentTime + 1.2) {
      scheduleBar(music.ctx, bar(idx, music.index), music.next, bpm, gain);
      music.index += 1;
      music.next += barSec;
    }
  } catch {
    musicStop(); // never let the music take the game down
  }
}

// ---------- player input ----------

function onInput(input) {
  musicStart();
  if (!input) return;
  const screen = menu.screen;
  if (screen === 'playing' || screen === 'paused') {
    if (input.pause) {
      // p and esc both read as pause: while playing they pause, from the
      // pause screen they quit to the title (enter or a tap resumes).
      menu = menuReduce(menu, screen === 'paused' ? 'back' : 'pause');
    } else {
      queue = queuePush(queue, input);
    }
  } else if (screen === 'title') {
    if (input.move) menu = menuReduce(menu, input.move); // up / down pick the item
  } else if (screen === 'help' || screen === 'editor') {
    // p and esc read as back on these screens
    if (input.pause) menu = menuReduce(menu, 'back');
  }
}

attachKeyboard(window, onInput); // lives as long as the page does

// Raw keys that keyToInput does not map: enter to pick, and the editor's
// own keys.
window.addEventListener('keydown', (ev) => {
  if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
  if (ev.key === 'Enter') {
    ev.preventDefault();
    musicStart();
    handleEnter();
    return;
  }
  if (menu.screen === 'editor' && applyEditorKey(ev.key)) ev.preventDefault();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && menu.screen === 'playing') menu = menuReduce(menu, 'pause');
});

// Touch and mouse on the canvas: taps and swipes play, drags paint in the
// editor.
canvas.addEventListener('pointerdown', (ev) => {
  musicStart();
  if (menu.screen !== 'editor') {
    if (ev.pointerType !== 'mouse') {
      origin = { x: ev.clientX, y: ev.clientY };
      ev.preventDefault();
    }
    return;
  }
  painting = true;
  paintAt(ev, ev.shiftKey);
  ev.preventDefault();
});

canvas.addEventListener('pointermove', (ev) => {
  if (menu.screen !== 'editor' || !painting || !(ev.buttons & 1)) return;
  paintAt(ev, false);
});

canvas.addEventListener('pointerup', (ev) => {
  if (menu.screen === 'editor') {
    painting = false;
    return;
  }
  if (!origin) return;
  const dx = ev.clientX - origin.x;
  const dy = ev.clientY - origin.y;
  origin = null;
  const input = swipeToInput(dx, dy);
  if (input) gesture(input);
  else handleEnter(); // a tap picks
});

function gesture(input) {
  const screen = menu.screen;
  if (screen === 'playing' || screen === 'paused') {
    queue = queuePush(queue, input);
  } else if (screen === 'title' && (input.move === 'up' || input.move === 'down')) {
    menu = menuReduce(menu, input.move);
  }
}

function handleEnter() {
  const screen = menu.screen;
  if (screen === 'editor') {
    const errs = editorErrors(editor);
    if (errs.length > 0) {
      flash = { text: 'fix the map first: ' + errs.join(', '), until: performance.now() + 3000 };
      return;
    }
    menu = menuReduce(menu, 'select'); // editor + select plays the custom level
    startCustomRun();
    return;
  }
  if (screen === 'title') {
    const before = menu;
    const next = menuReduce(menu, 'select');
    menu = next;
    if (next.screen === 'playing') startRun(next.mode === 'daily' ? 'daily' : 'campaign');
    if (next.screen === 'title' && next.sound !== before.sound) applySound(next.sound);
    return;
  }
  // paused, help, and over screens all go forward on select
  menu = menuReduce(menu, 'select');
}

// ---------- the level editor ----------

const BRUSHES = ['#', '.', 'P', 'M', 'X', 'H', '^', '>', 'v', '<'];

function editorFrame() {
  let w = 1;
  for (const row of editor.map) w = Math.max(w, row.length);
  return { width: w, height: editor.map.length };
}

function canvasPoint(ev) {
  const r = canvas.getBoundingClientRect();
  return { x: ev.clientX - r.left, y: ev.clientY - r.top };
}

function paintAt(ev, fill) {
  const p = canvasPoint(ev);
  const lo = layout(editorFrame(), view);
  if (!lo || lo.cell < 2) return;
  const cx = Math.floor((p.x - lo.ox) / lo.cell);
  const cy = Math.floor((p.y - lo.oy) / lo.cell);
  if (cy < 0 || cx < 0) return;
  const row = editor.map[cy];
  if (row === undefined || cx >= row.length) return;
  lastCell = { x: cx, y: cy };
  const ch = BRUSHES[brush];
  editor = fill ? editorFill(editor, cx, cy, ch) : editorPaint(editor, cx, cy, ch);
  storeSet(EDITOR_KEY, editorExport(editor));
}

function applyEditorKey(key) {
  const digit = '1234567890'.indexOf(key);
  if (digit >= 0) {
    brush = digit;
    return true;
  }
  switch (key) {
    case 'f': {
      if (lastCell) editor = editorFill(editor, lastCell.x, lastCell.y, BRUSHES[brush]);
      storeSet(EDITOR_KEY, editorExport(editor));
      return true;
    }
    case '[': {
      editor = editorResize(editor, editorFrame().width - 1, editor.map.length);
      storeSet(EDITOR_KEY, editorExport(editor));
      return true;
    }
    case ']': {
      editor = editorResize(editor, editorFrame().width + 1, editor.map.length);
      storeSet(EDITOR_KEY, editorExport(editor));
      return true;
    }
    case '-': {
      editor = editorResize(editor, editorFrame().width, editor.map.length - 1);
      storeSet(EDITOR_KEY, editorExport(editor));
      return true;
    }
    case '+':
    case '=': {
      editor = editorResize(editor, editorFrame().width, editor.map.length + 1);
      storeSet(EDITOR_KEY, editorExport(editor));
      return true;
    }
    case 'e': {
      const text = prompt('Quorum Run level JSON — edit and OK to import:', editorExport(editor));
      if (text === null) return true;
      const def = editorImport(text);
      if (def) {
        editor = def;
        flash = { text: 'level imported', until: performance.now() + 2500 };
      } else {
        flash = { text: 'that did not parse as a level', until: performance.now() + 2500 };
      }
      storeSet(EDITOR_KEY, editorExport(editor));
      return true;
    }
    case 'n': {
      const name = prompt('Name the level:', editor.name);
      if (name) editor = { ...editor, name: String(name).slice(0, 40) };
      storeSet(EDITOR_KEY, editorExport(editor));
      return true;
    }
    case 'q': {
      const v = parseInt(prompt('Merge patches needed to open the exits:', String(editor.quorum)), 10);
      if (v >= 1 && v <= 20) editor = { ...editor, quorum: v };
      storeSet(EDITOR_KEY, editorExport(editor));
      return true;
    }
    default:
      return false;
  }
}

// ---------- simulation (the clock) ----------

function tickAll() {
  const screen = menu.screen;
  if (screen === 'playing' && state && state.status === 'playing') tickPlayer();
  else if ((screen === 'title' || screen === 'help') && demo) tickDemo();
}

function tickPlayer() {
  const taken = queueTake(queue);
  queue = taken.queue;
  const prev = state;
  state = step(state, taken.input);
  const events = state.events;
  if (events.length) {
    for (const cue of cuesFor(events)) {
      try {
        audio.play(cue);
      } catch {
        // a bad synth day must not stop the run
      }
    }
    const made = particlesFor(state, particleSeed);
    particles = particles.concat(made.particles);
    particleSeed = made.seed >>> 0;
  }
  if (particles.length) particles = stepParticles(particles);
  const earned = checkAchievements(prev, state, unlocked);
  if (earned.length) {
    unlocked = unlocked.concat(earned);
    storeSet(ACHIEVEMENTS_KEY, JSON.stringify(unlocked));
    const got = ACHIEVEMENTS.find((a) => a.id === earned[0]);
    toastText = 'unlocked: ' + (got ? got.title : earned[0]);
    toastTicks = 20;
  }
  stats = statsUpdate(stats, prev, state, taken.input);
  if (toastTicks > 0) toastTicks -= 1;
  if (state.status !== 'playing') {
    scores = addScore(scores, { name: 'YOU', score: state.score });
    storeSet(SCORES_KEY, JSON.stringify(scores));
    menu = menuReduce(menu, 'gameover');
  }
}

function tickDemo() {
  try {
    demo = step(demo, botInput(demo));
    if (demo.status !== 'playing') {
      demoSeed = (demoSeed + 1) >>> 0;
      demo = init(demoSeed, { levels: LEVELS });
    }
  } catch (err) {
    console.error('quorum run: attract mode hiccup', err);
    demoSeed = (demoSeed + 1) >>> 0;
    try {
      demo = init(demoSeed, { levels: LEVELS });
    } catch {
      demo = null;
    }
  }
}

setInterval(tickAll, tickMs(settings) || TICK_MS);

// ---------- drawing (every frame) ----------

function uiText(text, x, y, color, size) {
  return { op: 'text', kind: 'ui', x, y, text, color, size };
}

function uiRect(x, y, w, h, color) {
  return { op: 'rect', kind: 'ui', x, y, w, h, color };
}

const HELP_LINES = [
  'the courier picks up patches at P points, carries up to three,',
  'and merges them on a pad M: 1 patch 100, 2 patches 400, 3 patches 900,',
  'plus 50 per patch when the colours match.',
  'meet the level quorum and the exit X and hold doors H open.',
  'reach the exit before par for a time bonus.',
  '',
  'drifts patrol the grid. touch a drift while carrying and you drop',
  'everything; touch one empty-handed and you lose a life.',
  'two drifts running into each other leave a conflict that blocks both.',
  '',
  'arrows or wasd move, p or esc pauses, enter picks.',
];

function render() {
  requestAnimationFrame(render);
  if (!ctx) return;
  ctx.textAlign = 'left';
  const screen = menu.screen;
  if (screen === 'title' || screen === 'help') {
    if (demo) paint(ctx, drawList(demo, view));
    else {
      ctx.fillStyle = PALETTE.bg;
      ctx.fillRect(0, 0, view.width, view.height);
    }
    paint(ctx, [uiRect(0, 0, view.width, view.height, 'rgba(17,17,17,0.78)')]);
    paint(ctx, screen === 'title' ? titleOps() : helpOps());
  } else if (screen === 'editor' && editor) {
    paint(ctx, editorOps());
  } else if ((screen === 'playing' || screen === 'paused') && state) {
    paint(ctx, drawList(state, view));
    if (particles.length) {
      try {
        paint(ctx, particleOps(particles, layout(state.level, view)));
      } catch {
        // particles are decoration only
      }
    }
    paint(ctx, playOps());
  } else if (screen === 'over' && state) {
    paint(ctx, drawList(state, view));
    paint(ctx, overOps());
  } else {
    ctx.fillStyle = PALETTE.bg;
    ctx.fillRect(0, 0, view.width, view.height);
  }
}

function titleOps() {
  const { width, height } = view;
  const x = Math.floor(width / 2);
  const ops = [];
  ops.push(uiText('QUORUM RUN', x, Math.floor(height * 0.2), PALETTE.accent, Math.min(46, Math.floor(width / 14))));
  ops.push(uiText('pick patches, merge them, ship the level', x, Math.floor(height * 0.2) + 28, PALETTE.dim, 14));
  const items = menuItems(menu);
  const top = Math.floor(height * 0.38);
  items.forEach((label, i) => {
    const sel = i === menu.selected;
    ops.push(uiText((sel ? '> ' : '') + label, x, top + i * 30, sel ? PALETTE.accent : PALETTE.text, 20));
  });
  if (scores.length) {
    ops.push(uiText('best ' + formatScore(scores[0].score), x, top + items.length * 30 + 10, PALETTE.dim, 14));
  }
  ops.push(uiText('arrows or wasd to pick, enter to play, swipe or tap on touch', x, height - 26, PALETTE.dim, 13));
  return ops;
}

function helpOps() {
  const { width, height } = view;
  const x = Math.floor(width / 2);
  const ops = [];
  ops.push(uiText('QUORUM RUN — how to play', x, Math.floor(height * 0.14), PALETTE.accent, 24));
  HELP_LINES.forEach((line, i) => {
    ops.push(uiText(line, x, Math.floor(height * 0.2) + i * 20, PALETTE.text, 14));
  });
  ops.push(uiText('enter or esc back', x, height - 26, PALETTE.dim, 13));
  return ops;
}

function playOps() {
  const { width, height } = view;
  const ops = [];
  ops.push(uiText(state.level.name, 8, height - 8, PALETTE.dim, 12));
  if (toastTicks > 0 && toastText) {
    ops.push(uiText(toastText, Math.floor(width / 2), Math.floor(height * 0.78), PALETTE.accent, 18));
  }
  if (menu.screen === 'paused') {
    ops.push(uiText('PAUSED', Math.floor(width / 2), Math.floor(height / 2), PALETTE.accent, 34));
    ops.push(uiText('enter resumes, esc quits to the title', Math.floor(width / 2), Math.floor(height / 2) + 30, PALETTE.dim, 14));
  }
  return ops;
}

function overOps() {
  const { width, height } = view;
  const x = Math.floor(width / 2);
  const won = state.status === 'won';
  const ops = [];
  ops.push(uiText(won ? 'ALL MERGED' : 'GAME OVER', x, Math.floor(height * 0.14), won ? PALETTE.accent : PALETTE.danger, 32));
  statsLines(stats).forEach((line, i) => {
    ops.push(uiText(line, x, Math.floor(height * 0.22) + i * 22, PALETTE.text, 16));
  });
  ops.push(uiText('best scores', x, Math.floor(height * 0.46), PALETTE.dim, 14));
  scores.slice(0, 5).forEach((entry, i) => {
    ops.push(uiText((i + 1) + '. ' + formatScore(entry.score) + '  ' + entry.name, x, Math.floor(height * 0.46) + 22 + i * 20, PALETTE.text, 15));
  });
  ops.push(uiText('enter: title', x, height - 26, PALETTE.dim, 13));
  return ops;
}

function editorOps() {
  const { width, height } = view;
  const ops = [];
  ops.push(uiText(editor.name + '  quorum ' + editor.quorum + '  par ' + editor.par, 8, HUD_HEIGHT + 12, PALETTE.text, 13));
  const errs = editorErrors(editor);
  ops.push(uiText(errs.length ? 'errors: ' + errs.join(', ') : 'map ok', 8, HUD_HEIGHT + 28, errs.length ? PALETTE.danger : PALETTE.dim, 13));
  const frame = editorFrame();
  const lo = layout(frame, view);
  if (lo && lo.cell > 2) {
    const { cell, ox, oy } = lo;
    ops.push(uiRect(ox - 2, oy - 2, frame.width * cell + 4, frame.height * cell + 4, PALETTE.panel));
    for (let y = 0; y < frame.height; y++) {
      const row = editor.map[y] || '';
      for (let x = 0; x < row.length; x++) {
        const ch = row[x];
        const px = ox + x * cell;
        const py = oy + y * cell;
        const midX = px + cell * 0.2;
        const midY = py + cell * 0.75;
        if (ch === '#') ops.push(uiRect(px, py, cell, cell, PALETTE.wall));
        else if (ch === '@') ops.push({ op: 'circle', kind: 'ui', x: px + cell / 2, y: py + cell / 2, r: Math.max(2, cell * 0.3), color: PALETTE.accent });
        else if (ch === 'P') ops.push({ op: 'circle', kind: 'ui', x: px + cell / 2, y: py + cell / 2, r: Math.max(2, cell * 0.25), color: PALETTE.agents[0] });
        else if (ch === 'M') ops.push(uiText('M', midX, midY, PALETTE.accent, Math.max(10, Math.floor(cell * 0.6))));
        else if (ch === 'X') ops.push(uiText('X', midX, midY, PALETTE.agents[3], Math.max(10, Math.floor(cell * 0.6))));
        else if (ch === 'H') ops.push(uiText('H', midX, midY, PALETTE.dim, Math.max(10, Math.floor(cell * 0.6))));
        else if (ch === '^' || ch === '>' || ch === 'v' || ch === '<') {
          ops.push(uiText(ch, midX, midY, PALETTE.danger, Math.max(10, Math.floor(cell * 0.6))));
        }
      }
    }
  }
  const legendBase = Math.max(120, width - BRUSHES.length * 24 - 10);
  BRUSHES.forEach((ch, i) => {
    const sel = i === brush;
    ops.push(uiText(sel ? '[' + ch + ']' : ' ' + ch, legendBase + i * 24, HUD_HEIGHT + 12, sel ? PALETTE.accent : PALETTE.dim, 13));
  });
  ops.push(uiText('click or drag paints (shift flood-fills), keys 1-9 0 pick a brush, f fill, [ ] width, - + height, e json, n name, q quorum, enter play, esc back', 8, height - 44, PALETTE.dim, 12));
  if (flash && flash.until > performance.now()) {
    ops.push(uiText(flash.text, 8, height - 24, PALETTE.accent, 13));
  }
  return ops;
}

requestAnimationFrame(render);

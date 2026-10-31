// Quorum Run — the browser entry point (DESIGN.md §1, §15): wires the core,
// renderer, input, audio, and UI modules together, steps the game every
// TICK_MS with the queued input, paints with drawList + paint on
// requestAnimationFrame, plays the cues of each step's events, and shows the
// title menu first, with a bot demo playing behind it.

import { TICK_MS } from './core/constants.js';
import { init, step } from './core/game.js';
import { botInput } from './core/bot.js';
import { dailySeed, generateLevel, hashSeed } from './core/generate.js';
import { editorInit, editorPaint, editorFill, editorErrors } from './core/editor.js';
import { checkAchievements, ACHIEVEMENTS } from './core/achievements.js';
import { statsInit, statsUpdate, statsLines } from './core/stats.js';
import { LEVELS } from './data/levels.js';
import { PALETTE } from './render/palette.js';
import { layout, drawList, paint } from './render/draw.js';
import { stepParticles, particlesFor, particleOps } from './render/particles.js';
import { keyToInput, swipeToInput, queuePush, queueTake, attachKeyboard } from './input/keys.js';
import { cuesFor } from './audio/cues.js';
import { createAudio } from './audio/synth.js';
import { bar, tempo, scheduleBar } from './audio/music.js';
import { menuInit, menuReduce, menuItems } from './ui/menu.js';
import { addScore, formatScore, parseTable } from './ui/scores.js';
import { loadSettings, saveSettings, tickMs } from './ui/settings.js';

// ----- the canvas -----------------------------------------------------------

const canvas = document.getElementById('game');
if (!canvas) throw new Error('Quorum Run needs a #game canvas');
const screen = canvas.getContext('2d');

function fit() {
  canvas.width = Math.max(320, window.innerWidth);
  canvas.height = Math.max(240, window.innerHeight);
}
fit();
window.addEventListener('resize', fit);

// ----- settings and scores (browser storage, guarded) -----------------------

const SETTINGS_KEY = 'quorumRun:settings';
const SCORES_KEY = 'quorumRun:scores';

function readStored(key) {
  try { return window.localStorage.getItem(key); } catch { return null; }
}
function writeStored(key, text) {
  try { window.localStorage.setItem(key, text); } catch { /* storage may be off */ }
}

let settings = loadSettings(readStored(SETTINGS_KEY));
let scores = parseTable(readStored(SCORES_KEY));
let soundOn = settings.sound;

function persistSettings() {
  writeStored(SETTINGS_KEY, saveSettings(settings));
}
function persistScores() {
  writeStored(SCORES_KEY, JSON.stringify(scores));
}

// ----- audio: cues on the game steps, a bar of generative music --------------

const audioCtor = typeof window.AudioContext === 'function' ? window.AudioContext : null;
let audio = null;      // the createAudio wrapper, made on the first gesture
let musicCtx = null;   // a context for the background music
let musicNext = 0;     // wall time the next bar starts at
let musicBar = 0;      // which bar of the loop comes next

function ensureAudio() {
  if (!audioCtor) return;
  if (!audio) {
    audio = createAudio(audioCtor);
    audio.setMuted(!soundOn);
  }
  if (!musicCtx) {
    try { musicCtx = new audioCtor(); musicNext = 0; musicBar = 0; } catch { musicCtx = null; }
  }
  for (const c of [audio, musicCtx]) {
    try { if (c && c.state === 'suspended') c.resume().catch(() => {}); } catch { /* ignore */ }
  }
}

function playCues(events) {
  if (!audio || audio.isMuted()) return;
  try {
    for (const cue of cuesFor(events)) audio.play(cue);
  } catch { /* audio must never take the frame down */ }
}

function scheduleMusic() {
  if (!musicCtx || !settings.music || !soundOn) return;
  if (menu.screen !== 'playing' || !state || state.paused || state.status !== 'playing') return;
  try {
    if (musicCtx.state === 'suspended') { musicCtx.resume().catch(() => {}); return; }
    const now = musicCtx.currentTime;
    if (musicNext < now) musicNext = now + 0.05;
    const bpm = tempo(state.levelIndex);
    const barSec = 8 * 30 / bpm;
    while (musicNext < now + 0.6) {
      scheduleBar(musicCtx, bar(state.levelIndex, musicBar), musicNext, bpm, settings.volume * 0.4);
      musicNext += barSec;
      musicBar += 1;
    }
  } catch { /* music must never take the frame down */ }
}

// ----- the game and the menu --------------------------------------------------

let menu = menuInit();
let queue = [];          // the input queue (see input/keys.js)
let state = null;        // the live game state, null while off the game
let prevState = null;    // the state one tick back, for achievements and stats
let stats = statsInit();
let unlocked = [];       // achievement ids earned this session
let toasts = [];         // newly earned achievements, { text, ttl }
let particles = [];
let particleSeed = 1;
let reportedOver = false;
let playMode = null;     // which mode the live state was built for

let attract = null;      // the bot demo behind the title screen
let attractAcc = 0;

let editorDef = editorInit(15, 11);
let editorBrush = '#';
let editorX = 1;
let editorY = 1;
const BRUSHES = ['#', '.', 'P', 'M', 'X', 'H', '@'];

function today() {
  const d = new Date();
  const two = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + two(d.getMonth() + 1) + '-' + two(d.getDate());
}

function randomSeed() {
  return Math.floor(Math.random() * 0x100000000) >>> 0;
}

function newGame(mode) {
  if (mode === 'daily') {
    const seed = dailySeed(today()) ?? randomSeed();
    return init(seed, { levels: [generateLevel(seed)], level: 0 });
  }
  if (mode === 'custom') {
    const seed = hashSeed('custom:' + today() + ':' + Date.now());
    return init(seed, { levels: [editorDef], level: 0 });
  }
  return init(randomSeed(), { levels: LEVELS });
}

function enterPlay(mode) {
  state = newGame(mode);
  playMode = mode;
  queue = [];
  prevState = null;
  stats = statsInit();
  unlocked = [];
  toasts = [];
  particles = [];
  reportedOver = false;
  particleSeed = (state.seed ^ 0x9e3779b9) >>> 0;
}

function spawnAttract() {
  try {
    attract = init(randomSeed(), { levels: LEVELS });
    attractAcc = 0;
  } catch { attract = null; }
}

// One menu action, plus the side effects the page owns around it.
function handleAction(action) {
  const before = menu;
  menu = menuReduce(menu, action);
  if (menu.sound !== before.sound) {
    soundOn = menu.sound;
    settings = { ...settings, sound: soundOn };
    persistSettings();
    if (audio) audio.setMuted(!soundOn);
  }
  if (menu.screen === 'playing' && (!state || menu.mode !== playMode)) {
    ensureAudio();
    enterPlay(menu.mode);
  }
  if (menu.screen === 'title') {
    state = null;
    queue = [];
    spawnAttract();
  }
}

function togglePause() {
  if (!state || state.status !== 'playing') return;
  queue = [];
  handleAction(state.paused ? 'pause' : 'pause');
  queue = [{ move: null, pause: true }];
}

// ----- input ------------------------------------------------------------------

function onInput(input) {
  if (!input) return;
  ensureAudio();
  if (menu.screen === 'playing') {
    if (input.pause) { togglePause(); return; }
    if (state && !state.paused && input.move) {
      queue = queuePush(queue, { move: input.move, pause: false });
    }
    return;
  }
  if (menu.screen === 'paused') {
    if (input.pause) togglePause();
    return;
  }
  if (input.pause) {
    handleAction(menu.screen === 'playing' ? 'pause' : 'back');
    return;
  }
  if (menu.screen === 'title' || menu.screen === 'help' || menu.screen === 'over') {
    if (input.move === 'up' || input.move === 'left') handleAction('up');
    else if (input.move === 'down' || input.move === 'right') handleAction('down');
    return;
  }
  if (menu.screen === 'editor') {
    const dirs = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };
    const d = dirs[input.move];
    if (d && editorDef.map) {
      const maxY = editorDef.map.length - 2;
      const maxX = editorDef.map[0].length - 2;
      editorX = Math.min(maxX, Math.max(1, editorX + d[0]));
      editorY = Math.min(maxY, Math.max(1, editorY + d[1]));
    }
  }
}

function onRawKey(event) {
  if (event.key === 'Enter' || event.key === ' ') {
    if (event.repeat) return;
    event.preventDefault();
    ensureAudio();
    handleAction('select');
  } else if (menu.screen === 'editor' && event.key >= '1' && event.key <= '7') {
    editorBrush = BRUSHES[Number(event.key) - 1] || '#';
  }
}

attachKeyboard(window, onInput);
window.addEventListener('keydown', onRawKey);

// Pointer: taps plus swipes on touch screens; clicks paint the level editor.
let touchStart = null;
let pointerDown = false;

function editorCell(event) {
  const lvl = { width: editorDef.map[0].length, height: editorDef.map.length };
  const l = layout(lvl, { width: canvas.width, height: canvas.height });
  const cx = Math.floor((event.clientX - l.ox) / l.cell);
  const cy = Math.floor((event.clientY - l.oy) / l.cell);
  if (cx < 1 || cy < 1 || cx > editorDef.map[0].length - 2 || cy > editorDef.map.length - 2) return null;
  return { x: cx, y: cy };
}

function brushAt(cell, flood) {
  if (flood) editorDef = editorFill(editorDef, cell.x, cell.y, editorBrush);
  else editorDef = editorPaint(editorDef, cell.x, cell.y, editorBrush);
}

canvas.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  pointerDown = true;
  touchStart = { x: event.clientX, y: event.clientY };
  ensureAudio();
  if (menu.screen !== 'editor') return;
  const cell = editorCell(event);
  if (cell && event.button === 0) brushAt(cell, false);
  if (cell && event.button === 2) brushAt(cell, true);
});

canvas.addEventListener('pointermove', (event) => {
  if (menu.screen === 'editor' && pointerDown) {
    const cell = editorCell(event);
    if (cell && event.buttons === 1) brushAt(cell, false);
  }
});

canvas.addEventListener('pointerup', (event) => {
  event.preventDefault();
  pointerDown = false;
  if (!touchStart) return;
  const dx = event.clientX - touchStart.x;
  const dy = event.clientY - touchStart.y;
  touchStart = null;
  const input = swipeToInput(dx, dy);
  if (menu.screen === 'playing') {
    if (input && state && !state.paused) queue = queuePush(queue, { move: input.move, pause: false });
  } else if (!input) {
    if (menu.screen === 'paused' || menu.screen === 'editor') return;
    handleAction('select');
  }
});
canvas.addEventListener('contextmenu', (event) => event.preventDefault());

// ----- one tick of the game -----------------------------------------------------

function advance() {
  const taken = queueTake(queue);
  queue = taken.queue;
  const input = taken.input;
  prevState = state;
  const next = step(state, input);
  state = next;

  playCues(next.events);
  particles = stepParticles(particles);
  const particleEvents = next.events.some((e) =>
    e === 'pickup' || e === 'merge' || e === 'drop' || e === 'hit' || e === 'conflict');
  if (particleEvents) {
    const made = particlesFor(next, particleSeed);
    particles = particles.concat(made.particles);
    particleSeed = made.seed;
  }
  if (prevState) {
    try {
      stats = statsUpdate(stats, prevState, next, input);
      const earned = checkAchievements(prevState, next, unlocked);
      for (const id of earned) {
        unlocked.push(id);
        const a = ACHIEVEMENTS.find((x) => x.id === id);
        if (a) toasts.push({ text: a.title, ttl: 3 });
      }
    } catch { /* stats and achievements must never stop the run */ }
  }

  if (next.status !== 'playing' && menu.screen === 'playing' && !reportedOver) {
    reportedOver = true;
    if (next.score > 0) {
      scores = addScore(scores, { name: playMode === 'daily' ? 'DAILY' : 'YOU', score: next.score });
      persistScores();
    }
    handleAction('gameover');
  }
}

function attractAdvance() {
  if (!attract) return;
  if (attract.status !== 'playing') { spawnAttract(); return; }
  const next = step(attract, botInput(attract));
  attract = next;
}

// ----- drawing --------------------------------------------------------------------

function text(str, x, y, size, color, align) {
  screen.fillStyle = color;
  screen.font = size + 'px "Courier New", monospace';
  screen.textAlign = align || 'left';
  screen.textBaseline = 'middle';
  screen.fillText(str, x, y);
}

function panel(x, y, w, h, alpha) {
  screen.save();
  screen.globalAlpha = alpha;
  screen.fillStyle = PALETTE.panel;
  screen.fillRect(x, y, w, h);
  screen.restore();
}

// ----- the loop ----------------------------------------------------------------

function frame(dt) {
  const view = { width: canvas.width, height: canvas.height };
  const interval = tickMs(settings) || TICK_MS;

  if (menu.screen === 'playing' && state) {
    acc += dt;
    if (acc > 2000) acc = interval; // a long stall steps once, not fifty times
    while (acc >= interval && state) {
      acc -= interval;
      try { advance(); } catch (err) { console.error('Quorum Run step error:', err); }
    }
    for (const t of toasts) t.ttl -= dt / 1000;
    toasts = toasts.filter((t) => t.ttl > 0);
  } else {
    acc = 0;
  }

  if (menu.screen === 'title') {
    if (!attract) spawnAttract();
    attractAcc += interval;
    while (attractAcc >= TICK_MS) {
      attractAcc -= TICK_MS;
      try { attractAdvance(); } catch { spawnAttract(); }
    }
  }

  scheduleMusic();

  try {
    if (menu.screen === 'playing' || menu.screen === 'paused' || menu.screen === 'over') {
      if (state) {
        const ops = drawList(state, view);
        if (particles.length) ops.push(...particleOps(particles, layout(state.level, view)));
        paint(screen, ops);
      }
    } else if (menu.screen === 'title' && attract) {
      paint(screen, drawList(attract, view));
    } else {
      paint(screen, drawList(state || attract, view));
    }
  } catch { fallBackPaint(view); }

  if (menu.screen === 'title') drawTitle(view);
  if (menu.screen === 'help') drawHelp(view);
  if (menu.screen === 'editor') drawEditor();
  if (menu.screen === 'over') drawOver();
  if (menu.screen === 'paused') text('PRESS P OR ESC', view.width / 2, view.height - 60, 16, PALETTE.dim, 'center');
  drawToasts();
}

function fallBackPaint(view) {
  screen.fillStyle = PALETTE.bg;
  screen.fillRect(0, 0, view.width, view.height);
  text('QUORUM RUN', view.width / 2, view.height / 2, 40, PALETTE.accent, 'center');
}

// note: drawTitle, drawHelp, drawEditor, drawOver, drawToasts live below.
function drawTitle(view) {
  const items = menuItems(menu);
  const cx = view.width / 2;
  const cy = view.height / 2;
  panel(cx - 190, cy - 170, 380, 340, 0.85);
  text('QUORUM RUN', cx, cy - 130, 36, PALETTE.accent, 'center');
  text('a courier puzzle', cx, cy - 96, 14, PALETTE.dim, 'center');
  for (let i = 0; i < items.length; i++) {
    const on = i === menu.selected;
    text((on ? '> ' : '  ') + items[i], cx - 150, cy - 50 + i * 34, 20,
      on ? PALETTE.accent : PALETTE.text);
  }
  if (scores.length) {
    text('BEST ' + formatScore(scores[0].score), cx, cy + 150, 14, PALETTE.dim, 'center');
  }
}

function drawHelp(view) {
  const cx = view.width / 2;
  panel(cx - 240, 80, 480, view.height - 200, 0.9);
  text('HOW TO PLAY', cx, 120, 28, PALETTE.accent, 'center');
  const lines = [
    'You are a courier agent on the grid.',
    'Patches appear at spawn points: fetch them.',
    'Carry up to three and merge them on a pad M.',
    'Merge until the quorum lands, then ship out at X.',
    '',
    'Drifts patrol: carrying patches a touch drops them;',
    'empty-handed a touch costs a life. Do not idle',
    'inside a conflict: nobody may pass while it burns.',
    '',
    'MOVE  arrows or WASD   PAUSE  P or Escape',
    'MENU  Enter selects, arrows pick, Esc goes back',
    'TOUCH swipe to move, tap to select',
  ];
  let y = 180;
  for (const line of lines) {
    text(line, cx, y, 16, line ? PALETTE.text : PALETTE.bg, 'center');
    y += 30;
  }
  text('SELECT or BACK to return', cx, view.height - 140, 14, PALETTE.dim, 'center');
}

function drawEditor() {
  const view = { width: canvas.width, height: canvas.height };
  const lvl = { width: editorDef.map[0].length, height: editorDef.map.length };
  const l = layout(lvl, view);
  paint(screen, drawEditorOps(l));
  const errors = editorErrors(editorDef);
  text('LEVEL EDITOR  brush: ' + BRUSHES.indexOf(editorBrush) + ' ' + editorBrush,
    l.ox, view.height - 64, 16, PALETTE.accent);
  text('click paints, right click floods, 1-7 change brush, Enter plays, Esc quits',
    l.ox, view.height - 40, 14, PALETTE.dim);
  if (errors.length) {
    text('errors: ' + errors.join(' '), l.ox, view.height - 88, 14, PALETTE.danger);
  }
}

function drawEditorOps(l) {
  const ops = [];
  ops.push({ op: 'rect', kind: 'bg', x: 0, y: 0, w: l.ox * 2 + l.cell * l.width, h: l.oy * 2 + l.cell * l.height, color: PALETTE.bg });
  const colors = { '#': PALETTE.wall, '.': PALETTE.floor, 'M': PALETTE.accent, 'X': PALETTE.accent, 'H': PALETTE.dim, 'P': PALETTE.dim,
    '@': PALETTE.accent, '^': PALETTE.danger, '>': PALETTE.danger, 'v': PALETTE.danger, '<': PALETTE.danger };
  for (let y = 0; y < editorDef.map.length; y++) {
    for (let x = 0; x < editorDef.map[y].length; x++) {
      const ch = editorDef.map[y][x];
      ops.push({ op: 'rect', kind: 'cell', x: l.ox + x * l.cell, y: l.oy + y * l.cell, w: l.cell, h: l.cell, color: colors[ch] || PALETTE.text });
      if (x === editorX && y === editorY) {
        ops.push({ op: 'rect', kind: 'cell', x: l.ox + x * l.cell, y: l.oy + y * l.cell, w: l.cell, h: l.cell, color: PALETTE.text });
      }
    }
  }
  return ops;
}

function drawOver() {
  if (!state) return;
  const view = { width: canvas.width, height: canvas.height };
  const cx = view.width / 2;
  panel(cx - 190, view.height / 2 - 150, 380, 300, 0.9);
  let y = view.height / 2 - 110;
  text(state.status === 'won' ? 'ALL MERGED' : 'GAME OVER', cx, y, 32,
    state.status === 'won' ? PALETTE.accent : PALETTE.danger, 'center');
  y += 46;
  text('SCORE ' + formatScore(state.score), cx, y, 22, PALETTE.text, 'center');
  y += 40;
  for (const line of statsLines(stats)) {
    text(line, cx, y, 16, PALETTE.dim, 'center');
    y += 28;
  }
  text('SELECT for the title', cx, y + 14, 14, PALETTE.accent, 'center');
}

function drawToasts() {
  let y = 74;
  for (const t of toasts) {
    screen.save();
    screen.globalAlpha = Math.min(1, t.ttl);
    text('* ' + t.text, canvas.width - 16, y, 16, PALETTE.accent, 'right');
    screen.restore();
    y += 26;
  }
}

// ----- the loop ----------------------------------------------------------------

let acc = 0;           // fixed-step accumulator for the step loop

function frameGuarded(now) {
  requestAnimationFrame(frameGuarded);
  if (frameGuarded.last === undefined) frameGuarded.last = now;
  const dt = now - frameGuarded.last;
  frameGuarded.last = now;
  if (dt > 250) return; // the tab was backgrounded: skip this beat
  try { frame(dt); } catch (err) {
    console.error('Quorum Run frame error:', err);
  }
}

requestAnimationFrame(frameGuarded);
spawnAttract();

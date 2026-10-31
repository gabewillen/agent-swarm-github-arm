// Quorum Run's browser entry: the only module that touches the DOM, the
// window, and AudioContext. It wires the game (§5-7) to the renderer (§11),
// input (§12), sound (§13), music (§24), menus (§14), settings (§17),
// particles (§23), statistics (§22), achievements (§21), the replay and
// daily-run machinery (§18, §19), and the level editor (§20), and shows the
// title menu first with a bot demo playing behind it (§15, §16).
import { TICK_MS } from './core/constants.js';
import { init, step } from './core/game.js';
import { LEVELS } from './data/levels.js';
import { botInput } from './core/bot.js';
import { dailySeed, generateLevel } from './core/generate.js';
import { checkAchievements, ACHIEVEMENTS } from './core/achievements.js';
import { editorInit, editorPaint, editorFill, editorResize, editorErrors } from './core/editor.js';
import { recordReplay, encodeReplay } from './core/replay.js';
import { statsInit, statsUpdate, statsLines } from './core/stats.js';
import { PALETTE } from './render/palette.js';
import { layout, drawList, paint } from './render/draw.js';
import { particlesFor, stepParticles, particleOps } from './render/particles.js';
import { keyToInput, swipeToInput, queuePush, queueTake, attachKeyboard } from './input/keys.js';
import { cuesFor } from './audio/cues.js';
import { createAudio } from './audio/synth.js';
import { tempo, bar, scheduleBar } from './audio/music.js';
import { menuInit, menuReduce, menuItems } from './ui/menu.js';
import { addScore, formatScore, parseTable } from './ui/scores.js';
import { loadSettings, saveSettings, tickMs } from './ui/settings.js';

const FONT = "'Courier New', ui-monospace, monospace";

// localStorage can throw in private modes; this hides that.
const store = {
  get(key, fallback) {
    try { return window.localStorage.getItem(key) ?? fallback; } catch { return fallback; }
  },
  set(key, value) {
    try { window.localStorage.setItem(key, value); } catch { /* keep playing */ }
  },
};

function loadJSONList(key) {
  try {
    const value = JSON.parse(store.get(key, '[]'));
    return Array.isArray(value) ? value : [];
  } catch { return []; }
}

const dayStamp = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// ---------- the canvas, the DOM, and the browser audio ----------

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const AudioCtor = window.AudioContext || window.webkitAudioContext;
const audio = AudioCtor ? createAudio(AudioCtor) : null;

let view = { width: canvas.width, height: canvas.height };
let displayScale = 1;
function resize() {
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  view = { width: window.innerWidth, height: window.innerHeight };
  canvas.width = Math.floor(view.width * dpr);
  canvas.height = Math.floor(view.height * dpr);
  canvas.style.width = `${view.width}px`;
  canvas.style.height = `${view.height}px`;
  displayScale = dpr;
  ctx.fillStyle = PALETTE.bg;
  ctx.fillRect(0, 0, view.width, view.height);
}
window.addEventListener('resize', resize);
resize();

// ---------- settings, high scores, and achievements ----------

let settings = loadSettings(store.get('qr-settings', '{}'));

function persistSettings() {
  store.set('qr-settings', saveSettings(settings));
}

function cadence() {
  const ms = tickMs(settings);
  return Number.isFinite(ms) && ms > 0 ? ms : TICK_MS;
}

const topScores = () => parseTable(store.get('qr-scores', '[]'));

function addFinalScore(score) {
  if (typeof score !== 'number' || score <= 0) return topScores();
  const table = addScore(topScores(), { name: 'YOU', score });
  store.set('qr-scores', JSON.stringify(table));
  return table;
}

function unlockedTitles(ids) {
  return ids
    .map((id) => ACHIEVEMENTS.find((a) => a.id === id))
    .filter(Boolean)
    .map((a) => a.title);
}

// ---------- the live state of the page ----------

let menu = menuInit();
let state = null; // the game's state while playing, paused, or over
let demo = null; // the attract-mode state behind the title
let particles = { list: [], seed: 1 }; // one particle pool per running game
let demoParticles = { list: [], seed: 1 };
let stats = statsInit();
let unlocked = []; // achievement ids already earned, across games
let inputQueue = []; // the queued inputs of §12
let inputsTaken = []; // one input per step taken, for the replay of §18
let editor = null; // { def, x, y, tool } while the editor screen is up
let toasts = []; // { text, until } achievement announcements
let finalTable = [];
let finalReplay = '';
let gameSeed = 1;
let gameLevels = LEVELS;
let music = null; // { ctx, barIndex, nextTime } once sound may play
let nextDemoAt = 0; // when a finished demo may restart

if (!settings.sound) menu = { ...menu, sound: false }; // §17 wins at boot
if (audio) audio.setMuted(!settings.sound);

// ---------- game and demo lifecycle ----------

function startGame(mode) {
  let seed = (Date.now() ^ Math.floor(Math.random() * 0x40000000)) >>> 0;
  let levels = LEVELS;
  if (mode === 'daily') {
    seed = dailySeed(dayStamp(new Date()));
    try {
      levels = [generateLevel(seed)];
    } catch {
      levels = LEVELS; // the daily run falls back to the campaign
    }
  } else if (mode === 'custom') {
    seed = (Date.now() >>> 0) || 1;
    levels = [editor.def];
  }
  gameSeed = seed >>> 0;
  gameLevels = levels;
  inputQueue = [];
  inputsTaken = [];
  particles = { list: [], seed: 1 };
  stats = statsInit();
  unlocked = loadJSONList('qr-achievements').filter((x) => typeof x === 'string');
  toasts = [];
  state = init(gameSeed, { levels });
  startMusic();
}

function startDemo() {
  demo = init((Math.random() * 0x100000000) >>> 0, { levels: LEVELS });
  demoParticles = { list: [], seed: 1 };
  nextDemoAt = 0;
}

function toastsPush(lines) {
  const until = performance.now() + 2600;
  for (const text of lines) toasts.push({ text, until });
  toasts = toasts.slice(-4);
}

// ---------- one step's consequences: particles, cues, stats, unlocks ----------

function fx(prev, next, bin) {
  const made = particlesFor(next, bin.seed);
  bin.seed = made.seed;
  bin.list = [
    ...stepParticles(bin.list),
    ...made.particles,
  ];
}

function handleStep(prev, next, input, bin) {
  fx(prev, next, bin);
  for (const cue of cuesFor(next.events)) {
    if (audio) audio.play(cue);
  }
  stats = statsUpdate(stats, prev, next, input);
  const gained = checkAchievements(prev, next, unlocked)
    .filter((id) => !unlocked.includes(id));
  if (gained.length) {
    unlocked = [...unlocked, ...gained];
    store.set('qr-achievements', JSON.stringify(unlocked));
    toastsPush(unlockedTitles(gained));
  }
  if (next.events.includes('pause') || next.events.includes('resume')) {
    if (menu.screen === 'playing' || menu.screen === 'paused') {
      menu = menuReduce(menu, 'pause');
    }
  }
  if (next.status !== 'playing') {
    finishGame(next);
  }
}

function finishGame(finalState) {
  finalTable = addFinalScore(finalState.score);
  try {
    const replay = recordReplay(gameSeed, inputsTaken, { levels: gameLevels, level: 0 });
    finalReplay = encodeReplay(replay);
    store.set('qr-last-replay', finalReplay);
  } catch {
    finalReplay = '';
  }
  menu = menuReduce(menu, 'gameover');
}

// ---------- the pump: one game step every tick ----------

function pump() {
  setTimeout(pump, cadence());
  if (menu.screen === 'playing' && state) {
    const taken = queueTake(inputQueue);
    inputQueue = taken.queue;
    inputsTaken.push(taken.input);
    const prev = state;
    state = step(prev, taken.input);
    handleStep(prev, state, taken.input, particles);
  } else if (menu.screen === 'title' && demo) {
    const prev = demo;
    demo = step(prev, botInput(prev));
    if (demo.status === 'playing') {
      fx(prev, demo, demoParticles);
    } else {
      if (nextDemoAt === 0) nextDemoAt = performance.now() + 1600;
      if (performance.now() >= nextDemoAt) startDemo();
    }
  }
}

// ---------- music, scheduled a bar at a time (§24) ----------

function startMusic() {
  if (!settings.music || !audio || music) return;
  try {
    const mctx = new AudioCtor();
    if (!mctx || typeof mctx.currentTime !== 'number') return;
    music = { ctx: mctx, barIndex: 0, nextTime: mctx.currentTime + 0.1 };
    if (mctx.state === 'suspended') Promise.resolve(mctx.resume()).catch(() => {});
    window.setInterval(scheduleAhead, 400);
  } catch {
    music = null; // a context that won't open is no reason to stop playing
  }
}

function scheduleAhead() {
  if (!music || menu.screen !== 'playing') return;
  const levelIndex = state ? state.levelIndex : 0;
  try {
    while (music.nextTime < music.ctx.currentTime + 1.2) {
      const bpm = tempo(levelIndex);
      scheduleBar(music.ctx, bar(levelIndex, music.barIndex), music.nextTime, bpm, settings.volume * 0.5);
      music.nextTime += 240 / bpm; // eight steps of 30 / bpm seconds each
      music.barIndex += 1;
    }
  } catch {
    music.nextTime = music.ctx.currentTime + 1.2;
  }
}

// ---------- menus and the keyboard (§14, §16) ----------

const PAINT_KEYS = new Set(['#', '.', '@', 'P', 'M', 'X', 'H', '^', '>', 'v', '<']);

const EDITOR_CURSOR = {
  ArrowLeft: [-1, 0], a: [-1, 0], A: [-1, 0],
  ArrowRight: [1, 0], d: [1, 0], D: [1, 0],
  ArrowUp: [0, -1], w: [0, -1], W: [0, -1],
  ArrowDown: [0, 1], s: [0, 1], S: [0, 1],
};

const RESIZE_KEYS = new Set(['[', ']', '-', '=', '+']);

window.addEventListener('keydown', (event) => {
  const screen = menu.screen;
  if (screen === 'playing' || screen === 'paused') {
    if (event.key === 'Enter') {
      event.preventDefault();
      inputQueue = queuePush(inputQueue, { move: null, pause: true });
    }
    return; // arrows, WASD, P, and Escape reach the game through attachKeyboard
  }
  if (screen === 'over') {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      menu = menuReduce(menu, 'select');
    }
    return;
  }
  if (screen === 'editor' && editor) {
    const def = editor.def;
    if (PAINT_KEYS.has(event.key)) {
      editor.def = editorPaint(def, editor.x, editor.y, event.key);
      editor.tool = event.key;
      event.preventDefault();
      return;
    }
    if (event.key === 'f' || event.key === 'F') {
      editor.def = editorFill(def, editor.x, editor.y, editor.tool);
      event.preventDefault();
      return;
    }
    if (RESIZE_KEYS.has(event.key)) {
      const wide = event.key === ']' ? def.map[0].length + 1
        : event.key === '[' ? def.map[0].length - 1
        : def.map[0].length;
      const high = event.key === '=' || event.key === '+' ? def.map.length + 1
        : event.key === '-' ? def.map.length - 1
        : def.map.length;
      editor.def = editorResize(def, wide, high);
      editor.x = Math.min(editor.x, wide - 2);
      editor.y = Math.min(editor.y, high - 2);
      event.preventDefault();
      return;
    }
    const cursor = EDITOR_CURSOR[event.key];
    if (cursor) {
      editor.x = Math.min(def.map[0].length - 2, Math.max(1, editor.x + cursor[0]));
      editor.y = Math.min(def.map.length - 2, Math.max(1, editor.y + cursor[1]));
      event.preventDefault();
      return;
    }
    // Enter and Escape fall through to the menu actions below.
  }
  // A menu action from a key: Enter or a tap is select; keyToInput (§12)
  // supplies the rest - up and down walk the items, everything else backs
  // out or is left unhandled.
  const mapped = keyToInput(event.key);
  const action = event.key === 'Enter' || event.key === ' '
    ? 'select'
    : mapped && mapped.move ? mapped.move
    : mapped && mapped.pause ? 'back'
    : null;
  if (action) {
    event.preventDefault();
    act(action);
  }
});

const detachKeys = attachKeyboard(window, (input) => {
  if (menu.screen === 'playing' || menu.screen === 'paused') {
    inputQueue = queuePush(inputQueue, input);
  }
});

function act(action) {
  if (menu.screen === 'title' && action === 'select') {
    const items = menuItems(menu);
    const pick = items[Math.max(0, Math.min(items.length - 1, menu.selected))];
    if (pick === 'Level editor' && editor && editorErrors(editor.def).length > 0) {
      toastsPush(['fix the level errors first']);
      return;
    }
  }
  const before = menu;
  const after = menuReduce(before, action);
  menu = after;
  if (before.sound !== after.sound) {
    if (audio) audio.setMuted(!after.sound);
    settings = { ...settings, sound: after.sound };
    persistSettings();
  }
  if (before.screen !== 'editor' && after.screen === 'editor') {
    if (!editor) editor = { ...blankEditor(), x: 2, y: 2 };
    editor.x = 1;
    editor.y = 1;
  }
  if (before.screen !== 'title' && after.screen === 'title') {
    startDemo(); // a fresh attract run behind the menu
  }
  if (before.screen !== 'editor' && before.screen !== 'title' && after.screen === 'playing') {
    startGame(after.mode);
  } else if (before.screen === 'editor' && after.screen === 'playing') {
    startGame('custom');
  }
}

function blankEditor() {
  return { def: editorInit(15, 11), tool: 'P' };
}

// ---------- touch: swipe to move, tap to select (§16) ----------

let touchStart = null;
canvas.addEventListener('touchstart', (event) => {
  event.preventDefault();
  touchStart = event.changedTouches[0];
}, { passive: false });

canvas.addEventListener('touchend', (event) => {
  event.preventDefault();
  const end = event.changedTouches[0];
  const start = touchStart;
  touchStart = null;
  if (!start || !end) return;
  const input = swipeToInput(end.clientX - start.clientX, end.clientY - start.clientY);
  const screen = menu.screen;
  if (input && (input.move === 'up' || input.move === 'down') && (screen === 'title' || screen === 'help')) {
    act(input.move); // swiping the menu walks its items
  } else if (input) {
    inputQueue = queuePush(inputQueue, input);
  } else if (screen === 'title' || screen === 'help') {
    act('select'); // a tap selects
  } else if (screen === 'paused') {
    inputQueue = queuePush(inputQueue, { move: null, pause: true });
  } else if (screen === 'over') {
    menu = menuReduce(menu, 'select');
  }
}, { passive: false });

// ---------- drawing ----------

function drawText(text, x, y, size, color, align = 'center') {
  ctx.font = `${size}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.fillText(text, x, y);
  ctx.textAlign = 'left';
}

function dimDemo() {
  paint(ctx, [
    ...drawList(demo, view),
    ...particleOps(demoParticles.list, layout(demo.level, view)),
  ]);
  ctx.globalAlpha = 0.82;
  ctx.fillStyle = PALETTE.bg;
  ctx.fillRect(0, 0, view.width, view.height);
  ctx.globalAlpha = 1;
}

const HELP = [
  'You are a courier agent on the grid.',
  'Walk over patches at the spawn points (P) to pick them up.',
  'Carry up to three and step on a merge pad (M) to merge them.',
  'Merge the level quorum and the hold doors and exit open.',
  'Walk to the exit (X) to ship the level.',
  '',
  'Drifts patrol. Touch one while carrying and you drop everything;',
  'touch one empty-handed and you lose a life. Two drifts that',
  'collide leave a block of conflict nobody can pass for a while.',
  '',
  'Arrow keys or WASD move. P or Escape pauses. Enter selects.',
  'On touch screens: swipe to move, tap to select. A daily run',
  'below the Play item ships one generated level a day.',
];

function draw() {
  requestAnimationFrame(draw);
  ctx.setTransform(displayScale, 0, 0, displayScale, 0, 0);
  const now = performance.now();
  toasts = toasts.filter((toast) => toast.until > now);

  const screen = menu.screen;
  if (screen === 'title') {
    if (demo) dimDemo();
    const cx = Math.floor(view.width / 2);
    let y = Math.floor(view.height * 0.30);
    drawText('QUORUM RUN', cx, y, 34, PALETTE.accent);
    y += 40;
    drawText('pick up, merge, ship', cx, y, 13, PALETTE.dim);
    y += 48;
    const items = menuItems(menu);
    for (let i = 0; i < items.length; i += 1) {
      const picked = i === menu.selected;
      drawText(picked ? `> ${items[i]}` : `  ${items[i]}`, cx, y, 18, picked ? PALETTE.accent : PALETTE.text);
      y += 28;
    }
    y += 16;
    const top = topScores()[0];
    drawText(top ? `BEST ${formatScore(top.score)}  by ${top.name}` : 'no ship yet - be the first',
      cx, y, 13, PALETTE.dim);
  } else if (screen === 'help') {
    ctx.fillStyle = PALETTE.bg;
    ctx.fillRect(0, 0, view.width, view.height);
    let y = Math.floor(view.height * 0.14);
    drawText('HOW TO PLAY', Math.floor(view.width / 2), y, 24, PALETTE.accent);
    y += 44;
    for (const line of HELP) {
      drawText(line, 64, y, 15, PALETTE.text, 'left');
      y += 26;
    }
    y += 16;
    drawText('BACK: Escape', Math.floor(view.width / 2), y, 14, PALETTE.dim);
  } else if (screen === 'editor') {
    drawEditor();
  } else if (state) {
    drawGame(state);
    if (screen === 'paused') {
      drawText('PAUSED', Math.floor(view.width / 2), Math.floor(view.height / 2) - 60, 30, PALETTE.accent);
      drawText('P resumes - Escape leaves to the title', Math.floor(view.width / 2),
        Math.floor(view.height / 2) - 30, 14, PALETTE.dim);
    }
    if (screen === 'over') drawOver();
  }

  let ty = view.height - (toasts.length + 1) * 20 - 16;
  for (const toast of toasts) {
    const left = Math.round((toast.until - now) / 12);
    drawText(`* ${toast.text}`, 14, ty, 14, left > 90 ? PALETTE.accent : PALETTE.dim, 'left');
    ty += 20;
  }
}

const TILE_COLORS = (ch) =>
  ch === '#' ? PALETTE.wall
  : ch === 'M' ? PALETTE.panel
  : ch === '@' ? PALETTE.accent
  : ch === 'P' ? PALETTE.agents[0]
  : ch === '^' || ch === '>' || ch === 'v' || ch === '<' ? PALETTE.danger
  : PALETTE.floor;

const TILE_NAMES = {
  '@': 'you', P: 'spawn', M: 'merge', X: 'exit', H: 'hold',
  '^': 'drift up', '>': 'drift right', v: 'drift down', '<': 'drift left',
};

function drawEditor() {
  ctx.fillStyle = PALETTE.bg;
  ctx.fillRect(0, 0, view.width, view.height);
  const def = editor.def;
  const rows = def.map;
  const cols = rows[0].length;
  const top = 88;
  const cell = Math.max(8, Math.floor(Math.min((view.width - 40) / cols,
    (view.height - top - 96) / rows.length)));
  const ox = Math.floor((view.width - cell * cols) / 2);
  const oy = top + Math.floor((view.height - top - 96 - cell * rows.length) / 2);
  for (let y = 0; y < rows.length; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      ctx.fillStyle = TILE_COLORS(rows[y][x]);
      ctx.fillRect(ox + x * cell, oy + y * cell, cell - 1, cell - 1);
    }
  }
  ctx.strokeStyle = PALETTE.accent;
  ctx.lineWidth = 2;
  ctx.strokeRect(ox + editor.x * cell - 2, oy + editor.y * cell - 2, cell + 2, cell + 2);
  const errors = editorErrors(def);
  const head = errors.length
    ? `EDITOR - errors: ${errors.length} (${errors.slice(0, 2).join(', ')})`
    : 'EDITOR - no errors';
  drawText(head, 16, 28, 14, errors.length ? PALETTE.danger : PALETTE.text, 'left');
  drawText('paint: # . @ P M X H ^ > v <    fill: F    grow: ] [ - =    play: Enter    title: Escape',
    16, 48, 12, PALETTE.dim, 'left');
  const named = TILE_NAMES[editor.tool] ? ` (${TILE_NAMES[editor.tool]})` : '';
  drawText(`tool: ${editor.tool}${named}`, 16, view.height - 14, 13, PALETTE.dim, 'left');
}

function drawGame(as) {
  paint(ctx, [
    ...drawList(as, view),
    ...particleOps(particles.list, layout(as.level, view)),
  ]);
  ctx.fillStyle = PALETTE.dim;
  ctx.font = `12px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.fillText(`${(menu.mode ?? 'campaign').toUpperCase()}   LEVEL ${as.levelIndex + 1}`,
    view.width - 12, view.height - 12);
  ctx.textAlign = 'left';
}

function drawOver() {
  const cx = Math.floor(view.width / 2);
  let y = Math.floor(view.height * 0.30);
  drawText(state.status === 'won' ? 'ALL SHIPPED' : 'GAME OVER', cx, y, 22, PALETTE.accent);
  y += 34;
  drawText(`SCORE ${formatScore(state.score)}`, cx, y, 18, PALETTE.text);
  y += 26;
  for (const line of statsLines(stats)) {
    drawText(line, cx, y, 14, PALETTE.text);
    y += 20;
  }
  y += 6;
  const best = finalTable[0];
  drawText(best ? `TABLE BEST ${formatScore(best.score)}` : '', cx, y, 13, PALETTE.dim);
  y += 44;
  drawText(`unlocks ${unlocked.length}/${ACHIEVEMENTS.length}`, cx, y, 13, PALETTE.dim);
  if (finalReplay) {
    y += 22;
    drawText(`replay ${finalReplay.slice(0, 44)}${finalReplay.length > 44 ? '...' : ''}`,
      cx, y, 11, PALETTE.dim);
  }
  y += 32;
  drawText('ENTER - TITLE', cx, y, 15, PALETTE.text);
}

// ---------- lift off: the title menu first, a demo behind it ----------

startDemo();
pump();
requestAnimationFrame(draw);

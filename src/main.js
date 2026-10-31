// Quorum Run — the browser entry point (DESIGN.md §15).
// The one module that touches the DOM: it wires the core, renderer, input,
// audio, and UI together, runs one step every TICK_MS with the queued
// input, paints drawList ops on requestAnimationFrame, plays cuesFor of
// each step's events, and shows the title menu first. The bot plays an
// attract-mode demo behind the title screen.
import { TICK_MS } from './core/constants.js';
import { init, step } from './core/game.js';
import { LEVELS } from './data/levels.js';
import { layout, drawList, paint } from './render/draw.js';
import { PALETTE } from './render/palette.js';
import {
  keyToInput, swipeToInput, queuePush, queueTake, attachKeyboard,
} from './input/keys.js';
import { cuesFor } from './audio/cues.js';
import { createAudio } from './audio/synth.js';
import { tempo, bar, scheduleBar } from './audio/music.js';
import { menuInit, menuReduce, menuItems } from './ui/menu.js';
import { addScore, formatScore, parseTable } from './ui/scores.js';
import { loadSettings, saveSettings, tickMs } from './ui/settings.js';
import { botInput } from './core/bot.js';
import { dailySeed, generateLevel } from './core/generate.js';
import {
  editorInit, editorPaint, editorFill, editorResize, editorErrors,
  editorExport, editorImport,
} from './core/editor.js';
import { checkState } from './core/invariants.js';
import { statsInit, statsUpdate, statsLines } from './core/stats.js';
import { ACHIEVEMENTS, checkAchievements } from './core/achievements.js';
import { stepParticles, particlesFor, particleOps } from './render/particles.js';

// ---------------------------------------------------------------- the page
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

function viewNow() {
  return { width: canvas.width, height: canvas.height };
}

function resize() {
  canvas.width = Math.max(320, window.innerWidth);
  canvas.height = Math.max(240, window.innerHeight);
}
window.addEventListener('resize', resize);
resize();

// ---------------------------------------------------------- stored settings
const SETTINGS_KEY = 'quorum-run-settings';
const SCORES_KEY = 'quorum-run-scores';
const ACH_KEY = 'quorum-run-achievements';

function storedText(key, fallback) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function storeText(key, text) {
  try {
    localStorage.setItem(key, text);
  } catch {
    /* private mode or full quota: play without it */
  }
}

let settings = loadSettings(storedText(SETTINGS_KEY, ''));

function persistSettings() {
  storeText(SETTINGS_KEY, saveSettings(settings));
}

// ------------------------------------------------------------------- audio
const AudioCtor = typeof window !== 'undefined' && window.AudioContext
  ? window.AudioContext
  : typeof window !== 'undefined' && window.webkitAudioContext
    ? window.webkitAudioContext
    : null;
const audio = createAudio(AudioCtor);

let musicCtx = null;
let musicTried = false;
let nextBar = 0;
let barIndex = 0;

// AudioContexts may only open after a user gesture.
function gesture() {
  if (!musicTried) {
    musicTried = true;
    try {
      musicCtx = AudioCtor ? new AudioCtor() : null;
    } catch {
      musicCtx = null;
    }
  }
  if (musicCtx && typeof musicCtx.resume === 'function' && musicCtx.state === 'suspended') {
    try {
      musicCtx.resume().catch(() => {});
    } catch {
      /* ignore */
    }
  }
}

function musicFrame() {
  const playing = menu.screen === 'playing' || menu.screen === 'paused';
  if (!musicCtx || !game || !settings.music || !playing) {
    if (musicCtx) nextBar = musicCtx.currentTime + 0.1;
    return;
  }
  if (nextBar < musicCtx.currentTime) nextBar = musicCtx.currentTime + 0.05;
  const bpm = tempo(game.levelIndex);
  const length = 240 / bpm; // a bar holds 8 steps of 30/bpm seconds
  while (nextBar < musicCtx.currentTime + 1.2) {
    scheduleBar(musicCtx, bar(game.levelIndex, barIndex), nextBar, bpm, 0.2 * settings.volume);
    barIndex = (barIndex + 1) >>> 0;
    nextBar += length;
  }
}

// ------------------------------------------------------- menus and the game
let menu = menuInit();
let game = null; // the current game state, on the playing screens
let queue = [];
let stats = statsInit();
let particles = [];
let particleSeed = 0x2f6e2b1;
let toasts = []; // recently earned achievements
let overScores = null; // the score table frozen when the run ended
let demo = null; // attract mode state behind the title screen
let demoSeed = (Math.random() * 4294967296) >>> 0;

let unlocked = loadAch();
function loadAch() {
  try {
    const v = JSON.parse(storedText(ACH_KEY, '[]'));
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

let customDef = editorInit(15, 11); // the level the editor works on
let armCh = 'P'; // the editor's armed cell character
let armFill = false;
const ARM_PALETTE = ['#', '.', 'P', 'M', 'H', '@', 'X', '^', '>', 'v', '<'];
const ARM_KEYS = { 1: '#', 2: '.', 3: 'P', 4: 'M', 5: 'H', 6: '@', 7: 'X', 8: '^', 9: '>', 0: 'v', '-': '<' };
let mouse = { x: -1, y: -1 };

// Reduce the menu and keep its sound field in step with the settings.
function reduceMenu(action) {
  menu = menuReduce(menu, action);
  if (menu.sound !== settings.sound) {
    settings = { ...settings, sound: menu.sound };
    audio.setMuted(!settings.sound);
    persistSettings();
  }
}

function leaveGame() {
  game = null;
  queue = [];
  particles = [];
  overScores = null;
  stats = statsInit();
}

function newDemo() {
  demoSeed = (demoSeed + 0x9e3779b9) >>> 0;
  demo = init(demoSeed, { levels: LEVELS });
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function recordScore(score) {
  const table = addScore(parseTable(storedText(SCORES_KEY, '[]')), { name: 'YOU', score });
  storeText(SCORES_KEY, JSON.stringify(table));
  return table;
}

// Start a run of a mode: 'campaign', 'daily', or 'custom' (the editor level).
function startGame(mode) {
  try {
    if (mode === 'campaign') {
      game = init((Math.random() * 4294967296) >>> 0, { levels: LEVELS });
    } else if (mode === 'daily') {
      const seed = dailySeed(todayStr()) ?? ((Math.random() * 4294967296) >>> 0);
      game = init(seed, { levels: [generateLevel(seed)] });
    } else {
      game = init((Math.random() * 4294967296) >>> 0, { levels: [customDef] });
    }
  } catch {
    leaveGame();
    return;
  }
  queue = [];
  particles = [];
  stats = statsInit();
  overScores = null;
  toasts = [];
  barIndex = game.levelIndex >>> 0;
}

// Selecting on the title screen starts the chosen mode.
function selectTitle() {
  reduceMenu('select');
  if (menu.screen === 'playing') startGame(menu.mode);
}

// ----------------------------------------------------------------- the tick
// One game step: take an input from the queue, step the rules, and let the
// sound, particles, statistics, and achievements of the step follow.
function gameTick() {
  const prev = game;
  const taker = queueTake(queue);
  queue = taker.queue;
  const input = taker.input;

  const next = step(game, input);
  playStep(prev, next);
  game = next;

  // Keep the menu in step with the pause key and the end of a run.
  if (game.paused && menu.screen === 'playing') {
    menu = menuReduce(menu, 'pause');
  } else if (!game.paused && menu.screen === 'paused') {
    menu = menuReduce(menu, 'select');
  } else if (game.status !== 'playing' && menu.screen === 'playing') {
    menu = menuReduce(menu, 'gameover');
    overScores = recordScore(game.score);
  }

  stats = statsUpdate(stats, prev, game, input);

  const fresh = checkAchievements(prev, game, unlocked);
  if (fresh.length) {
    unlocked = unlocked.concat(fresh);
    storeText(ACH_KEY, JSON.stringify(unlocked));
    const until = performance.now() + 3000;
    for (const id of fresh) toasts.push({ id, until });
    audio.play('fanfare');
  }

  const broken = checkState(game);
  if (broken.length) console.warn('Quorum Run invariants:', broken.join(', '));
}

function playStep(prev, next) {
  for (const cue of cuesFor(next.events)) audio.play(cue);
  const made = particlesFor(next, particleSeed);
  particleSeed = made.seed;
  if (made.particles.length) particles = particles.concat(made.particles);
}

function demoTick() {
  let a = null;
  try {
    a = botInput(demo);
  } catch {
    a = null;
  }
  demo = step(demo, a ?? { move: null, pause: false });
  if (demo.status !== 'playing') newDemo();
}

// ---------------------------------------------------------------- the frame
let last = performance.now();
let acc = 0;

function frame(now) {
  const ms = tickMs(settings) || TICK_MS;
  acc += Math.min(now - last, 250);
  last = now;
  let ran = 0;
  while (acc >= ms) {
    acc -= ms;
    // The rules step while the game is on screen (a paused state returns
    // with empty events), and the bot plays behind the title menu.
    if (game && (menu.screen === 'playing' || menu.screen === 'paused')) gameTick();
    if (demo && menu.screen === 'title') demoTick();
    if (++ran >= 4) {
      acc = 0;
      break;
    }
  }
  if (particles.length) particles = stepParticles(particles);
  toasts = toasts.filter((t) => t.until > now);
  musicFrame();
  render(now);
  requestAnimationFrame(frame);
}

// --------------------------------------------------------------- rendering
function bg(v) {
  ctx.fillStyle = PALETTE.bg;
  ctx.fillRect(0, 0, v.width, v.height);
}

function txt(text, x, y, size, color, align = 'left') {
  ctx.fillStyle = color;
  ctx.font = `${size}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, x, y);
  ctx.textAlign = 'left';
}

function achievementToast(v) {
  const now = performance.now();
  let y = v.height - 84;
  for (const t of toasts.slice(-2)) {
    const a = ACHIEVEMENTS.find((x) => x.id === t.id);
    if (!a) continue;
    const left = t.until - now;
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, left / 600));
    txt(`ACHIEVEMENT \u00b7 ${a.title}`, v.width / 2, y, 14, PALETTE.accent, 'center');
    ctx.restore();
    y -= 22;
  }
}

function dimmedBoard(v, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  paint(ctx, drawList(game, v));
  ctx.restore();
}

function render(now) {
  const v = viewNow();
  bg(v);
  const screen = menu.screen;
  if (screen === 'playing' || screen === 'paused') renderGame(v);
  else if (screen === 'title') renderTitle(v);
  else if (screen === 'help') renderHelp(v);
  else if (screen === 'editor') renderEditor(v);
  else if (screen === 'over') renderOver(v);
}

function renderGame(v) {
  if (!game) return;
  paint(ctx, drawList(game, v));
  if (particles.length) {
    paint(ctx, particleOps(particles, layout(game.level, v)));
  }
  if (menu.screen === 'paused') {
    txt('P RESUME \u00b7 ESC TITLE', v.width / 2, v.height - 16, 13, PALETTE.dim, 'center');
  }
  if (game.status !== 'playing') {
    txt(game.status === 'won' ? 'ALL SHIPPED' : 'GAME OVER', v.width / 2, v.height * 0.2, 24, PALETTE.accent, 'center');
  }
}

// The title screen's item rows, shared with the click hit test.
function titleRows(v) {
  const count = menuItems(menu).length;
  const rowH = Math.max(26, Math.round(v.height / 18));
  return { top: Math.round(v.height * 0.44), rowH, mid: v.width / 2, count };
}

function renderTitle(v) {
  if (demo) {
    ctx.save();
    ctx.globalAlpha = 0.32;
    paint(ctx, drawList(demo, v));
    ctx.restore();
  }
  const mid = v.width / 2;
  const big = Math.min(46, v.width / 11);
  txt('QUORUM', mid - big * 0.8, v.height * 0.27, big, PALETTE.accent, 'right');
  txt('RUN', mid + big * 0.8, v.height * 0.27, big, PALETTE.text, 'left');
  txt('A COURIER PUZZLE FOR THE SWARM', mid, v.height * 0.27 + 26, 12, PALETTE.dim, 'center');

  const rows = titleRows(v);
  const items = menuItems(menu);
  for (let i = 0; i < items.length; i++) {
    const sel = i === menu.selected;
    txt((sel ? '\u25b8 ' : '  ') + items[i], mid, rows.top + i * rows.rowH, 17, sel ? PALETTE.accent : PALETTE.dim, 'center');
  }

  const table = parseTable(storedText(SCORES_KEY, '[]'));
  if (table.length) {
    const best = table.slice(0, 3).map((e) => formatScore(e.score)).join('   ');
    txt('BEST ' + best, mid, v.height - 96, 13, PALETTE.dim, 'center');
  }
  txt('ARROWS / WASD MOVE \u00b7 P PAUSE \u00b7 ENTER SELECT \u00b7 M SOUND', mid, v.height - 44, 13, PALETTE.dim, 'center');
  achievementToast(v);
}

const HELP_LINES = [
  ['You are a courier agent on a grid.', PALETTE.text],
  ['Patches appear on spawn points; walk over one to pick it up,', PALETTE.text],
  ['carry up to three, and stand on a merge pad (M) to merge them.', PALETTE.text],
  ['', PALETTE.dim],
  ['Merge the level\u2019s quorum and the exit (X) and hold doors open:', PALETTE.accent],
  ['reach the exit for the level\u2019s time bonus, or lose a life.', PALETTE.accent],
  ['', PALETTE.dim],
  ['Touch a drift while carrying and you drop all your patches.', PALETTE.danger],
  ['Touch one empty-handed and you lose a life.', PALETTE.danger],
  ['Two drifts colliding leave a conflict nobody can pass for a while.', PALETTE.danger],
  ['', PALETTE.dim],
  ['ARROWS OR WASD MOVE \u00b7 P OR ESC PAUSE \u00b7 ENTER SELECTS', PALETTE.dim],
  ['ON TOUCH: SWIPE TO MOVE, TAP TO SELECT', PALETTE.dim],
];

function renderHelp(v) {
  const mid = v.width / 2;
  txt('HOW TO PLAY', mid, v.height * 0.12, 26, PALETTE.accent, 'center');
  let y = v.height * 0.24;
  for (const [line, color] of HELP_LINES) {
    if (line) {
      const size = v.width < 560 ? 12 : 15;
      txt(line, mid, y, size, color, 'center');
    }
    y += Math.max(20, v.height * 0.037);
  }
  txt('ENTER / TAP \u25b8 TITLE', mid, v.height - 56, 15, PALETTE.text, 'center');
}

function renderOver(v) {
  const won = game ? game.status === 'won' : false;
  dimmedBoard(v, 0.22);
  const mid = v.width / 2;
  txt(won ? 'ALL SHIPPED' : 'GAME OVER', mid, v.height * 0.24, 34, won ? PALETTE.accent : PALETTE.danger, 'center');
  txt('SCORE ' + formatScore(game ? game.score : 0), mid, v.height * 0.24 + 42, 22, PALETTE.text, 'center');

  let y = v.height * 0.40;
  for (const line of statsLines(stats)) {
    txt(line, mid, y, 14, PALETTE.dim, 'center');
    y += 22;
  }
  y += 16;
  txt('BEST RUNS', mid, y, 15, PALETTE.text, 'center');
  y += 24;
  const table = overScores ?? parseTable(storedText(SCORES_KEY, '[]'));
  for (const e of table.slice(0, 5)) {
    const mine = game && e.score === game.score;
    txt(`${e.name}  ${formatScore(e.score)}`, mid, y, 14, mine ? PALETTE.accent : PALETTE.dim, 'center');
    y += 20;
  }
  txt('ENTER / TAP \u25b8 TITLE', mid, v.height - 56, 15, PALETTE.text, 'center');
  achievementToast(v);
}

function editorColor(ch) {
  switch (ch) {
    case '#': return PALETTE.wall;
    case '.': return PALETTE.floor;
    case 'P': return PALETTE.agents[1];
    case 'M': return PALETTE.agents[3];
    case '@': return PALETTE.accent;
    case 'X': return PALETTE.text;
    case 'H': return PALETTE.dim;
    default: return PALETTE.danger; // a drift start
  }
}

function renderEditor(v) {
  const def = customDef;
  const w = def.map[0].length;
  const h = def.map.length;
  const lay = layout({ width: w, height: h }, v);
  txt('LEVEL EDITOR', lay.ox, Math.max(34, lay.oy - 18), 18, PALETTE.text);
  const label = (armFill ? 'FILL: ' : 'ARM: ') + armCh;
  txt(label, lay.ox + w * lay.cell, Math.max(34, lay.oy - 18), 14, PALETTE.dim, 'right');

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = def.map[y][x];
      const px = lay.ox + x * lay.cell;
      const py = lay.oy + y * lay.cell;
      ctx.fillStyle = PALETTE.wall;
      ctx.fillRect(px, py, lay.cell, lay.cell);
      ctx.fillStyle = editorColor(ch);
      if (ch === '#') {
        ctx.fillRect(px, py, lay.cell, lay.cell);
      } else {
        ctx.fillRect(px + 1, py + 1, lay.cell - 2, lay.cell - 2);
      }
    }
  }

  // The armed character previews on the hovered cell.
  const gx = Math.floor((mouse.x - lay.ox) / lay.cell);
  const gy = Math.floor((mouse.y - lay.oy) / lay.cell);
  if (gx >= 0 && gy >= 0 && gx < w && gy < h) {
    const size = lay.cell;
    ctx.save();
    ctx.globalAlpha = 0.65;
    ctx.fillStyle = editorColor(armCh);
    ctx.fillRect(lay.ox + gx * size + 2, lay.oy + gy * size + 2, size - 4, size - 4);
    ctx.restore();
  }

  const errors = editorErrors(def);
  const baseY = Math.min(v.height - 14, lay.oy + h * lay.cell + 26);
  txt(
    errors.length ? 'ERRORS: ' + errors.join(', ') : 'READY TO PLAY',
    lay.ox, baseY, 13, errors.length ? PALETTE.danger : PALETTE.accent,
  );
  txt(
    'CLICK PAINT \u00b7 RIGHT-CLICK ERASE \u00b7 F FILL \u00b7 1-0 ARM \u00b7 [ ] CYCLE \u00b7 R RESIZE \u00b7 E EXPORT \u00b7 I IMPORT',
    lay.ox, baseY + 22, 11, PALETTE.dim,
  );
  txt('ENTER PLAYS THE LEVEL \u00b7 ESC BACK', lay.ox, baseY + 40, 11, PALETTE.dim);
}

// ---------------------------------------------------------------- keyboard
// A raw listener for the menu keys (attachKeyboard forwards only mapped
// keys, which cannot tell Enter or Escape apart from pause in every
// screen). Registered before attachKeyboard's listener: it may mark an
// event consumed so the mapped handler ignores it once.
let consumed = false;

function rawKey(e) {
  gesture();
  const screen = menu.screen;
  if (e.repeat && screen !== 'playing' && screen !== 'paused') return;
  if (screen === 'title') {
    if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') reduceMenu('up');
    else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') reduceMenu('down');
    else if (e.key === 'Enter') selectTitle();
  } else if (screen === 'help') {
    if (e.key === 'Enter' || e.key === 'Escape') reduceMenu('back');
  } else if (screen === 'over') {
    if (e.key === 'Enter') {
      reduceMenu('select');
      leaveGame();
      newDemo();
    }
  } else if (screen === 'paused') {
    if (e.key === 'Enter') queue = queuePush(queue, { move: null, pause: true });
    else if (e.key === 'Escape') {
      consumed = true;
      reduceMenu('back');
      leaveGame();
      newDemo();
    }
  } else if (screen === 'editor') {
    editorKey(e);
  }
  // M toggles the sound on every screen (no key repeat flapping).
  if ((e.key === 'm' || e.key === 'M') && !e.repeat) toggleSound();
  queueMicrotask(() => {
    consumed = false;
  });
}

// Where does the sound toggle live? A helper both paths share.
function toggleSound() {
  settings = { ...settings, sound: !settings.sound };
  audio.setMuted(!settings.sound);
  menu = { ...menu, sound: settings.sound };
  persistSettings();
}

function editorKey(e) {
  const key = e.key;
  if (key === 'Enter') {
    if (editorErrors(customDef).length === 0) {
      reduceMenu('select'); // to playing, mode custom
      startGame(menu.mode);
    }
  } else if (key === 'Escape') {
    reduceMenu('back');
  } else if (key === 'f' || key === 'F') {
    armFill = !armFill;
  } else if (key === '[' || key === ']') {
    const at = ARM_PALETTE.indexOf(armCh);
    const next = (at + (key === ']' ? 1 : ARM_PALETTE.length - 1)) % ARM_PALETTE.length;
    armCh = ARM_PALETTE[next];
    armFill = false;
  } else if (key === 'r' || key === 'R') {
    const w = customDef.map[0].length;
    const h = customDef.map.length;
    const given = window.prompt('Map size (width x height):', `${w}x${h}`);
    const m = /^(\d+)\s*[xX\u00d7]\s*(\d+)$/.exec(given ?? '');
    if (m) customDef = editorResize(customDef, Number(m[1]), Number(m[2]));
  } else if (key === 'e' || key === 'E') {
    window.prompt('This level as JSON (copy it):', editorExport(customDef));
  } else if (key === 'i' || key === 'I') {
    const text = window.prompt('Paste a level JSON:');
    if (text !== null) {
      const def = editorImport(text);
      if (def) customDef = def;
    }
  } else if (key in ARM_KEYS) {
    armCh = ARM_KEYS[key];
    armFill = false;
  }
}

// attachKeyboard's listener: feed mapped inputs to the game while it is on
// screen. The pause key both pauses from the playing screen and resumes
// from the paused one (step flips paused for a pause input).
function onMapped(input) {
  gesture();
  if (consumed) return;
  if (menu.screen === 'playing') {
    queue = queuePush(queue, input);
  } else if (menu.screen === 'paused' && input.pause) {
    queue = queuePush(queue, input);
  }
}
const removeKeys = attachKeyboard(document, onMapped);

document.addEventListener('keydown', rawKey);

function canvasPos(e) {
  const r = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - r.left) * (canvas.width / r.width),
    y: (e.clientY - r.top) * (canvas.height / r.height),
  };
}

// -------------------------------------------------------------------- touch
let touchStart = null;

canvas.addEventListener('touchstart', (e) => {
  gesture();
  if (e.touches.length === 1) {
    touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }
  e.preventDefault();
}, { passive: false });

canvas.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

canvas.addEventListener('touchend', (e) => {
  e.preventDefault();
  gesture();
  if (!touchStart) return;
  const t = e.changedTouches[0];
  const dx = t.clientX - touchStart.x;
  const dy = t.clientY - touchStart.y;
  touchStart = null;
  const input = swipeToInput(dx, dy);
  if (input) {
    if (menu.screen === 'playing') queue = queuePush(queue, input);
  } else {
    tapAction(canvasPos(t));
  }
}, { passive: false });

function tapAction(pos) {
  const screen = menu.screen;
  if (screen === 'title') selectTitle();
  else if (screen === 'help') reduceMenu('back');
  else if (screen === 'over') {
    reduceMenu('select');
    leaveGame();
    newDemo();
  } else if (screen === 'paused') {
    queue = queuePush(queue, { move: null, pause: true });
  } else if (screen === 'editor') {
    editorClick(pos, 0);
  }
}

// -------------------------------------------------------------------- mouse
canvas.addEventListener('mousedown', (e) => {
  gesture();
  const p = canvasPos(e);
  const screen = menu.screen;
  if (screen === 'title') {
    const rows = titleRows(viewNow());
    const i = Math.floor((p.y - rows.top + 14) / rows.rowH);
    if (i >= 0 && i < rows.count) {
      menu = { ...menu, selected: i };
      selectTitle();
    }
  } else if (screen === 'help') {
    reduceMenu('back');
  } else if (screen === 'over') {
    reduceMenu('select');
    leaveGame();
    newDemo();
  } else if (screen === 'paused') {
    queue = queuePush(queue, { move: null, pause: true });
  } else if (screen === 'editor') {
    editorClick(p, e.button);
  }
});

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

canvas.addEventListener('mousemove', (e) => {
  mouse = canvasPos(e);
  if (menu.screen === 'editor' && e.buttons & 1) editorClick(mouse, 0);
});

function editorClick(p, button) {
  const w = customDef.map[0].length;
  const h = customDef.map.length;
  const lay = layout({ width: w, height: h }, viewNow());
  const gx = Math.floor((p.x - lay.ox) / lay.cell);
  const gy = Math.floor((p.y - lay.oy) / lay.cell);
  if (!(gx >= 0 && gy >= 0 && gx < w && gy < h)) return;
  if (button === 2) customDef = editorPaint(customDef, gx, gy, '.');
  else if (armFill) customDef = editorFill(customDef, gx, gy, armCh);
  else customDef = editorPaint(customDef, gx, gy, armCh);
}

// --------------------------------------------------------------------- boot
audio.setMuted(!settings.sound);
if (menu.sound !== settings.sound) menu = { ...menu, sound: settings.sound };
newDemo();
requestAnimationFrame(frame);

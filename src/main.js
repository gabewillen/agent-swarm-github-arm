// Quorum Run — the browser entry (DESIGN.md §15). The one module that
// touches the DOM: it owns the canvas, the fixed-tick game loop, the input
// queue, the sound, and the menu screens, and wires the rest together.
import { TICK_MS } from './core/constants.js';
import { init, step } from './core/game.js';
import { LEVELS } from './data/levels.js';
import { PALETTE } from './render/palette.js';
import { drawList, paint } from './render/draw.js';
import { swipeToInput, queuePush, queueTake, attachKeyboard } from './input/keys.js';
import { cuesFor } from './audio/cues.js';
import { createAudio } from './audio/synth.js';
import { menuInit, menuReduce, menuItems, hudText } from './ui/menu.js';

const HINT = 'ARROWS/WASD MOVE   P PAUSES   ENTER SELECTS   SWIPE ON TOUCH';
const HELP_LINES = [
  'YOU ARE A COURIER AGENT ON A GRID.',
  'PATCHES LAND ON SPAWN POINTS: WALK ONTO ONE TO PICK IT UP.',
  'CARRY UP TO THREE AND STEP ON A MERGE PAD TO BANK THEM.',
  'WHEN THE LEVEL QUORUM OF MERGED PATCHES LANDS, THE EXIT OPENS.',
  'WALK TO THE EXIT BEFORE PAR TO KEEP THE TIME BONUS.',
  'HOLD DOORS OPEN WITH THE QUORUM AND GATE THE FAR REGIONS.',
  'DRIFTS PATROL: TOUCH ONE CARRYING AND YOU DROP EVERYTHING.',
  'TOUCH ONE EMPTY-HANDED AND YOU LOSE A LIFE. THREE LIVES.',
  'TWO DRIFTS COLLIDING BLOCK THE GRID WITH A CONFLICT.',
  'P OR ESCAPE PAUSES. GOOD LUCK, COURIER.',
];

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// --- audio, built on the first user gesture (browsers allow it then only)

let audio = null;

function ensureAudio() {
  if (audio) return;
  const Ctor = window.AudioContext || window.webkitAudioContext || null;
  audio = Ctor
    ? createAudio(Ctor)
    : { play() {}, setMuted() {}, isMuted() { return true; } };
  audio.setMuted(!menu.sound);
}

function sound(cue) {
  if (!audio) return;
  try { audio.play(cue); } catch { /* no context, stay silent */ }
}

// --- the menu and the running game

let menu = menuInit();
let state = null;
let queue = [];
let endDelay = 0;

const isPlaying = () => state !== null && state.status === 'playing';
const isPaused = () => state !== null && state.status === 'playing' && state.paused;

function startRun() {
  const seed = (Math.random() * 4294967296) >>> 0;
  state = init(seed, { levels: LEVELS });
  queue = [];
  acc = 0;
  endDelay = 0;
}

function quitToTitle() {
  state = null;
  queue = [];
  endDelay = 0;
  menu = { ...menu, screen: 'title' };
}

function stepTick() {
  const take = queueTake(queue);
  queue = take.queue;
  const next = step(state, take.input);
  for (const cue of cuesFor(next.events)) sound(cue);
  state = next;
}

function togglePause() {
  if (!state || state.status !== 'playing') return;
  const next = step(state, { move: null, pause: true });
  for (const cue of cuesFor(next.events)) sound(cue);
  state = next;
}

// --- draw operations for the screens outside a run

const rectOp = (x, y, w, h, color) => ({ op: 'rect', kind: 'panel', x, y, w, h, color });
const textOp = (kind, x, y, text, color, size) => ({ op: 'text', kind, x, y, text, color, size });
const atCenter = (view, text, size) =>
  Math.max(0, Math.floor((view.width - text.length * size * 0.5) / 2));

function menuOps(view) {
  const ops = [rectOp(0, 0, view.width, view.height, PALETTE.bg)];
  const name = 'QUORUM RUN';
  const big = Math.max(24, Math.min(64, Math.floor(view.width / 14)));
  ops.push(textOp('title', atCenter(view, name, big),
    Math.floor(view.height * 0.3), name, PALETTE.accent, big));
  const items = menuItems(menu);
  const top = Math.floor(view.height * 0.42);
  items.forEach((item, i) => {
    const onTitle = menu.screen === 'title';
    const chosen = onTitle && i === menu.selected;
    const text = (chosen ? '> ' : '') + item;
    ops.push(textOp('menu', atCenter(view, text, 18), top + i * 30, text,
      chosen ? PALETTE.accent : PALETTE.dim, 18));
  });
  ops.push(textOp('hint', atCenter(view, HINT, 13), view.height - 26, HINT, PALETTE.dim, 13));
  return ops;
}

function helpOps(view) {
  const ops = [rectOp(0, 0, view.width, view.height, PALETTE.bg)];
  ops.push(textOp('title', atCenter(view, 'HOW TO PLAY', 32),
    Math.floor(view.height * 0.12), 'HOW TO PLAY', PALETTE.accent, 32));
  const size = view.width < 640 ? 11 : 14;
  HELP_LINES.forEach((line, i) => {
    ops.push(textOp('help', atCenter(view, line, size),
      Math.floor(view.height * 0.2) + i * (size + 9), line, PALETTE.text, size));
  });
  ops.push(textOp('hint', atCenter(view, 'ENTER OR ESCAPE GOES BACK', 13),
    view.height - 26, 'ENTER OR ESCAPE GOES BACK', PALETTE.dim, 13));
  return ops;
}

function editorOps(view) {
  const ops = [rectOp(0, 0, view.width, view.height, PALETTE.bg)];
  ops.push(textOp('title', atCenter(view, 'LEVEL EDITOR', 32),
    Math.floor(view.height * 0.3), 'LEVEL EDITOR', PALETTE.accent, 32));
  ops.push(textOp('hint', atCenter(view, 'ENTER GOES BACK TO THE TITLE', 13),
    view.height - 26, 'ENTER GOES BACK TO THE TITLE', PALETTE.dim, 13));
  return ops;
}

function overOps(view) {
  const ops = [rectOp(0, 0, view.width, view.height, PALETTE.bg)];
  if (!state) return ops;
  const won = state.status === 'won';
  const title = won ? 'ALL MERGED' : 'GAME OVER';
  const big = Math.max(28, Math.min(64, Math.floor(view.width / 13)));
  ops.push(textOp('title', atCenter(view, title, big),
    Math.floor(view.height * 0.3), title, won ? PALETTE.accent : PALETTE.danger, big));
  hudText(state).forEach((line, i) => {
    ops.push(textOp('over', atCenter(view, line, 18),
      Math.floor(view.height * 0.42) + i * 28, line, PALETTE.text, 18));
  });
  ops.push(textOp('hint', atCenter(view, 'ENTER GOES BACK TO THE TITLE', 13),
    view.height - 26, 'ENTER GOES BACK TO THE TITLE', PALETTE.dim, 13));
  return ops;
}

// --- render and the fixed-tick loop

function render() {
  const view = { width: canvas.width, height: canvas.height };
  let ops;
  if (menu.screen === 'playing' || menu.screen === 'paused') {
    ops = state ? drawList(state, view) : menuOps(view);
  } else if (menu.screen === 'help') {
    ops = helpOps(view);
  } else if (menu.screen === 'over') {
    ops = overOps(view);
  } else if (menu.screen === 'editor') {
    ops = editorOps(view);
  } else {
    ops = menuOps(view);
  }
  paint(ctx, ops);
}

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

let last = null;
let acc = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = last === null ? 0 : Math.min(now - last, 250);
  last = now;
  if (isPlaying() && !state.paused) {
    acc = Math.min(acc + dt, TICK_MS * 3);
    while (acc >= TICK_MS && isPlaying() && !state.paused) {
      acc -= TICK_MS;
      stepTick();
    }
  } else {
    acc = 0;
  }
  if (state && state.status !== 'playing' && menu.screen === 'playing') {
    if (endDelay > 0) endDelay -= 1;
    else menu = menuReduce(menu, 'gameover');
  }
  render();
}

// --- input: the keyboard through keys.js, Enter and touch here

function select() {
  if (menu.screen === 'playing') {
    if (state && state.status !== 'playing') menu = menuReduce(menu, 'gameover');
    else if (isPaused()) togglePause();
    return;
  }
  if (menu.screen === 'paused') { togglePause(); return; }
  if (menu.screen === 'editor') { menu = menuReduce(menu, 'back'); return; }
  menu = menuReduce(menu, 'select');
  if (menu.screen === 'title') {
    // a sound toggle or a run left for the title: drop any finished run
    if (state) quitToTitle();
    else if (audio) audio.setMuted(!menu.sound);
  } else if (menu.screen === 'playing' && state === null) {
    startRun();
  }
}

function onInput(input) {
  ensureAudio();
  if (menu.screen === 'playing' || menu.screen === 'paused') {
    if (input.pause) togglePause();
    else if (state && !state.paused) queue = queuePush(queue, input);
    return;
  }
  if (input.pause && (menu.screen === 'help' || menu.screen === 'editor')) {
    menu = menuReduce(menu, 'back');
    return;
  }
  if (input.move === 'up') menu = menuReduce(menu, 'up');
  else if (input.move === 'down') menu = menuReduce(menu, 'down');
}

function onRawKey(event) {
  const key = event.key;
  if (key === 'Enter' || key === ' ') {
    event.preventDefault();
    if (!event.repeat) { ensureAudio(); select(); }
  } else if (key === 'Escape' && isPaused()) {
    // paused: Escape leaves the run before keys.js would resume it
    event.preventDefault();
    event.stopImmediatePropagation();
    quitToTitle();
  }
}

let touch = null;

window.addEventListener('keydown', onRawKey);
window.addEventListener('mousedown', (event) => { ensureAudio(); select(); });
window.addEventListener('blur', () => { if (isPlaying() && !state.paused) togglePause(); });

canvas.addEventListener('touchstart', (event) => {
  event.preventDefault();
  ensureAudio();
  const t = event.changedTouches[0];
  touch = { x: t.clientX, y: t.clientY };
}, { passive: false });

canvas.addEventListener('touchend', (event) => {
  event.preventDefault();
  if (!touch) return;
  const t = event.changedTouches[0];
  const move = swipeToInput(t.clientX - touch.x, t.clientY - touch.y);
  touch = null;
  if (move) onInput(move);
  else select();
}, { passive: false });

attachKeyboard(window, onInput);

resize();
window.addEventListener('resize', resize);
requestAnimationFrame(frame);

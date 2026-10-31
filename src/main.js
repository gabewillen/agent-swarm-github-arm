// The page (DESIGN.md §15): wires the core, renderer, input, audio, and
// UI into the running game. It steps every TICK_MS with the queued
// input, draws on requestAnimationFrame, plays the cues of every step,
// and shows the title menu first. Nothing else may touch the DOM: this
// is the module that does.

import { init, step } from './core/game.js';
import { TICK_MS } from './core/constants.js';
import { drawList, paint, HUD_HEIGHT } from './render/draw.js';
import { PALETTE } from './render/palette.js';
import {
  keyToInput, swipeToInput, queuePush, queueTake, attachKeyboard, INPUT_QUEUE_MAX,
} from './input/keys.js';
import { cuesFor } from './audio/cues.js';
import { createAudio } from './audio/synth.js';
import { menuInit, menuReduce, menuItems, hudText } from './ui/menu.js';
import { loadSettings, tickMs } from './ui/settings.js';

// --- the page's own state -------------------------------------------------

const canvas = document.getElementById('game');
const context2d = canvas.getContext('2d');
const audio = createAudio(
  typeof AudioContext !== 'undefined' ? AudioContext : undefined,
);

const settings = loadSettings('');
let menu = menuInit();
let state = null; // the game state once play starts
let queue = []; // the queued inputs

const STEP_MS = Math.max(30, tickMs(settings) ?? TICK_MS);

// A sample level the editor menu item can ship before the editor's own
// data is wired up.
const SAMPLE = {
  name: 'Custom draft',
  quorum: 2, par: 100, driftPeriod: 2, spawnEvery: 16,
  map: ['#########', '#@P..M.X#', '#.......#', '#P......#', '#########'],
};

// --- starting and stopping games ------------------------------------------

function startGame(seed) {
  state = init(seed);
  queue = [];
  menu = { ...menu, screen: 'playing' };
}

function stopGame() {
  state = null;
  queue = [];
}

// --- input -----------------------------------------------------------------

// One input from any source: a key, a swipe, or a tap.
function onInput(input) {
  if (!input) return;
  switch (menu.screen) {
    case 'title': {
      if (input.pause) return;
      if (input.move === 'up') menu = menuReduce(menu, 'up');
      else if (input.move === 'down') menu = menuReduce(menu, 'down');
      return;
    }
    case 'help':
    case 'over':
      if (input.pause) menu = menuReduce(menu, 'back');
      else onSelect();
      return;
    case 'editor':
      if (input.pause) menu = menuReduce(menu, 'back');
      else onSelect();
      return;
    case 'playing': {
      if (input.pause) {
        menu = menuReduce(menu, 'pause');
        state = step(state, { move: null, pause: true });
        for (const cue of cuesFor(state.events)) audio.play(cue);
      } else if (state && !state.paused) {
        queue = queuePush(queue, input);
      }
      return;
    }
    case 'paused': {
      if (input.pause) {
        menu = menuReduce(menu, 'pause');
        state = step(state, { move: null, pause: true });
        for (const cue of cuesFor(state.events)) audio.play(cue);
      } else if (input.move) {
        menu = menuReduce(menu, 'back');
        stopGame();
      }
      return;
    }
    default:
  }
}

// The Enter key and taps select on menus.
function onSelect() {
  const items = menuItems(menu);
  if (menu.screen === 'title') {
    const [play, daily, editor, help, sound] = items;
    const chosen = items[menu.selected];
    if (chosen === play) startGame((Date.now() >>> 0) || 1);
    else if (chosen === daily) {
      // The daily run seeds from the calendar day when the generator is
      // around; otherwise it is a plain seeded game.
      const today = new Date().toISOString().slice(0, 10);
      import('./core/generate.js')
        .then((generate) => startGame(generate.dailySeed(today) ?? today.length))
        .catch(() => startGame(7));
    } else if (chosen === editor) {
      menu = menuReduce(menu, 'select');
    } else if (chosen === help) {
      menu = menuReduce(menu, 'select');
    } else if (chosen === sound) {
      const next = menuReduce(menu, 'select');
      menu = next;
      audio.setMuted(!next.sound);
    }
    return;
  }
  if (menu.screen === 'help') {
    menu = menuReduce(menu, 'back');
    return;
  }
  if (menu.screen === 'editor') {
    // Play the edited draft. Until the editor is wired, the sample
    // level stands in for it.
    menu = menuReduce(menu, 'select');
    startGame(11);
    state = init(11, { levels: [SAMPLE] });
    return;
  }
  if (menu.screen === 'over') {
    menu = menuReduce(menu, 'select');
    stopGame();
    return;
  }
  void INPUT_QUEUE_MAX;
}

// --- wiring the DOM ---------------------------------------------------------

const stopKeys = attachKeyboard(window, (input) => onInput(keyToInput(input) ?? input));

// Enter selects; keyToInput does not map it, so the page handles it.
window.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    onSelect();
  }
});

// Touch: swipe moves, tap selects.
let touchOrigin = null;
canvas.addEventListener('touchstart', (event) => {
  const t = event.changedTouches[0];
  touchOrigin = { x: t.clientX, y: t.clientY };
  event.preventDefault();
}, { passive: false });
canvas.addEventListener('touchend', (event) => {
  const t = event.changedTouches[0];
  if (touchOrigin) {
    const input = swipeToInput(t.clientX - touchOrigin.x, t.clientY - touchOrigin.y);
    if (input) onInput(input);
    else onSelect();
  }
  touchOrigin = null;
  event.preventDefault();
}, { passive: false });

function fitCanvas() {
  canvas.width = Math.max(320, window.innerWidth);
  canvas.height = Math.max(240, window.innerHeight);
}
window.addEventListener('resize', fitCanvas);
fitCanvas();

// --- stepping ---------------------------------------------------------------

// Every STEP_MS: take one queued input and step with it.
setInterval(() => {
  if (menu.screen !== 'playing' || state === null) return;
  const take = queueTake(queue);
  queue = take.queue;
  const input = take.input;
  state = step(state, input);
  for (const cue of cuesFor(state.events)) audio.play(cue);
  if (state.status !== 'playing' && menu.screen === 'playing') {
    menu = menuReduce(menu, 'gameover');
  }
}, STEP_MS);

// --- drawing ----------------------------------------------------------------

function textOp(kind, x, y, text, color, size) {
  return { op: 'text', kind, x, y, text, color, size };
}

function menuOps() {
  const w = canvas.width;
  const h = canvas.height;
  const ops = [{ op: 'rect', kind: 'bg', x: 0, y: 0, w, h, color: PALETTE.bg }];
  ops.push(textOp('title', Math.floor(w / 2) - 130, Math.floor(h / 3), 'QUORUM RUN', PALETTE.accent, 36));
  ops.push(textOp('dim', Math.floor(w / 2) - 110, Math.floor(h / 3) + 30, 'patch. merge. ship.', PALETTE.dim, 14));
  const items = menuItems(menu);
  items.forEach((item, i) => {
    const selected = menu.selected === i ? '> ' : '  ';
    ops.push(textOp(
      'menu', Math.floor(w / 2) - 80, Math.floor(h / 2) + 20 + i * 30,
      selected + item,
      menu.selected === i ? PALETTE.accent : PALETTE.text, 18,
    ));
  });
  if (menu.screen === 'help') {
    ['Arrow keys or WASD move', 'P pauses', 'Enter selects', 'Swipe moves on touch', 'Carry up to 3 patches', 'Merge them to reach the quorum', 'Ship through the exit'].forEach((line, i) => {
      ops.push(textOp('help', Math.floor(w / 2) - 120, Math.floor(h / 2) + 40 + i * 24, line, PALETTE.text, 14));
    });
  }
  if (menu.screen === 'editor') {
    ops.push(textOp('editor', Math.floor(w / 2) - 80, Math.floor(h / 2), 'DRAFT READY', PALETTE.text, 18));
    ops.push(textOp('dim', Math.floor(w / 2) - 80, Math.floor(h / 2) + 30, 'Enter to ship it, Esc to leave', PALETTE.dim, 14));
  }
  return ops;
}

// The HUD's own kind sits under drawList's ops; the page adds only
// screens it draws itself.
function draw() {
  if (state && (menu.screen === 'playing' || menu.screen === 'paused')) {
    paint(context2d, drawList(state, { width: canvas.width, height: canvas.height }));
    if (state.paused && menu.screen === 'playing') {
      // A resume line while the game itself is paused.
      paint(context2d, [textOp('resume', 20, canvas.height - 20, 'P to resume', PALETTE.dim, 14)]);
    }
    return;
  }
  paint(context2d, menuOps());
  void HUD_HEIGHT;
}

function onFrame() {
  draw();
  requestAnimationFrame(onFrame);
}
onFrame();

window.addEventListener('beforeunload', stopKeys);

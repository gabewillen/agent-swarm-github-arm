// The browser entry point (DESIGN.md §1, §15). This is the only module
// that touches the DOM, window, or an AudioContext: it wires the core,
// renderer, input, audio, and UI modules into one page. The game runs a
// step every tick (TICK_MS normally, adjusted by the speed setting), puts
// the queued input through it, draws the state with drawList and paint on
// every requestAnimationFrame, and plays a cue for every event of each
// step. It opens on the title menu, with a bot demo (attract mode)
// playing behind it.
import { TICK_MS, DIRS, CARRY_MAX, START_LIVES } from './core/constants.js';
import { init, step } from './core/game.js';
import { botInput } from './core/bot.js';
import { layout, drawList, paint, HUD_HEIGHT } from './render/draw.js';
import { PALETTE } from './render/palette.js';
import { attachKeyboard, queuePush, queueTake, swipeToInput } from './input/keys.js';
import { cuesFor } from './audio/cues.js';
import { createAudio } from './audio/synth.js';
import { bar, scheduleBar, tempo } from './audio/music.js';
import { menuInit, menuReduce, menuItems } from './ui/menu.js';
import { loadSettings, saveSettings, tickMs } from './ui/settings.js';
import { addScore, formatScore, parseTable } from './ui/scores.js';
import { dailySeed } from './core/generate.js';
import { editorInit, editorPaint, editorErrors, editorExport, editorImport } from './core/editor.js';
import { ACHIEVEMENTS, checkAchievements } from './core/achievements.js';
import { statsInit, statsUpdate, statsLines } from './core/stats.js';

// Where this page keeps its records.
const STORE = {
  settings: 'quorum-run:settings',
  scores: 'quorum-run:scores',
  unlocked: 'quorum-run:achievements',
  customLevel: 'quorum-run:custom-level',
};

const FONT = 'monospace';
const HUD_TEXT_Y = 31; // the baseline of text on the HUD strip

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const audio = createAudio(window.AudioContext || window.webkitAudioContext);

function readStore(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function writeStore(key, text) {
  try { localStorage.setItem(key, text); } catch { /* private mode etc. */ }
}

function readJSON(key) {
  try { return JSON.parse(readStore(key)); } catch { return null; }
}

let settings = loadSettings(readStore(STORE.settings) ?? '');
let menu = { ...menuInit(), sound: settings.sound };
let run = null; // { state, prev, stats, unlocked, mode }
let queue = [];
let editor = null; // { def, cursor, errors } while the editor screen is up
let attract = null; // the bot demo behind the title
let attractSeed = 424242;
let toast = null; // { text }
let scores = parseTable(readStore(STORE.scores) ?? '');
audio.setMuted(!settings.sound);

function resize() {
  canvas.width = Math.max(320, window.innerWidth);
  canvas.height = Math.max(240, window.innerHeight);
}
window.addEventListener('resize', resize);
resize();

// ----------------------------------------------------------------- runs

function todayString() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function seedFor(mode) {
  if (mode === 'daily') return dailySeed(todayString()) ?? 424242;
  if (mode === 'custom') return 173;
  return (Date.now() >>> 0) % 1000003;
}

function startRun(mode) {
  const stored = readJSON(STORE.unlocked);
  run = {
    state: init(seedFor(mode), mode === 'custom'
      ? { levels: [editor.def], level: 0 }
      : { level: 0 }),
    prev: null,
    stats: statsInit(),
    unlocked: Array.isArray(stored)
      ? stored.filter((id) => ACHIEVEMENTS.some((a) => a.id === id))
      : [],
    mode,
  };
  queue = [];
  toast = null;
}

// ---------------------------------------------------------------- input

// One translated input (§12's shape), a pause key, a tap, or a swipe:
// every source ends up here.
function handleInput(input) {
  if (!input) return;
  const { screen } = menu;
  if (screen === 'editor') {
    if (input.pause) return; // painting keys go through the raw listener
    if (input.move) {
      const [dx, dy] = DIRS[input.move];
      editor.cursor = {
        x: Math.min(editor.def.map[0].length - 2, Math.max(1, editor.cursor.x + dx)),
        y: Math.min(editor.def.map.length - 2, Math.max(1, editor.cursor.y + dy)),
      };
    }
    return;
  }
  if (screen === 'playing') {
    if (!run) { menu = { ...menu, screen: 'title', selected: 0 }; return; }
    if (run.state.status !== 'playing') return;
    if (input.pause && input.move === null && run.state.paused) {
      // Escape or P again while paused: leave the run for the title.
      run = null;
      queue = [];
      menu = { ...menu, screen: 'title', selected: 0 };
      return;
    }
    queue = queuePush(queue, input); // the next tick takes one
    return;
  }
  if (screen === 'title') {
    if (input.move === 'up' || input.move === 'down') menu = menuReduce(menu, input.move);
    return;
  }
  if (screen === 'help') {
    if (input.pause || input.move) menuAction('back'); // back or select
    return;
  }
  if (screen === 'over') {
    if (input.pause || input.move) menuAction('select');
  }
}

function menuAction(action) {
  if (menu.screen === 'editor') {
    if (action === 'back') menu = menuReduce(menu, 'back');
    else if (action === 'select') deployEditor();
    return;
  }
  const soundBefore = menu.sound;
  const next = menuReduce(menu, action);
  if (next === menu) return;
  menu = next;
  if (menu.screen === 'playing') {
    ensureGestureAudio();
    startRun(menu.mode);
  } else if (menu.screen === 'editor') {
    editor = openEditor();
  } else if (menu.screen === 'title') {
    // Back on the title: drop the finished run so attract mode resumes.
    if (run && run.state.status !== 'playing') run = null;
  }
  if (menu.sound !== soundBefore) {
    settings = { ...settings, sound: menu.sound };
    writeStore(STORE.settings, saveSettings(settings));
    audio.setMuted(!settings.sound);
  }
}

// ---------------------------------------------------------------- touch

let touchStart = null;

function touchEnd(e) {
  if (!touchStart) return;
  const t = e.changedTouches[0];
  const dx = t.clientX - touchStart.x;
  const dy = t.clientY - touchStart.y;
  const quick = e.timeStamp - touchStart.time < 400;
  touchStart = null;
  e.preventDefault();
  if (Math.abs(dx) < 24 && Math.abs(dy) < 24) {
    if (quick) tapSelect();
    return;
  }
  handleInput(swipeToInput(dx, dy));
}

function tapSelect() {
  if (menu.screen === 'editor') deployEditor();
  else menuAction('select');
}

// -------------------------------------------------------------- keyboard

attachKeyboard(window, (input) => handleInput(input));

// The keys the input module does not translate: Enter for the menus, and
// the painting letters of the level editor.
const PAINT_KEYS = new Set(['#', '.', 'P', 'M', 'X', 'H', '@', '^', '>', 'v', '<']);

window.addEventListener('keydown', (e) => {
  if (menu.screen === 'editor') {
    if (e.key === 'Enter') {
      e.preventDefault();
      deployEditor();
      return;
    }
    // 'p' is pause elsewhere; on the editor screen it paints a spawn.
    const ch = e.key === 'p' ? 'P' : e.key;
    if (PAINT_KEYS.has(ch)) {
      e.preventDefault();
      paintCursor(ch);
    }
    return;
  }
  if (e.key === 'Enter') {
    e.preventDefault();
    menuAction('select');
  }
});

function paintCursor(ch) {
  editor = {
    ...editor,
    def: editorPaint(editor.def, editor.cursor.x, editor.cursor.y, ch),
  };
  editor.errors = editorErrors(editor.def);
}

function openEditor() {
  const saved = editorImport(readStore(STORE.customLevel) ?? '');
  return {
    def: (saved && editorErrors(saved).length === 0) ? saved : editorInit(15, 11),
    cursor: { x: 1, y: 1 },
    errors: [],
  };
}

function deployEditor() {
  const errors = editorErrors(editor.def);
  if (errors.length > 0) {
    editor.errors = errors; // shown on the screen until they are fixed
    return;
  }
  writeStore(STORE.customLevel, editorExport(editor.def));
  const soundBefore = menu.sound;
  menu = menuReduce(menu, 'select'); // into 'playing', mode 'custom'
  if (menu.screen === 'playing') {
    ensureGestureAudio();
    startRun(menu.mode);
  }
  if (menu.sound !== soundBefore) {
    settings = { ...settings, sound: menu.sound };
    writeStore(STORE.settings, saveSettings(settings));
    audio.setMuted(!settings.sound);
  }
}

// ---------------------------------------------------------------- audio

// Browsers allow audio only inside a user gesture; this opens the music
// context while the user is pressing Enter to play (the synth makes its
// own when its first cue plays, which also lands inside the gesture).
function ensureGestureAudio() {
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return;
  if (musicCtx) {
    if (musicCtx.state === 'suspended') musicCtx.resume().catch(() => {});
    return;
  }
  try { musicCtx = new Ctor(); } catch { musicCtx = null; }
}

let musicCtx = null;
let barNumber = 0;
let nextBarAt = 0;

function scheduleMusic() {
  if (!musicCtx) return;
  const quiet = !settings.music || !settings.sound
    || !run || run.state.paused || run.state.status !== 'playing';
  if (quiet) {
    nextBarAt = musicCtx.currentTime + 0.05;
    return;
  }
  const bpm = tempo(run.state.levelIndex);
  const barSeconds = 8 * 30 / bpm;
  if (nextBarAt < musicCtx.currentTime) nextBarAt = musicCtx.currentTime + 0.05;
  while (nextBarAt < musicCtx.currentTime + 0.4) {
    scheduleBar(
      musicCtx,
      bar(run.state.levelIndex, barNumber),
      nextBarAt,
      bpm,
      Math.max(0, Math.min(1, settings.volume)) * 0.25,
    );
    barNumber += 1;
    nextBarAt += barSeconds;
  }
}

function afterRunEnded() {
  if (run.state.status === 'won') {
    scores = addScore(scores, {
      name: run.mode === 'daily' ? 'DAILY' : 'COURIER',
      score: run.state.score,
    });
    writeStore(STORE.scores, JSON.stringify(scores));
  }
  menu = menuReduce(menu, 'gameover'); // screen 'over'; the run stays for display
}

// -------------------------------------------------------------- ticking

function tick() {
  if (run) {
    if (run.state.status !== 'playing') return;
    const taken = queueTake(queue);
    queue = taken.queue;
    run.prev = run.state;
    run.state = step(run.prev, taken.input); // the rules of §6
    for (const cue of cuesFor(run.state.events)) audio.play(cue);
    const fresh = checkAchievements(run.prev, run.state, run.unlocked);
    if (fresh.length > 0) {
      run.unlocked = run.unlocked.concat(fresh);
      writeStore(STORE.unlocked, JSON.stringify(run.unlocked));
      toast = { text: `unlocked: ${ACHIEVEMENTS.find((a) => a.id === fresh[0]).title}` };
    }
    run.stats = statsUpdate(run.stats, run.prev, run.state, taken.input);
    if (run.state.status !== 'playing') afterRunEnded();
    return;
  }
  // Attract mode: the bot plays behind the title.
  if (menu.screen !== 'title') return;
  attract = attract ? step(attract, botInput(attract)) : init(attractSeed);
  if (attract.status !== 'playing') attract = init(++attractSeed);
}

let lastTime = 0;

function frame(now) {
  requestAnimationFrame(frame);
  if (!lastTime) lastTime = now;
  const period = run ? tickMs(settings) : TICK_MS;
  lastTime = Math.max(lastTime, now - 500); // no burst after a tab switch
  while (now - lastTime >= period) {
    lastTime += period;
    tick();
  }
  scheduleMusic();
  draw();
}

// -------------------------------------------------------------- drawing

canvas.addEventListener('touchstart', (e) => {
  const t = e.changedTouches[0];
  touchStart = { x: t.clientX, y: t.clientY, time: e.timeStamp };
  e.preventDefault();
}, { passive: false });
canvas.addEventListener('touchend', touchEnd, { passive: false });

function rect(ops, x, y, w, h, color) {
  ops.push({ op: 'rect', kind: 'ui', x, y, w, h, color });
}

function text(ops, x, y, str, color, size) {
  ops.push({
    op: 'text', kind: 'ui', x: Math.round(x), y: Math.round(y),
    text: str, color, size, font: FONT,
  });
}

function centerText(ops, y, str, color, size) {
  text(ops, (canvas.width - str.length * size * 0.6) / 2, y, str, color, size);
}

function draw() {
  const view = { width: canvas.width, height: canvas.height };
  const ops = run ? drawRun(view) : drawTitleScreens(view);
  if (toast) {
    const w = toast.text.length * 14 + 28;
    const x = canvas.width - w - 16;
    rect(ops, x, HUD_HEIGHT + 16, w, 34, PALETTE.panel);
    text(ops, x + 14, HUD_HEIGHT + 40, toast.text, PALETTE.accent, 15);
  }
  paint(ctx, ops);
}

function drawRun(view) {
  const ops = drawList(run.state, view); // the board, the HUD, banners
  if (run.state.paused) {
    ops.push({
      op: 'rect', kind: 'ui', x: 0, y: 0, w: view.width, h: view.height,
      color: 'rgba(17, 17, 17, 0.55)',
    });
  }
  if (run.state.status === 'won' || run.state.status === 'lost') {
    const w = Math.min(320, view.width - 40);
    const h = 168;
    const x = Math.round((view.width - w) / 2);
    const y = Math.round(HUD_HEIGHT + (view.height - HUD_HEIGHT) * 0.62);
    rect(ops, x, y, w, h, PALETTE.panel);
    text(ops, x + 16, y + 34, run.mode === 'daily' ? 'DAILY RUN' : 'CAMPAIGN', PALETTE.text, 16);
    text(ops, x + 16, y + 66, `SCORE ${formatScore(Math.min(run.state.score, 999999))}`, PALETTE.accent, 22);
    statsLines(run.stats).forEach((line, i) => {
      text(ops, x + 16, y + 96 + i * 18, line, PALETTE.dim, 14);
    });
    text(ops, x + 16, y + h - 14, 'ENTER title', PALETTE.text, 13);
  }
  return ops;
}

function drawTitleScreens(view) {
  // The attract demo plays behind the title menu.
  const ops = (attract && menu.screen === 'title')
    ? drawList(attract, view)
    : [{ op: 'rect', kind: 'ui', x: 0, y: 0, w: view.width, h: view.height, color: PALETTE.bg }];
  if (menu.screen === 'title') {
    ops.push({
      op: 'rect', kind: 'ui', x: 0, y: 0, w: view.width, h: view.height,
      color: 'rgba(17, 17, 17, 0.82)',
    });
    centerText(ops, 120, 'QUORUM RUN', PALETTE.accent, 46);
    centerText(ops, 152, 'pick up patches, merge the quorum, ship it', PALETTE.dim, 14);
    menuItems(menu).forEach((item, i) => {
      const on = i === menu.selected;
      const y = 226 + i * 38;
      text(ops, 208, y, item, on ? PALETTE.accent : PALETTE.dim, on ? 22 : 19);
      if (on) text(ops, 184, y, '>', PALETTE.accent, 22);
    });
    centerText(ops, view.height - 64, `best ${formatScore(scores.length ? scores[0].score : 0)}`, PALETTE.text, 15);
    centerText(ops, view.height - 32, 'arrows choose, enter plays, in game: wasd or arrows move, p pauses', PALETTE.dim, 13);
  } else if (menu.screen === 'help') {
    centerText(ops, 110, 'HOW TO PLAY', PALETTE.accent, 32);
    const lines = [
      'Arrows or WASD move one cell per tick; P or Escape pauses.',
      'Patches appear on spawn points: walk one over to carry it.',
      `You may carry ${CARRY_MAX} patches at once. Merge them on an M pad.`,
      'Once the level quorum of merged patches has landed,',
      'the exit X and every hold door H open; reach X to ship out.',
      '',
      'Drifts patrol the grid. Bump one while carrying and you',
      'drop everything (brief immunity after); bump one',
      'empty-handed and you lose one of your lives.',
      'Two drifts that run into each other leave a conflict:',
      'a block nobody can pass until it fades.',
      '',
      'Score: 100 per merged patch, plus 50 per patch when all of',
      'a merge share a colour, plus 10 per tick left of the par',
      'when you ship.',
    ];
    lines.forEach((line, i) => text(ops, 96, 164 + i * 26, line, PALETTE.text, 16));
    centerText(ops, view.height - 28, 'escape returns', PALETTE.dim, 14);
  } else if (menu.screen === 'editor') {
    drawEditorOps(ops, editor);
  }
  return ops;
}

function drawEditorOps(ops, ed) {
  if (!ed) return;
  const view = { width: canvas.width, height: canvas.height };
  // A definition has no width or height fields of its own; its map does.
  const { cell, ox, oy } = layout({
    width: ed.def.map[0].length,
    height: ed.def.map.length,
  }, view);
  rect(ops, 0, 0, canvas.width, canvas.height, PALETTE.bg);
  rect(ops, 0, 0, canvas.width, HUD_HEIGHT, PALETTE.panel);
  text(ops, 16, HUD_TEXT_Y, `${ed.def.name} ${ed.def.map[0].length}x${ed.def.map.length}`, PALETTE.text, 18);
  ed.def.map.forEach((row, cy) => {
    [...row].forEach((ch, cx) => {
      const x = ox + cx * cell;
      const y = oy + cy * cell;
      const wall = ch === '#';
      rect(ops, x, y, cell, cell, wall ? PALETTE.wall : PALETTE.floor);
      if (!wall && ch !== '.') {
        const colors = {
          P: PALETTE.agents[0], M: PALETTE.accent, X: PALETTE.accent, H: PALETTE.dim,
          '@': PALETTE.text, '^': PALETTE.danger, '>': PALETTE.danger,
          v: PALETTE.danger, '<': PALETTE.danger,
        };
        text(ops, x + cell * 0.3, y + cell * 0.78, ch, colors[ch] ?? PALETTE.text, Math.floor(cell * 0.7));
      }
    });
  });
  const cx = ox + ed.cursor.x * cell;
  const cy = oy + ed.cursor.y * cell;
  rect(ops, cx, cy, cell, cell, PALETTE.accent);
  rect(ops, cx + 2, cy + 2, cell - 4, cell - 4,
    ed.def.map[ed.cursor.y][ed.cursor.x] === '#' ? PALETTE.wall : PALETTE.floor);
  const bottom = oy + ed.def.map.length * cell + 12;
  text(ops, ox, bottom,
    'paint with # . P M X H @ ^ > v <  ·  arrows move  ·  enter plays  ·  escape leaves', PALETTE.dim, 14);
  if (ed.errors.length > 0) {
    text(ops, ox, bottom + 26, `errors: ${ed.errors.join(', ')}`, PALETTE.danger, 14);
  } else {
    text(ops, ox, bottom + 26, 'ready to play', PALETTE.dim, 14);
  }
}

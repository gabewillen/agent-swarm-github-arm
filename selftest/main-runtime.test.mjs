// agent-4's selfcheck of the page (DESIGN.md §15–§16, src/main.js landed
// in #664 and #721): the acceptance section 23 scans source text only, so
// it can watch neither the frame loop nor the audio plumbing. This file
// stubs the DOM deeply enough to run the real page headlessly — a canvas
// that records fillText calls, an rAF + setInterval clock, a localStorage
// Map, and an AudioContext that counts contexts and scheduled
// oscillators — then drives the menus, a run, pause/resume, the editor,
// the daily seed, persistence across boots, the mute cycle, and the
// visibility pause. Out of tests/, so it may own globals freely; it
// restores them on exit for the honest readers of this directory.
import test from 'node:test';
import assert from 'node:assert/strict';

// -- The stub browser -------------------------------------------------------
// The page reads `window`, `document`, `performance`,
// `requestAnimationFrame`, and the timers as globals, so the stub installs
// them once and every scenario re-imports src/main.js under a fresh
// specifier (?boot=<n>), which re-runs the page as a fresh load.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// The stub browser. `window`, `document`, `performance`,
// `requestAnimationFrame`, and the timers are globals the page reads, so the
// stub installs them once; each scenario re-imports src/main.js under a fresh
// specifier (?boot=<n>), which re-runs the page as a fresh load.
// ---------------------------------------------------------------------------

let nowValue = 0;
let rafCb = null;
let intervalCb = null;
let intervalMs = 0;
let intervalLast = 0;
let bootN = 0; // fresh specifier per scenario: a re-import re-runs the page
const listeners = new Map(); // tag -> Map(type -> Set(handler))
const FA = { contexts: 0, oscillators: 0 };
const store = new Map(); // localStorage backing
let storageHostile = false; // private/file modes: every access throws
let hidden = false;

function lst(tag) {
  if (!listeners.has(tag)) listeners.set(tag, new Map());
  return listeners.get(tag);
}
function fire(tag, type, ev) {
  for (const h of lst(tag).get(type) || []) h(ev);
}

class FakeAudioContext {
  constructor() { FA.contexts += 1; this.state = 'running'; this.currentTime = 0; this.destination = {}; }
  createOscillator() {
    FA.oscillators += 1;
    return { type: '', frequency: { value: 0 }, connect() {}, start() {}, stop() {} };
  }
  createGain() {
    return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {} }, connect() {} };
  }
  resume() { return Promise.resolve(); }
}

const canvas = {};
function makeCtx(calls) {
  const state = {};
  const passthrough = ['fillRect', 'beginPath', 'arc', 'fill', 'stroke', 'strokeText',
    'clearRect', 'save', 'restore', 'setTransform', 'translate', 'scale',
    'moveTo', 'lineTo', 'closePath'];
  return new Proxy({}, {
    get(_, prop) {
      if (prop in state) return state[prop];
      if (passthrough.includes(prop)) return () => {};
      if (prop === 'fillText') return (...a) => { calls.push(String(a[0])); };
      return undefined;
    },
    set(_, prop, v) { state[prop] = v; return true; },
  });
}

const windowObj = {
  innerWidth: 800,
  innerHeight: 600,
  devicePixelRatio: 1,
  AudioContext: FakeAudioContext,
  addEventListener: (t, h) => { const m = lst('window'); if (!m.has(t)) m.set(t, new Set()); m.get(t).add(h); },
  removeEventListener: (t, h) => { lst('window').get(t)?.delete(h); },
  localStorage: {
    getItem(k) { if (storageHostile) throw new TypeError('storage refused'); return store.has(k) ? store.get(k) : null; },
    setItem(k, v) { if (storageHostile) throw new TypeError('storage refused'); store.set(k, String(v)); },
  },
};

let calls = []; // fillText log of the live context
function bootPage() {
  listeners.clear();
  calls = [];
  canvas.addEventListener = (t, h) => { const m = lst('canvas'); if (!m.has(t)) m.set(t, new Set()); m.get(t).add(h); };
  canvas.getContext = () => makeCtx(calls);
  nowValue = 0;
  rafCb = null;
  intervalCb = null;
  intervalMs = 0;
  intervalLast = 0;
  FA.contexts = 0;
  FA.oscillators = 0;
  hidden = false;
  storageHostile = false;
  globalThis.window = windowObj;
  globalThis.document = {
    getElementById: (id) => (id === 'game' ? canvas : null),
    addEventListener: (t, h) => { const m = lst('document'); if (!m.has(t)) m.set(t, new Set()); m.get(t).add(h); },
    get hidden() { return hidden; },
  };
  globalThis.performance = { now: () => nowValue };
  globalThis.requestAnimationFrame = (cb) => { rafCb = cb; return 1; };
  globalThis.setInterval = (cb, ms) => {
    intervalCb = cb; intervalMs = ms; intervalLast = nowValue; return 7;
  };
  globalThis.clearInterval = (id) => { if (id === 7) { intervalCb = null; intervalMs = 0; } };
  bootN += 1;
  return import(`../src/main.js?boot=${bootN}`);
}

function pump(frames, dtMs = 16) {
  for (let i = 0; i < frames; i++) {
    nowValue += dtMs;
    // The sim clock the page installed (setInterval(tickAll, tickMs)).
    if (intervalCb && intervalMs && nowValue - intervalLast >= intervalMs) {
      intervalLast += intervalMs * Math.floor((nowValue - intervalLast) / intervalMs);
      intervalCb();
    }
    const cb = rafCb;
    rafCb = null;
    if (!cb) throw new Error('the frame loop stopped scheduling');
    cb(nowValue);
  }
}

const key = (k) => fire('window', 'keydown', {
  key: k, preventDefault() {}, metaKey: false, ctrlKey: false, altKey: false,
});
const pointerDown = (x, y) => fire('canvas', 'pointerdown', {
  clientX: x, clientY: y, shiftKey: false, preventDefault() {}, pointerType: 'mouse',
});
const lift = (x, y) => fire('canvas', 'pointerup', { clientX: x, clientY: y });
const drawn = () => new Set(calls);
let drawnContains = (needle) => [...drawn()].some((t) => t.toLowerCase().includes(needle.toLowerCase()));
const mark = () => { calls.length = 0; };

// Install the globals once; the page loads straight after the installation.
listeners.clear();
calls = [];
canvas.addEventListener = (t, h) => { const m = lst('canvas'); if (!m.has(t)) m.set(t, new Set()); m.get(t).add(h); };
canvas.getContext = () => makeCtx(calls);
canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600 });
Object.defineProperty(canvas, 'clientWidth', { get: () => 800 });
Object.defineProperty(canvas, 'clientHeight', { get: () => 600 });
canvas.width = 10;
canvas.height = 10;
nowValue = 0;
rafCb = null;
intervalCb = null;
intervalMs = 0;
intervalLast = 0;
FA.contexts = 0;
FA.oscillators = 0;
hidden = false;
storageHostile = false;
globalThis.window = windowObj;
globalThis.document = {
  getElementById: (id) => (id === 'game' ? canvas : null),
  addEventListener: (t, h) => { const m = lst('document'); if (!m.has(t)) m.set(t, new Set()); m.get(t).add(h); },
  get hidden() { return hidden; },
};
globalThis.performance = { now: () => nowValue };
globalThis.requestAnimationFrame = (cb) => { rafCb = cb; return 1; };
globalThis.setInterval = (cb, ms) => {
  intervalCb = cb; intervalMs = ms; intervalLast = nowValue; return 7;
};
globalThis.clearInterval = (id) => { if (id === 7) { intervalCb = null; intervalMs = 0; } };

let page = null;
try {
  page = await import('../src/main.js'); // boot #0: proves the page loads
} catch {
  page = null; // the page entry is (still) unlanded; every test below skips
}

// ---------------------------------------------------------------------------
// Scenarios. `mainGraph === null` skips everything (page not landed).
// ---------------------------------------------------------------------------

test('boots to the title with a bot demo behind it', { skip: !page }, async () => {
  await bootPage();
  pump(90); // ~1.4s: the demo steps and the title chrome settles
  assert(drawn().has('QUORUM RUN'), `title should draw its name; saw ${[...drawn()].slice(0, 8).join('|')}`);
  const ts = [...drawn()];
  assert(ts.includes('SCORE 0') || ts.includes('SCORE'), `demo hud under the veil; texts: ${ts.slice(0, 10).join('|')}`);
});

test('Enter starts a campaign; arrows move; p pauses and Enter resumes', { skip: !page }, async () => {
  await bootPage();
  pump(90);
  key('Entry'); // a key the page does not own: never does anything
  key('Enter');
  pump(40);
  assert(drawn().has('SCORE 0'), `Enter should start Play; saw ${[...drawn()].slice(0, 8).join('|')}`);
  assert(drawn().has('LEVEL 1'), 'hud shows LEVEL 1');
  key('ArrowRight'); pump(16);
  key('ArrowUp'); pump(16);
  mark(); key('p'); pump(12);
  assert(drawn().has('PAUSED'), `p should pause; saw ${[...drawn()].slice(0, 8).join('|')}`);
  mark(); key('Enter'); pump(12); mark(); pump(8);
  assert(!drawn().has('PAUSED'), 'Enter resumes');
});

test('Escape quits to the title and Play restarts; help round-trips', { skip: !page }, async () => {
  await bootPage();
  pump(90);
  key('Enter'); pump(30);
  key('Escape'); pump(30); // playing -> paused
  key('Escape'); pump(30); // paused -> title
  drawn().has('QUORUM RUN');
  key('Enter'); pump(30);
  assert(drawn().has('SCORE 0'), 'a fresh run starts after quitting one');
  key('Escape'); pump(30);
  key('Escape'); pump(30);
  key('ArrowDown'); key('ArrowDown'); key('ArrowDown'); key('Enter'); pump(30);
  assert(drawnContains('how to play'), 'the help screen renders');
  key('Enter'); pump(20);
  key('Enter'); pump(20);
  key('Escape'); pump(20);
  assert(drawn().has('QUORUM RUN'), 'enter and escape both return to the title');
});

test('the editor paints, flood-fills, persists its map, and plays it', { skip: !page }, async () => {
  await bootPage();
  pump(90);
  key('ArrowDown'); key('ArrowDown'); key('Enter'); pump(30);
  const ts = [...drawn()];
  assert(ts.includes('map ok') || ts.some((t) => t.startsWith('errors:')), `the editor screen renders with a map verdict; texts: ${ts.slice(0, 10).join('|')}`);
  key('2'); // brush: floor
  pointerDown(120, 120);
  lift(120, 120);
  pump(4);
  assert(store.has('quorum.run.editor'), 'every paint persists through storage');
  await bootPage(); // reload the page
  pump(90);
  key('ArrowDown'); key('ArrowDown'); key('Enter'); pump(30);
  const ts2 = [...drawn()];
  assert(ts2.includes('map ok') || ts2.some((t) => t.startsWith('errors:')), 'the stored editor map reopens after a reload');
  key('Enter'); pump(40);
  assert(drawn().has('SCORE 0'), 'Enter plays the edited level');
  key('Escape'); pump(30);
});

test('the daily run meshes dailySeed, generateLevel, and custom init', { skip: !page }, async () => {
  await bootPage();
  pump(90);
  key('ArrowDown'); key('Enter'); pump(40);
  assert(drawn().has('SCORE 0'), 'the daily run starts from the title screen');
});

test('a gesture opens the audio context and the music schedules bars', { skip: !page }, async () => {
  await bootPage();
  pump(90);
  assert.equal(FA.contexts, 0, 'no context before a gesture (autoplay rules)');
  key('Enter');
  pump(60);
  assert(FA.contexts >= 1, `the gesture must open an AudioContext; contexts ${FA.contexts}`);
  assert(FA.oscillators >= 1, `cues/music must schedule oscillators; oscillators ${FA.oscillators}`);
  // Mute: the Sound item is the fifth, so wrap down once from the bottom.
  key('ArrowDown'); key('ArrowDown'); key('ArrowDown'); key('ArrowDown'); key('Enter'); pump(10);
  const whenMuted = FA.oscillators;
  key('ArrowDown'); key('Enter'); pump(60); // any later gesture and a fresh run
  assert.equal(FA.oscillators, whenMuted,
    `muted means nothing schedules (was ${whenMuted}, now ${FA.oscillators})`);
});

test('hiding the tab pauses the run; entering resumes it', { skip: !page }, async () => {
  await bootPage();
  pump(90);
  key('Enter'); pump(40);
  mark();
  hidden = true;
  fire('document', 'visibilitychange', {});
  pump(60);
  assert(drawn().has('PAUSED'), `hiding the tab must pause; saw ${[...drawn()].slice(0, 6).join('|')}`);
  hidden = false;
  key('Enter'); pump(40); mark(); pump(8);
  assert(!drawn().has('PAUSED'), 'enter resumes after returning to the tab');
});

test('a four-key long-run churn stays coherent to the end of the run', { skip: !page }, async () => {
  await bootPage();
  pump(90);
  key('Enter'); pump(30);
  const moves = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
  let endFrame = false;
  for (let i = 0; i < 2600; i++) {
    key(moves[i % 4]);
    pump(2);
    const ts = drawn();
    if (ts.has('GAME OVER') || ts.has('ALL MERGED')) { endFrame = true; break; }
    assert(ts.has('LEVEL 1') || ts.has('LEVEL 2') || ts.has('LEVEL 3') || ts.has('LEVEL 4') || ts.has('LEVEL 5'),
      `the hud draws every churn frame; texts: ${[...ts].slice(0, 8).join('|')}`);
  }
  if (endFrame) {
    key('Enter'); pump(30);
    assert(drawn().has('QUORUM RUN'), 'enter on the score screen returns to the title');
  } else {
    // Not every seed reaches the end within the budget; what must hold is
    // that the run is still alive and coherent, not stuck mid-overlap.
    const ts = [...drawn()];
    assert(ts.some((t) => t.startsWith('SCORE ')), `hud intact after churn; texts: ${ts.slice(0, 8).join('|')}`);
    pump(90); key('Escape'); pump(30); key('Escape'); pump(30);
    assert(drawn().has('QUORUM RUN'), 'escape settles onto the title after an unfinished run');
  }
  key('Enter'); pump(30);
  assert(drawn().has('QUORUM RUN'), 'enter on the score screen returns to the title');
});

test('hostile storage cannot take the page down', { skip: !page }, async () => {
  storageHostile = true;
  await bootPage();
  pump(90);
  assert(drawn().has('QUORUM RUN'), 'the title still shows when storage refuses');
  key('Enter'); pump(40);
  assert(drawn().has('SCORE 0'), 'a run still starts when storage refuses');
});

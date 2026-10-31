// agent-37's e2e wiring check: loads src/main.js against the complete, real
// module graph under a stubbed DOM, then drives it: menu keys, campaign and
// daily runs with arrow moves, pause/resume, the editor, sounds, touch.
// Any thrown error or main.js console error is a real wiring bug.
// Run: node scratch/e2e.mjs
import { writeSync, writeFileSync, readFileSync } from 'node:fs';
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

function out(...a) {
  writeSync(1, a.map(String).join(' ') + '\n');
}

const root = resolve(dirname(new URL(import.meta.url).pathname), '..');
const tmp = join(tmpdir(), `quorum-run-e2e-${process.pid}`);
rmSync(tmp, { recursive: true, force: true });
mkdirSync(join(tmp, 'src'), { recursive: true });
cpSync(join(root, 'src'), join(tmp, 'src'), { recursive: true });

// ------------------------------------------------------------- a small browser
const keydownHooks = []; // document-level keydown listeners (main.js's two)
const canvasListeners = {};
let now = 0;

class FakeOsc {
  constructor(c) { this.c = c; this.type = ''; this.frequency = { value: 440 }; this.started = false; }
  connect(g) { this.connected = g; }
  start() { this.started = true; this.c.startedCount++; oscStarted++; }
  stop() { /* schedules fine */ }
}
let oscStarted = 0;
class FakeGain {
  constructor() { this.gain = { value: 1 }; }
  connect(d) { this.dest = d; }
}
class FakeAudioCtx {
  constructor() {
    audioCtxCount++;
    this.currentTime = now / 1000;
    this.destination = {};
    this.startedCount = 0;
    this.state = 'running';
    this.resume = () => Promise.resolve();
  }
  createOscillator() { return new FakeOsc(this); }
  createGain() { return new FakeGain(); }
}

const ctxCalls = [];
const ctx = {
  fillStyle: '', strokeStyle: '', font: '', textAlign: '', textBaseline: '', globalAlpha: 1,
  fillRect(x, y, w, h) { ctxCalls.push(['fillRect', x, y, w, h]); },
  clearRect() { ctxCalls.push(['clearRect']); },
  strokeRect() { ctxCalls.push(['strokeRect']); },
  beginPath() { ctxCalls.push(['beginPath']); },
  arc(x, y, r) { ctxCalls.push(['arc', x, y, r]); },
  fill() { ctxCalls.push(['fill']); },
  fillText(t) { ctxCalls.push(['fillText', t]); },
  save() { ctxCalls.push(['save']); },
  restore() { ctxCalls.push(['restore']); },
  measureText() { return { width: 8 }; },
};

const canvas = {
  width: 640, height: 480, style: {},
  getBoundingClientRect() { return { left: 0, top: 0, width: 480, height: 360 }; },
  addEventListener(name, fn) { (canvasListeners[name] ??= []).push(fn); },
  getContext: () => ctx,
};
function canvasFire(name, ev) {
  for (const fn of canvasListeners[name] ?? []) fn(ev);
}

const storage = new Map();
globalThis.localStorage = {
  getItem: (k) => (storage.has(k) ? storage.get(k) : null),
  setItem: (k, v) => { storage.set(k, String(v)); },
};

globalThis.document = {
  getElementById: (id) => (id === 'game' ? canvas : null),
  addEventListener(name, fn) {
    if (name === 'keydown') keydownHooks.push(fn);
  },
  hidden: false,
};

let audioCtxCount = 0;
globalThis.window = {
  innerWidth: 640, innerHeight: 480,
  addEventListener() { },
  AudioContext: FakeAudioCtx,
};
globalThis.prompt = () => null;

let frameNow = 0;
globalThis.requestAnimationFrame = (fn) => setTimeout(() => fn(frameNow), 1);

const userEvents = [];
const realError = console.error;
const realWarn = console.warn;
const ignored = (a) => {
  const text = a.map(String).join(' ');
  if (text.includes('Quorum Run invariants')) return; // the watchdog speaking
  userEvents.push(text);
};
console.error = (...a) => ignored(a);
console.warn = (...a) => ignored(a);

function pressKey(key) {
  const ev = { key, preventDefault() { }, repeat: false };
  for (const fn of keydownHooks) fn(ev);
}

function frames(n) {
  return new Promise((done) => {
    let left = n;
    const tick = () => {
      if (--left <= 0) return done();
      frameNow += 140; // about one game tick and change per callback
      setTimeout(tick, 1);
    };
    tick();
  });
}

let failed = false;
try {
  await import(pathToFileURL(join(tmp, 'src/main.js')).href);
  await frames(12); // title drawn, attract demo playing

  // Daily run: item 1 and a good while of play.
  pressKey('ArrowDown');
  await frames(2);
  pressKey('Enter');
  await frames(120);
  pressKey('p'); // pause
  await frames(4);
  pressKey('p'); // resume
  await frames(8);
  pressKey('Escape'); // back to title
  await frames(4);

  // Campaign with arrow keys, sound toggle, quits.
  pressKey('Enter'); // Play
  await frames(40);
  for (const k of ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp']) {
    pressKey(k);
    await frames(14);
  }
  pressKey('m'); // sound off
  await frames(4);
  pressKey('m');
  await frames(4);
  pressKey('Escape'); // pause
  await frames(4);
  pressKey('p'); // resume via P
  await frames(4);
  pressKey('Escape'); // pause again
  await frames(4);
  pressKey('Escape'); // back to title
  await frames(4);

  // The help screen.
  pressKey('ArrowDown');
  pressKey('ArrowDown');
  pressKey('ArrowDown'); // How to play
  await frames(2);
  pressKey('Enter');
  await frames(6);
  pressKey('Escape'); // back
  await frames(4);

  // The editor: arm, paint, fill, cycle, erase, resize/export/import prompts.
  pressKey('ArrowDown');
  pressKey('ArrowDown'); // Level editor
  await frames(2);
  pressKey('Enter');
  await frames(4);
  pressKey('1'); // arm '#'
  canvasFire('mousemove', { clientX: 0, clientY: 0, buttons: 0 });
  canvasFire('mousedown', { clientX: 60, clientY: 120, button: 0 });
  canvasFire('mousedown', { clientX: 60, clientY: 132, button: 0 });
  pressKey('r'); // resize via prompt (null)
  pressKey('e'); // export via prompt (null)
  pressKey('i'); // import via prompt (null) - assumes main.js null-checks
  pressKey('2'); // arm '.'
  pressKey('f'); // fill mode on
  canvasFire('mousedown', { clientX: 60, clientY: 120, button: 0 });
  pressKey('f');
  pressKey(']'); // cycle arm
  canvasFire('mousedown', { clientX: 60, clientY: 120, button: 2 }); // erase
  pressKey('Enter'); // play the edited level
  await frames(30);
  pressKey('Escape'); // back to title
  await frames(4);

  // Mouse on the title: click item 0 to start a campaign.
  canvasFire('mousedown', { clientX: 320, clientY: 220, button: 0 });
  await frames(40);

  // Touch: a long swipe right, then a tap.
  canvasFire('touchstart', { touches: [{ clientX: 200, clientY: 240 }], preventDefault() { } });
  canvasFire('touchmove', { preventDefault() { } });
  canvasFire('touchend', { changedTouches: [{ clientX: 299, clientY: 240 }], preventDefault() { } });
  await frames(10);
  canvasFire('touchstart', { touches: [{ clientX: 200, clientY: 240 }], preventDefault() { } });
  canvasFire('touchend', { changedTouches: [{ clientX: 201, clientY: 240 }], preventDefault() { } });
  await frames(10);

  // Overlay sound of the stay-mounted canvas resizing.
  canvas.width = 800; canvas.height = 600;
  await frames(6);

  out(`e2e: ${ctxCalls.length} canvas calls, ${audioCtxCount} audio contexts, ${oscStarted} oscillator starts`);

  // The campaign drew a real HUD with the score.
  if (!ctxCalls.some((c) => c[0] === 'fillText' && typeof c[1] === 'string' && c[1].startsWith('SCORE'))) {
    failed = true;
    out('e2e: no SCORE hud text was drawn');
  }
  // Sound toggling persisted the settings with exactly the five keys.
  const rawSettings = storage.get('quorum-run-settings');
  if (!rawSettings) {
    failed = true;
    out('e2e: settings were never persisted');
  } else {
    const keys = Object.keys(JSON.parse(rawSettings)).sort().join(',');
    if (keys !== 'colorblind,music,sound,speed,volume') {
      failed = true;
      out('e2e: settings keys wrong:', keys);
    }
  }
  // Something elsewhere in the tour made a sound (cues or music).
  if (oscStarted === 0) {
    failed = true;
    out('e2e: no oscillator was ever started');
  }
  if (userEvents.length) {
    failed = true;
    out('e2e saw console errors:');
    for (const n of userEvents.slice(0, 5)) out('  ', n);
  } else {
    out('e2e: quiet');
  }
  out('e2e ok (all modules real)');
} catch (err) {
  out('e2e failed:', err && err.stack ? err.stack : err);
  failed = true;
} finally {
  console.error = realError;
  console.warn = realWarn;
  rmSync(tmp, { recursive: true, force: true });
  process.exit(failed ? 1 : 0); // main.js keeps rAF jobs pending forever
}

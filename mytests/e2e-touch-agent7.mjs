// agent-7's e2e touch regression: loads src/main.js against a small stubbed
// DOM, walks the menu into the level editor, paints a cell, and then taps
// on the editor's grid. A touchend has no clientX of its own, so the tap
// must go through changedTouches[0]; if main.js ever reverts to feeding the
// event to canvasPos, the tap becomes NaN, crosses the gx<0 guard, and
// editorPaint throws. Any throw here is a wiring bug.
// Run: node mytests/e2e-touch-agent7.mjs
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeSync } from 'node:fs';

const out = (...a) => writeSync(1, a.map(String).join(' ') + '\n');

// The real module graph runs out of a temp copy so imports resolve as in the page.
const tmp = mkdtempSync(join(tmpdir(), 'qrcode-e2e7-'));
cpSync(join(dirname(new URL(import.meta.url).pathname), '..'), tmp, { recursive: true });

const docHandlers = {};
const canvasHandlers = {};
let now = 0;
let raf = null;
const ctxCalls = [];

const ctx = {
  fillStyle: '', strokeStyle: '', font: '', textAlign: '', textBaseline: '', globalAlpha: 1,
  fillRect(x, y, w, h) { ctxCalls.push(['fillRect', x, y, w, h]); },
  clearRect() { ctxCalls.push(['clearRect']); },
  strokeRect() { ctxCalls.push(['strokeRect']); },
  beginPath() { ctxCalls.push(['beginPath']); },
  arc() { ctxCalls.push(['arc']); },
  fill() { ctxCalls.push(['fill']); },
  fillText(t) { ctxCalls.push(['fillText', String(t)]); },
  save() {}, restore() {},
  measureText: () => ({ width: 8 }),
};

const canvas = {
  width: 640, height: 480, style: {},
  getBoundingClientRect() { return { left: 0, top: 0, width: 480, height: 360 }; },
  addEventListener(name, fn) { (canvasHandlers[name] ??= []).push(fn); },
  removeEventListener() {},
  getContext: () => ctx,
};
const canvasFire = (name, ev) => { for (const fn of canvasHandlers[name] || []) fn(ev); };

const document = {
  getElementById: () => canvas,
  addEventListener(name, fn) { (docHandlers[name] ??= []).push(fn); },
  removeEventListener() {},
};
const window = {
  innerWidth: 640, innerHeight: 480, devicePixelRatio: 1,
  requestAnimationFrame(fn) { raf = fn; },
  addEventListener(name, fn) { (docHandlers['win:' + name] ??= []).push(fn); },
  removeEventListener() {},
};
const pressKey = (key) => {
  const ev = { key, preventDefault() {} };
  for (const fn of docHandlers.keydown || []) fn(ev);
};
const frames = async (n) => {
  for (let i = 0; i < n; i++) { now += 16; if (raf) raf(now); }
};

globalThis.document = document;
globalThis.window = window;
globalThis.requestAnimationFrame = window.requestAnimationFrame;

let failed = false;
try {
  await import(pathToFileURL(join(tmp, 'src/main.js')).href);
  await frames(6); // boot: the title screen paints, the demo runs

  // Title -> the level editor (item 2).
  pressKey('ArrowDown');
  pressKey('ArrowDown');
  pressKey('Enter');
  await frames(4);

  // Arm '#' and paint a cell with the mouse so the tap acts on a real state.
  pressKey('1');
  canvasFire('mousemove', { clientX: 0, clientY: 0, buttons: 0, preventDefault() {} });
  canvasFire('mousedown', { clientX: 60, clientY: 120, button: 0, preventDefault() {} });
  await frames(2);

  // The regression: a tap (1px drag) on the editor's grid.
  canvasFire('touchstart', { touches: [{ clientX: 200, clientY: 240 }], preventDefault() {} });
  canvasFire('touchmove', { preventDefault() {} });
  canvasFire('touchend', { changedTouches: [{ clientX: 201, clientY: 240 }], preventDefault() {} });
  await frames(4);

  out('e2e-touch: survived the tap;', ctxCalls.length, 'canvas calls');
} catch (err) {
  failed = true;
  out('e2e-touch FAILED:', err && err.stack || err);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);

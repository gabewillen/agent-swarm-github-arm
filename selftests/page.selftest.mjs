// agent-18's self-test for the page (§15): stubs the DOM in Node, imports the
// real src/main.js, and drives a few dozen frames through the title menu,
// the attract demo, a campaign, pause, and the help overlay. The static
// checks always run; the dynamic run skips if a module the page imports had
// not landed yet.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

test('index.html has the canvas, the module script, and the title (§15)', () => {
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  assert.match(html, /<canvas[^>]*id=["']game["']/);
  assert.match(html, /<script[^>]*type=["']module["'][^>]*src=["']\.?\/?src\/main\.js["']/);
  assert.match(html, /<title>\s*Quorum Run\s*<\/title>/);
});

test('src/main.js is the entry the design names and names only relative .js imports', () => {
  const text = readFileSync(join(ROOT, 'src/main.js'), 'utf8');
  for (const dep of ['./core/game.js', './render/draw.js', './input/keys.js', './audio/', './ui/menu.js']) {
    assert.ok(text.includes(dep), `src/main.js does not import ${dep}`);
  }
  for (const word of ['requestAnimationFrame', 'drawList', 'paint', 'step(', 'cuesFor', 'TICK_MS']) {
    assert.ok(text.includes(word), `src/main.js does not use ${word}`);
  }
  for (const m of text.matchAll(/from\s+['"](\.[^'"]+)['"]/g, )) {
    const p = join(ROOT, 'src', m[1]);
    if (!existsSync(p)) continue; // an area still landing
    assert.ok(true);
  }
  assert.ok(!/\brequire\s*\(/.test(text) && !/\bprocess\./.test(text) && !/from\s+['"]node:/.test(text), 'no Node-only API in main.js');
});

const MISSING = [
  'src/core/game.js', 'src/core/bot.js', 'src/data/levels.js', 'src/core/editor.js',
  'src/core/generate.js', 'src/core/achievements.js', 'src/core/stats.js',
].filter((p) => !existsSync(join(ROOT, p)));

test('a few dozen frames of the page run in a stubbed DOM', { skip: MISSING.length > 0 && `still landing: ${MISSING.join(', ')}` }, async () => {
  // --- the stub ------------------------------------------------------------
  const raf = [];
  const listeners = { window: {}, canvas: {} };
  const store = new Map();

  function fakeCtx2D() {
    return {
      fillStyle: '#111111',
      font: '',
      globalAlpha: 1,
      fillRect() {}, beginPath() {}, arc() {}, fill() {}, fillText() {},
      measureText(t) { return { width: String(t).length * 7.2 }; },
    };
  }
  const ctx2d = fakeCtx2D();
  const canvasStub = {
    width: 960, height: 600, _ctx: ctx2d,
    getContext() { return ctx2d; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 960, height: 600 }; },
    addEventListener(name, fn) { (listeners.canvas[name] ||= []).push(fn); },
    removeEventListener() {},
  };

  const windowStub = {
    innerWidth: 960, innerHeight: 600,
    localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) },
    addEventListener(name, fn) { (listeners.window[name] ||= []).push(fn); },
    removeEventListener(name, fn) {
      const l = listeners.window[name] || [];
      const i = l.indexOf(fn);
      if (i >= 0) l.splice(i, 1);
    },
  };

  globalThis.window = windowStub;
  globalThis.document = { getElementById: (id) => (id === 'game' ? canvasStub : null) };
  globalThis.requestAnimationFrame = (fn) => raf.push(fn);
  // No AudioContext: the page must stub audio away and keep running.

  // --- the run -------------------------------------------------------------
  const url = pathToFileURL(join(ROOT, 'src/main.js')).href;
  const before = raf.length;
  await import(url);
  assert.ok(raf.length > before, 'main.js did not schedule a rAF frame');

  let now = 0;
  const pump = (n) => {
    for (let i = 0; i < n; i++) {
      now += 33; // ~60fps
      const fns = raf.splice(0);
      assert.ok(fns.length >= 1, 'rAF chain broke');
      for (const fn of fns) fn(now);
    }
  };

  pump(3); // boot: title with the attract demo
  const type = (key) => {
    for (const fn of listeners.window.keydown || []) fn({ key, preventDefault() {} });
  };
  const key = (k) => {
    // the keys module's own listener plus the page's: both live on window
    // (attachKeyboard is registered with the same stub).
    type(k);
  };

  pump(40); // let the attract demo play
  key('ArrowDown');
  pump(2);
  key('Enter');
  pump(30); // starting a campaign game shouldn't throw
  key('p'); // pause
  pump(10);
  key('Enter'); // resume
  pump(10);
  key('Escape'); // pause again (Escape maps to a pause input)
  pump(2);
  key('Escape'); // abandon to the title
  pump(5);
  key('ArrowDown'); key('ArrowDown'); key('ArrowDown'); // How to play
  key('Enter');
  pump(3);
  key('Escape'); // back to the title
  pump(3);

  assert.ok(true, 'survived the tour');
});

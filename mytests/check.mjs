// agent-37's own checks for the page (DESIGN.md §1, §15), mirroring the
// acceptance test's text expectations. Run: node mytests/check.mjs
// Not part of the acceptance suite; lives outside tests/.
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let bad = 0;
const fail = (msg) => { bad++; console.log('FAIL', msg); };
const ok = (msg) => console.log('ok  ', msg);

// index.html has the canvas, the module script, and the title
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
if (/<canvas[^>]*id=["']game["']/.test(html)) ok('index.html canvas#game'); else fail('index.html canvas#game');
if (/<script[^>]*type=["']module["'][^>]*src=["']\.?\/?src\/main\.js["']|<script[^>]*src=["']\.?\/?src\/main\.js["'][^>]*type=["']module["']/.test(html)) ok('index.html module script'); else fail('index.html module script');
if (/<title>\s*Quorum Run\s*<\/title>/.test(html)) ok('index.html title'); else fail('index.html title');

// src/main.js wires the game together
const text = readFileSync(join(ROOT, 'src/main.js'), 'utf8');
const deps = ['./core/game.js', './render/draw.js', './input/keys.js', './audio/', './ui/menu.js'];
for (const dep of deps) if (text.includes(dep)) ok(`main.js imports ${dep}`); else fail(`main.js imports ${dep}`);
for (const word of ['requestAnimationFrame', 'drawList', 'paint', 'step(', 'cuesFor', 'TICK_MS']) {
  if (text.includes(word)) ok(`main.js uses ${word}`); else fail(`main.js uses ${word}`);
}

// every import in src/ is relative and names its .js file; node-only API ban
for (const f of ['main.js']) {
  const src = readFileSync(join(ROOT, 'src', f), 'utf8');
  for (const m of src.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)) {
    if ((m[1].startsWith('./') || m[1].startsWith('../')) && m[1].endsWith('.js')) ok(`${f} import ${m[1]}`);
    else fail(`${f} import ${m[1]} (must be relative and .js)`);
  }
  if (/\brequire\s*\(/.test(src)) fail(`${f} uses require(`);
  if (/\bprocess\./.test(src)) fail(`${f} uses process.`);
  if (/from\s+['"]node:/.test(src)) fail(`${f} uses node: import`);
}

// queueability: every module src/main.js imports must exist
let ready = true;
for (const m of text.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
  const p = join(ROOT, 'src', m[1]);
  if (existsSync(p)) ok(`dependency exists ${m[1]}`);
  else { ready = false; fail(`dependency missing ${m[1]}`); }
}
console.log(ready ? 'READY: all of main.js dependencies exist' : 'NOT READY: missing modules above');

// a stricter extra: parse the page with the same rules ci/check.sh applies
import { execFileSync } from 'node:child_process';
for (const f of ['src/main.js']) {
  try {
    execFileSync('node', ['--check', f], { cwd: ROOT });
    ok(`${f} parses`);
  } catch {
    fail(`${f} does not parse`);
  }
}

process.exit(bad ? 1 : 0);

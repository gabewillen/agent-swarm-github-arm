import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { load, readRepo, srcFiles, ROOT } from './helpers.mjs';

const MODULES = {
  'core/constants.js': ['CARRY_MAX', 'START_LIVES', 'INVULN_TICKS', 'CONFLICT_TICKS', 'PATCH_BASE', 'SAME_COLOR_BONUS', 'TIME_BONUS_PER_TICK', 'COLORS', 'TICK_MS', 'DIRS', 'CLOCKWISE'],
  'core/rng.js': ['rngNext', 'rngInt'],
  'core/level.js': ['parseLevel', 'validateLevel'],
  'core/game.js': ['init', 'step', 'tileAt'],
  'core/invariants.js': ['checkState'],
  'core/bot.js': ['botInput'],
  'data/levels.js': ['LEVELS'],
  'render/palette.js': ['PALETTE'],
  'render/draw.js': ['HUD_HEIGHT', 'layout', 'drawList', 'paint'],
  'input/keys.js': ['keyToInput', 'swipeToInput', 'queuePush', 'queueTake', 'attachKeyboard', 'INPUT_QUEUE_MAX'],
  'audio/cues.js': ['CUES', 'cuesFor'],
  'audio/synth.js': ['createAudio'],
  'ui/menu.js': ['menuInit', 'menuReduce', 'menuItems', 'hudText'],
  'ui/scores.js': ['addScore', 'formatScore', 'parseTable'],
  'ui/settings.js': ['DEFAULT_SETTINGS', 'loadSettings', 'saveSettings', 'tickMs'],
  'core/replay.js': ['charOf', 'inputOf', 'recordReplay', 'encodeReplay', 'decodeReplay', 'playReplay'],
  'core/generate.js': ['hashSeed', 'dailySeed', 'generateLevel'],
  'core/editor.js': ['editorInit', 'editorPaint', 'editorFill', 'editorResize', 'editorErrors', 'editorExport', 'editorImport'],
  'core/achievements.js': ['ACHIEVEMENTS', 'checkAchievements'],
  'core/stats.js': ['statsInit', 'statsUpdate', 'statsLines'],
  'render/particles.js': ['PARTICLE_TTL', 'burst', 'stepParticles', 'particlesFor', 'particleOps'],
  'audio/music.js': ['SCALE', 'ROOT_HZ', 'noteHz', 'tempo', 'bar', 'scheduleBar'],
};

for (const [mod, names] of Object.entries(MODULES)) {
  test(`${mod} imports without a DOM and exports ${names.join(', ')}`, async () => {
    const m = await load(mod);
    for (const n of names) assert.ok(n in m, `${mod} lacks ${n}`);
  });
}

test('src/ uses no Node-only API', async () => {
  const files = srcFiles();
  assert.ok(files.length >= 23, `only ${files.length} modules`);
  for (const f of files) {
    const text = readRepo(f);
    assert.ok(!/\brequire\s*\(/.test(text), `${f}: require(`);
    assert.ok(!/\bprocess\./.test(text), `${f}: process.`);
    assert.ok(!/from\s+['"]node:/.test(text) && !/import\s*\(\s*['"]node:/.test(text), `${f}: node: import`);
    assert.ok(!/from\s+['"](fs|path|os|child_process|url)['"]/.test(text), `${f}: Node built-in import`);
  }
});

test('every import in src/ is relative and names its .js file', async () => {
  const files = srcFiles();
  assert.ok(files.length >= 23, `only ${files.length} modules`);
  for (const f of files) {
    for (const m of readRepo(f).matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)) {
      assert.ok(m[1].startsWith('./') || m[1].startsWith('../'), `${f}: ${m[1]}`);
      assert.ok(m[1].endsWith('.js'), `${f}: ${m[1]}`);
    }
  }
});

test('the core reads no clock, no Math.random, and no DOM', async () => {
  const core = srcFiles().filter((x) => x.startsWith('src/core/') || x.startsWith('src/data/'));
  assert.ok(core.length >= 12, `only ${core.length} core modules`);
  for (const f of core) {
    const text = readRepo(f);
    for (const bad of ['Math.random', 'Date.now', 'performance.now', 'document.', 'window.', 'new Date']) {
      assert.ok(!text.includes(bad), `${f}: ${bad}`);
    }
  }
});

test('index.html has the canvas, the module script, and the title', async () => {
  const html = readRepo('index.html');
  assert.match(html, /<canvas[^>]*id=["']game["']/);
  assert.match(html, /<script[^>]*type=["']module["'][^>]*src=["']\.?\/?src\/main\.js["']|<script[^>]*src=["']\.?\/?src\/main\.js["'][^>]*type=["']module["']/);
  assert.match(html, /<title>\s*Quorum Run\s*<\/title>/);
});

test('src/main.js wires the game together', async () => {
  assert.ok(existsSync(join(ROOT, 'src/main.js')), 'src/main.js is missing');
  const text = readRepo('src/main.js');
  for (const dep of ['./core/game.js', './render/draw.js', './input/keys.js', './audio/', './ui/menu.js']) {
    assert.ok(text.includes(dep), `src/main.js does not import ${dep}`);
  }
  for (const word of ['requestAnimationFrame', 'drawList', 'paint', 'step(', 'cuesFor', 'TICK_MS']) {
    assert.ok(text.includes(word), `src/main.js does not use ${word}`);
  }
});

test('every module in src/main.js\'s imports exists', async () => {
  const text = readRepo('src/main.js');
  for (const m of text.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
    assert.ok(existsSync(join(ROOT, 'src', m[1])), `src/main.js imports missing ${m[1]}`);
  }
});

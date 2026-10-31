// A co-owner cross-check (like dev/achievements.test.mjs): two contract
// spots that the acceptance suite covers only while src/core/game.js
// exists, plus a guard-setting mirror of the 23-browser purity scan. Run
// with `node --test dev/fixes-hud-purity.test.mjs`. Nothing here is
// loaded by tests/run.mjs, and tests/ stays exactly as given.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirnameOf(import.meta.url), '..');

function dirnameOf(url) {
  return new URL('.', url).pathname;
}

test('hudText reads the quorum off the parsed level (DESIGN.md §14)', async () => {
  const { hudText } = await import('../src/ui/menu.js');
  const { game } = await import('../tests/helpers.mjs');
  const s = await game(['#######', '#@.P.M#', '#..X..#', '#######'], { quorum: 4 });
  const text = hudText({ ...s, score: 50, lives: 2, merges: 3 });
  assert.deepEqual(text, ['SCORE 50', 'LIVES 2', 'MERGES 3/4', 'LEVEL 1']);
});

test('no core or data module names a banned API, even in a comment', () => {
  // The §15 contract bans these everywhere in the core; the 23-browser
  // test greps the raw text, so a comment that names them fails CI.
  const banned = ['Math.random', 'Date.now', 'performance.now', 'document.', 'window.', 'new Date'];
  const core = [];
  for (const dir of ['src/core', 'src/data']) {
    for (const name of readdirSync(join(ROOT, dir))) {
      if (name.endsWith('.js')) core.push(relative(ROOT, join(dir, name)));
    }
  }
  assert.ok(core.length >= 12, `only ${core.length} core modules`);
  for (const f of core) {
    const text = readFileSync(join(ROOT, f), 'utf8');
    for (const bad of banned) assert.ok(!text.includes(bad), `${f}: names ${bad}`);
  }
});

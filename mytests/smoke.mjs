// agent-18's own smoke check: loads src/main.js under a stubbed DOM with a
// real module graph. Modules that have not landed yet get generated stubs, so
// this always runs; as real modules land, the stubs disappear and main.js is
// exercised against the real game. Run: node mytests/smoke.mjs
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

const root = resolve(dirname(new URL(import.meta.url).pathname), '..');

// The documented exports of every module (DESIGN.md §1), for stubbing.
const STUBS = {
  'core/constants.js': 'CARRY_MAX=3,START_LIVES=3,INVULN_TICKS=6,CONFLICT_TICKS=10,PATCH_BASE=100,SAME_COLOR_BONUS=50,TIME_BONUS_PER_TICK=10,COLORS=4*TICK_MS=120,DIRS,CLOCKWISE',
  'core/rng.js': 'rngNext,rngInt',
  'core/level.js': 'parseLevel,validateLevel',
  'core/game.js': 'init,step,tileAt',
  'core/invariants.js': 'checkState',
  'core/bot.js': 'botInput',
  'data/levels.js': 'LEVELS',
  'render/palette.js': 'PALETTE',
  'render/draw.js': 'HUD_HEIGHT*layout,drawList,paint',
  'input/keys.js': 'keyToInput,swipeToInput,queuePush,queueTake,attachKeyboard,INPUT_QUEUE_MAX',
  'audio/cues.js': 'CUES|cuesFor',
  'audio/synth.js': 'createAudio',
  'ui/menu.js': 'menuInit,menuReduce|menuItems,hudText',
  'ui/scores.js': 'addScore,formatScore,parseTable',
  'ui/settings.js': 'DEFAULT_SETTINGS*#,loadSettings,saveSettings,tickMs',
  'core/replay.js': 'charOf,inputOf,recordReplay,encodeReplay,decodeReplay,playReplay',
  'core/generate.js': 'hashSeed,dailySeed,generateLevel',
  'core/editor.js': 'editorInit,editorPaint,editorFill,editorResize,editorErrors,editorExport,editorImport',
  'core/achievements.js': 'ACHIEVEMENTS*",checkAchievements',
  'core/stats.js': 'statsInit,statsUpdate,statsLines',
  'render/particles.js': 'PARTICLE_TTL*12,burst,stepParticles,particlesFor,particleOps',
  'audio/music.js': 'SCALE*#|ROOT_HZ*220,noteHz,tempo,bar,scheduleBar',
};

// Hand-made stub bodies for the modules main.js actually drives.
const BODIES = {
  'core/constants.js': `export const CARRY_MAX = 3; export const START_LIVES = 3; export const INVULN_TICKS = 6; export const CONFLICT_TICKS = 10; export const PATCH_BASE = 100; export const SAME_COLOR_BONUS = 50; export const TIME_BONUS_PER_TICK = 10; export const COLORS = 4; export const TICK_MS = 120; export const DIRS = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] }; export const CLOCKWISE = ['up', 'right', 'down', 'left'];`,
  'core/game.js': `const cells = Array.from({ length: 8 }, () => '........'); cells.push('########'); cells.unshift('########'); const level = { name: 'stub', width: 8, height: 10, tiles: cells, spawns: [], drifts: [] }; export function init(seed) { const s = { seed: seed >>> 0, tick: 0, levelTicks: 0, level, levelIndex: 0, player: { x: 1, y: 1 }, carried: [], patches: [], drifts: [], conflicts: [], score: 0, lives: 3, merges: 0, open: false, invuln: 0, status: 'playing', paused: false, events: [] }; return s; } export function step(state, input) { return { ...state, tick: state.tick + 1, events: [] }; } export function tileAt() { return '.'; }`,
  'core/bot.js': `export function botInput() { return { move: null, pause: false }; }`,
  'core/generate.js': `export function hashSeed(text) { let h = 0x811c9dc5; for (const ch of String(text)) { h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0; } return h; } export function dailySeed(date) { return /^\\d{4}-\\d{2}-\\d{2}$/.test(date) ? hashSeed('quorum-run:' + date) : null; } export function generateLevel(seed) { const rows = []; for (let y = 0; y < 11; y++) rows.push(y === 0 || y === 10 ? '#'.repeat(15) : y === 5 ? '#.P.M.X.@.#'.padEnd(15, '.') : '#'.repeat(0) + '.'.repeat(13) + '#'); return { name: 'Generated ' + (seed >>> 0), quorum: 5, par: 100, driftPeriod: 2, spawnEvery: 12, map: rows }; }`,
  'core/editor.js': `export function editorInit(width, height) { const w = Math.max(5, Math.min(32, width)); const h = Math.max(5, Math.min(24, height)); const map = []; for (let y = 0; y < h; y++) map.push((y === 0 || y === h - 1) ? '#'.repeat(w) : '#' + '.'.repeat(w - 2) + '#'); return { name: 'Untitled', quorum: 1, par: 100, driftPeriod: 2, spawnEvery: 20, map }; } export function editorPaint(def) { return def; } export function editorFill(def) { return def; } export function editorErrors() { return []; } export function editorExport(def) { return JSON.stringify(def); } export function editorImport(text) { try { const def = JSON.parse(text); return def && def.map ? def : null; } catch { return null; } }`,
  'core/replay.js': `export function charOf() { return '.'; } export function inputOf() { return { move: null, pause: false }; } export function recordReplay(seed, inputs) { return { seed: seed >>> 0, level: 0, moves: '.'.repeat(inputs.length) }; } export function encodeReplay(replay) { return 'QR1:' + replay.seed + ':0:' + replay.moves; } export function decodeReplay() { return null; } export function playReplay() { return null; }`,
  'core/achievements.js': `export const ACHIEVEMENTS = []; export function checkAchievements() { return []; }`,
  'core/stats.js': `export function statsInit() { return {}; } export function statsUpdate(stats) { return stats; } export function statsLines() { return []; }`,
  'core/level.js': `export function validateLevel() { return { ok: true, errors: [] }; } export function parseLevel(def) { return { ...def, width: def.map[0].length, height: def.map.length, tiles: def.map, start: { x: 1, y: 1 }, spawns: [], drifts: [] }; }`,
  'core/rng.js': `export function rngNext(seed) { return { value: 0.5, seed: seed >>> 0 }; } export function rngInt(seed, n) { return { value: 0, seed: seed >>> 0 }; }`,
  'core/invariants.js': `export function checkState() { return []; }`,
  'data/levels.js': `export const LEVELS = [];`,
  'render/palette.js': `export const PALETTE = { bg: '#111111', panel: '#1a1a1a', wall: '#2c2c2c', floor: '#161616', text: '#f2f2f2', dim: '#8f8f8f', accent: '#ffd400', danger: '#ff6b4a', agents: ['#c79bff', '#6aa8ff', '#ff9f45', '#4ade80'] };`,
  'render/draw.js': `export const HUD_HEIGHT = 48; export function layout() { return { cell: 24, ox: 0, oy: 48 }; } export function drawList(state, view) { return [{ op: 'rect', kind: 'bg', x: 0, y: 0, w: view.width, h: view.height, color: '#111111' }, { op: 'text', kind: 'hud', x: 8, y: 24, text: 'SCORE 0', color: '#f2f2f2', size: 14 }]; } export function paint() { }`,
  'render/particles.js': `export const PARTICLE_TTL = 12; export function burst(x, y, color) { return { particles: [], seed: 1 }; } export function stepParticles(p) { return p; } export function particlesFor() { return { particles: [], seed: 1 }; } export function particleOps() { return []; }`,
  'input/keys.js': `export const INPUT_QUEUE_MAX = 4; export function keyToInput() { return null; } export function swipeToInput() { return null; } export function queuePush(queue, input) { return queue.length >= 4 ? queue : queue.concat(input); } export function queueTake(queue) { return queue.length ? { input: queue[0], queue: queue.slice(1) } : { input: { move: null, pause: false }, queue: [] }; } export function attachKeyboard(target, onInput) { return () => { }; }`,
  'audio/cues.js': `export const CUES = {}; export function cuesFor() { return []; }`,
  'audio/synth.js': `export function createAudio() { return { play() { }, setMuted() { }, isMuted() { return true; } }; }`,
  'audio/music.js': `export const SCALE = [0, 2, 3, 5, 7, 8, 10]; export const ROOT_HZ = 220; export function noteHz(degree, octave) { return 220; } export function tempo() { return 96; } export function bar() { return Array(8).fill(null); } export function scheduleBar() { }`,
  'ui/menu.js': `export function menuInit() { return { screen: 'title', selected: 0, sound: true, mode: 'campaign' }; } export function menuItems() { return ['Play', 'Daily run', 'Level editor', 'How to play', 'Sound: on']; } export function menuReduce(menu, action) { const m = { ...menu }; if (menu.screen === 'title' && action === 'down') { m.selected = (m.selected + 1) % 5; return m; } if (menu.screen === 'title' && action === 'select') { if (m.selected === 0) m.screen = 'playing'; else if (m.selected === 1) { m.screen = 'playing'; m.mode = 'daily'; } else if (m.selected === 2) m.screen = 'editor'; else if (m.selected === 3) m.screen = 'help'; else { m.sound = !m.sound; } return m; } if (menu.screen === 'help' && action === 'back') { m.screen = 'title'; return m; } if (menu.screen === 'help' && action === 'select') { m.screen = 'title'; return m; } if (menu.screen === 'editor' && action === 'back') { m.screen = 'title'; return m; } if (menu.screen === 'editor' && action === 'select') { m.screen = 'playing'; m.mode = 'custom'; return m; } if (menu.screen === 'playing' && action === 'pause') { m.screen = 'paused'; return m; } if (menu.screen === 'paused' && action === 'pause') { m.screen = 'playing'; return m; } if (menu.screen === 'paused' && action === 'select') { m.screen = 'playing'; return m; } if (menu.screen === 'paused' && action === 'back') { m.screen = 'title'; return m; } if (menu.screen === 'playing' && action === 'gameover') { m.screen = 'over'; return m; } if (menu.screen === 'over' && action === 'select') { m.screen = 'title'; return m; } return menu; } export function hudText() { return []; }`,
  'ui/scores.js': `export function addScore(table, entry) { return [...table, entry].sort((a, b) => b.score - a.score).slice(0, 10); } export function formatScore(n) { return String(n).padStart(6, '0'); } export function parseTable() { return []; }`,
  'ui/settings.js': `export const DEFAULT_SETTINGS = { sound: true, music: true, volume: 0.8, speed: 'normal', colorblind: false }; export function loadSettings() { return { ...DEFAULT_SETTINGS }; } export function saveSettings(s) { return JSON.stringify(s); } export function tickMs() { return 120; }`,
};

// main.js's actual relative imports -> module paths under src/.
const mainText = readFileSync(join(root, 'src/main.js'), 'utf8');
const needed = [...mainText.matchAll(/from\s+['"](\.[^'"]+)['"]/g)].map((m) => m[1].replace(/^\.\//, ''));
const tmp = join(tmpdir(), `quorum-run-smoke-${process.pid}`);
rmSync(tmp, { recursive: true, force: true });
mkdirSync(join(tmp, 'src'), { recursive: true });
cpSync(join(root, 'index.html'), join(tmp, 'index.html'));
cpSync(join(root, 'package.json'), join(tmp, 'package.json'));
cpSync(join(root, 'src'), join(tmp, 'src'), { recursive: true });
const stubbed = [];
for (const rel of needed) {
  const target = join(tmp, 'src', rel);
  if (existsSync(target)) continue;
  const spec = STUBS[rel];
  if (!spec) throw new Error(`no stub spec for ${rel}`);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, BODIES[rel] ?? `export {} // stub for ${rel}: ${spec}`);
  stubbed.push(rel);
}

// A small browser.
const gameCanvas = {
  width: 640, height: 480, style: {},
  addEventListener() { },
  getContext: () => makeCtx(),
};
function makeCtx() {
  const noop = () => { };
  return { fillStyle: '', strokeStyle: '', font: '', textAlign: '', textBaseline: '', fillRect: noop, strokeRect: noop, clearRect: noop, beginPath: noop, arc: noop, fill: noop, fillText: noop, save: noop, restore: noop, measureText: () => ({ width: 0 }) };
}
globalThis.document = {
  getElementById: (id) => (id === 'game' ? gameCanvas : null),
  addEventListener() { },
  hidden: false,
};
globalThis.window = {
  innerWidth: 640, innerHeight: 480,
  addEventListener() { },
  AudioContext: undefined,
};
globalThis.localStorage = { getItem: () => null, setItem() { } };
globalThis.requestAnimationFrame = (fn) => setTimeout(() => fn(performance.now()), 16);
globalThis.prompt = () => null;

try {
  await import(pathToFileURL(join(tmp, 'src/main.js')).href);
  // A few ticks of stepping and frames of drawing, then done.
  await new Promise((done) => setTimeout(done, 800));
  const note = stubbed.length ? ` (stubbed: ${stubbed.join(', ')})` : ' (all modules real)';
  console.log(`smoke ok: main.js loaded, stepped, and drew${note}`);
  process.exit(0);
} catch (err) {
  console.error('smoke failed:', err && err.stack ? err.stack : err);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

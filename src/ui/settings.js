// DESIGN.md §17 — player settings.
// Settings are plain data: the five keys of DEFAULT_SETTINGS, no more.
// loadSettings ignores everything it does not know (a wrong type, an
// unknown key, text that is not a JSON object) rather than failing, so a
// corrupt or older save still gives a playable game.

import { TICK_MS } from '../core/constants.js';

export const DEFAULT_SETTINGS = {
  sound: true,
  music: true,
  volume: 0.8,
  speed: 'normal',
  colorblind: false,
};

const KEYS = ['sound', 'music', 'volume', 'speed', 'colorblind'];
const SPEEDS = ['slow', 'normal', 'fast'];
const TICK_OF = new Map([['slow', 160], ['normal', TICK_MS], ['fast', 90]]);

function settingsFrom(value) {
  const from = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const s = { ...DEFAULT_SETTINGS };
  for (const key of ['sound', 'music', 'colorblind']) {
    if (typeof from[key] === 'boolean') s[key] = from[key];
  }
  if (typeof from.volume === 'number' && Number.isFinite(from.volume)) {
    s.volume = Math.min(1, Math.max(0, from.volume));
  }
  if (SPEEDS.includes(from.speed)) s.speed = from.speed;
  return s;
}

/** The defaults, with every valid field of the JSON `text` applied. */
export function loadSettings(text) {
  let data = null;
  if (typeof text === 'string') {
    try {
      data = JSON.parse(text);
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }
  return settingsFrom(data);
}

/** JSON holding exactly the five keys, whatever else was passed in. */
export function saveSettings(settings) {
  const s = settingsFrom(settings);
  const out = {};
  for (const key of KEYS) out[key] = s[key];
  return JSON.stringify(out);
}

/** Real milliseconds per tick for a settings object (or its saved text). */
export function tickMs(settings) {
  const s = typeof settings === 'string' ? loadSettings(settings) : settingsFrom(settings);
  return TICK_OF.get(s.speed) ?? TICK_OF.get('normal');
}

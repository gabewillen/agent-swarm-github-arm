// Player settings (DESIGN.md §17): stored as JSON, loaded leniently —
// every valid field of the saved text is applied, anything else falls back
// to the defaults.

import { TICK_MS } from '../core/constants.js';

export const DEFAULT_SETTINGS = {
  sound: true,
  music: true,
  volume: 0.8,
  speed: 'normal',
  colorblind: false,
};

// loadSettings(text) parses JSON and returns the defaults with every valid
// field of it applied: sound, music, and colorblind booleans, volume a
// number clamped to [0, 1], speed one of 'slow', 'normal', 'fast'. Wrong
// types, unknown keys, and text that is not a JSON object are ignored.
export function loadSettings(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }
  const out = { ...DEFAULT_SETTINGS };
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return out;
  for (const key of ['sound', 'music', 'colorblind']) {
    if (typeof parsed[key] === 'boolean') out[key] = parsed[key];
  }
  if (typeof parsed.volume === 'number' && Number.isFinite(parsed.volume)) {
    out.volume = Math.min(1, Math.max(0, parsed.volume));
  }
  if (parsed.speed === 'slow' || parsed.speed === 'normal' || parsed.speed === 'fast') {
    out.speed = parsed.speed;
  }
  return out;
}

// saveSettings(settings) returns JSON holding exactly the five keys.
export function saveSettings(settings) {
  const s = settings || {};
  return JSON.stringify({
    sound: s.sound,
    music: s.music,
    volume: s.volume,
    speed: s.speed,
    colorblind: s.colorblind,
  });
}

// tickMs(settings) is the real milliseconds per step for the game loop.
export function tickMs(settings) {
  const speed = settings ? settings.speed : null;
  if (speed === 'slow') return 160;
  if (speed === 'fast') return 90;
  return TICK_MS;
}

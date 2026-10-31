// Player settings (DESIGN.md §17): five fields, saved as JSON of exactly
// those keys, loaded from forgiving JSON that ignores what it doesn't know.

import { TICK_MS } from '../core/constants.js';

export const DEFAULT_SETTINGS = { sound: true, music: true, volume: 0.8, speed: 'normal', colorblind: false };

function applied(settings) {
  const out = { ...DEFAULT_SETTINGS };
  if (settings === null || typeof settings !== 'object' || Array.isArray(settings)) return out;
  for (const key of ['sound', 'music', 'colorblind']) {
    if (typeof settings[key] === 'boolean') out[key] = settings[key];
  }
  if (typeof settings.volume === 'number' && Number.isFinite(settings.volume)) {
    out.volume = Math.min(Math.max(settings.volume, 0), 1);
  }
  if (settings.speed === 'slow' || settings.speed === 'normal' || settings.speed === 'fast') {
    out.speed = settings.speed;
  }
  return out;
}

export function loadSettings(text) {
  try {
    return applied(JSON.parse(text));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings) {
  const withDefaults = applied(settings);
  return JSON.stringify({
    sound: withDefaults.sound,
    music: withDefaults.music,
    volume: withDefaults.volume,
    speed: withDefaults.speed,
    colorblind: withDefaults.colorblind,
  });
}

export function tickMs(settings) {
  return settings.speed === 'slow' ? 160 : settings.speed === 'fast' ? 90 : TICK_MS;
}

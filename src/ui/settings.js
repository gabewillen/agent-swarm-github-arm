// Player settings (DESIGN.md §17). loadSettings validates stored JSON and
// falls back to the defaults for anything invalid; saveSettings stores
// exactly the five known keys; tickMs turns the speed setting into real
// milliseconds per game tick.

import { TICK_MS } from '../core/constants.js';

export const DEFAULT_SETTINGS = {
  sound: true,
  music: true,
  volume: 0.8,
  speed: 'normal',
  colorblind: false,
};

const SPEED_MS = { slow: 160, fast: 90 };
const SPEEDS = ['slow', 'normal', 'fast'];

/**
 * Parse JSON settings text and return the defaults with every valid field
 * of it applied. Wrong types, unknown keys, and text that is not a JSON
 * object are ignored; volume is clamped to [0, 1].
 */
export function loadSettings(text) {
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return { ...DEFAULT_SETTINGS };
  }
  const settings = { ...DEFAULT_SETTINGS };
  if (typeof value.sound === 'boolean') settings.sound = value.sound;
  if (typeof value.music === 'boolean') settings.music = value.music;
  if (typeof value.colorblind === 'boolean') settings.colorblind = value.colorblind;
  if (typeof value.volume === 'number' && Number.isFinite(value.volume)) {
    settings.volume = Math.min(1, Math.max(0, value.volume));
  }
  if (typeof value.speed === 'string' && SPEEDS.includes(value.speed)) {
    settings.speed = value.speed;
  }
  return settings;
}

/** Serialize settings as JSON holding exactly the five known keys. */
export function saveSettings(settings) {
  return JSON.stringify({
    sound: settings.sound,
    music: settings.music,
    volume: settings.volume,
    speed: settings.speed,
    colorblind: settings.colorblind,
  });
}

/** Real milliseconds per game tick: 160 for slow, TICK_MS for normal, 90 for fast. */
export function tickMs(settings) {
  if (settings.speed === 'slow') return SPEED_MS.slow;
  if (settings.speed === 'fast') return SPEED_MS.fast;
  return TICK_MS;
}

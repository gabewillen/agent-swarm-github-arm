// DESIGN.md §17: player settings, stored as JSON by the page (§15).
import { TICK_MS } from '../core/constants.js';

export const DEFAULT_SETTINGS = {
  sound: true,
  music: true,
  volume: 0.8,
  speed: 'normal',
  colorblind: false,
};

const SPEEDS = ['slow', 'normal', 'fast'];
const SPEED_TICKS = { slow: 160, normal: TICK_MS, fast: 90 };

// Parses JSON settings text and returns the defaults with every valid
// field applied; wrong types, unknown keys, and text that is not a JSON
// object are ignored.
export function loadSettings(text) {
  const settings = { ...DEFAULT_SETTINGS };
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return settings;
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return settings;
  if (typeof data.sound === 'boolean') settings.sound = data.sound;
  if (typeof data.music === 'boolean') settings.music = data.music;
  if (typeof data.colorblind === 'boolean') settings.colorblind = data.colorblind;
  if (typeof data.volume === 'number') settings.volume = Math.min(1, Math.max(0, data.volume));
  if (SPEEDS.includes(data.speed)) settings.speed = data.speed;
  return settings;
}

// JSON holding exactly the five keys.
export function saveSettings(settings) {
  const s = { ...DEFAULT_SETTINGS, ...(settings && typeof settings === 'object' ? settings : {}) };
  return JSON.stringify({
    sound: s.sound,
    music: s.music,
    volume: s.volume,
    speed: s.speed,
    colorblind: s.colorblind,
  });
}

// Real milliseconds per tick at the player's chosen speed.
export function tickMs(settings) {
  const speed = settings && typeof settings === 'object' ? settings.speed : undefined;
  return SPEED_TICKS[speed] ?? SPEED_TICKS.normal;
}

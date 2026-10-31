// Player settings (DESIGN.md §17).
//
// Settings are `{ sound, music, volume, speed, colorblind }`. Loading and
// saving apply only the valid fields; anything else is ignored.

import { TICK_MS } from '../core/constants.js';

export const DEFAULT_SETTINGS = {
  sound: true,
  music: true,
  volume: 0.8,
  speed: 'normal',
  colorblind: false,
};

// Applies the valid fields of `source` onto `target`, in place. A wrong
// type, a speed outside the three names, or an unknown key is ignored;
// `volume` clamps to [0, 1].
function applySettings(target, source) {
  if (source === null || typeof source !== 'object' || Array.isArray(source)) return;
  if (typeof source.sound === 'boolean') target.sound = source.sound;
  if (typeof source.music === 'boolean') target.music = source.music;
  if (typeof source.colorblind === 'boolean') target.colorblind = source.colorblind;
  if (typeof source.volume === 'number' && Number.isFinite(source.volume)) {
    target.volume = Math.min(1, Math.max(0, source.volume));
  }
  if (source.speed === 'slow' || source.speed === 'normal' || source.speed === 'fast') {
    target.speed = source.speed;
  }
}

// Parses a saved settings text and returns the defaults with every valid
// field applied. Bad text (not a JSON object) leaves the defaults alone.
export function loadSettings(text) {
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }
  const settings = { ...DEFAULT_SETTINGS };
  applySettings(settings, parsed);
  return settings;
}

// Returns JSON holding exactly the five settings keys. Extra fields of the
// given settings are dropped; invalid fields fall back to their defaults.
export function saveSettings(settings) {
  const valid = { ...DEFAULT_SETTINGS };
  applySettings(valid, settings);
  return JSON.stringify(valid);
}

// Real milliseconds per tick at the chosen speed.
export function tickMs(settings) {
  const speed = settings !== null && typeof settings === 'object' ? settings.speed : undefined;
  if (speed === 'slow') return 160;
  if (speed === 'fast') return 90;
  return TICK_MS;
}

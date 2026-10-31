// §17 Player settings. `loadSettings` applies every valid field of a JSON
// object over the defaults and ignores everything else; `saveSettings`
// writes exactly the five keys; `tickMs` turns a speed into milliseconds
// per tick in the browser.

import { TICK_MS } from '../core/constants.js';

export const DEFAULT_SETTINGS = { sound: true, music: true, volume: 0.8, speed: 'normal', colorblind: false };

const SPEEDS = new Set(['slow', 'normal', 'fast']);

export function loadSettings(text) {
  const out = { ...DEFAULT_SETTINGS };
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return out;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return out;
  if (typeof parsed.sound === 'boolean') out.sound = parsed.sound;
  if (typeof parsed.music === 'boolean') out.music = parsed.music;
  if (typeof parsed.volume === 'number' && Number.isFinite(parsed.volume)) {
    out.volume = Math.min(1, Math.max(0, parsed.volume));
  }
  if (typeof parsed.speed === 'string' && SPEEDS.has(parsed.speed)) out.speed = parsed.speed;
  if (typeof parsed.colorblind === 'boolean') out.colorblind = parsed.colorblind;
  return out;
}

export function saveSettings(settings) {
  const s = settings && typeof settings === 'object' ? settings : DEFAULT_SETTINGS;
  const out = {
    sound: s.sound,
    music: s.music,
    volume: s.volume,
    speed: s.speed,
    colorblind: s.colorblind,
  };
  return JSON.stringify(out);
}

export function tickMs(settings) {
  const speed = settings && typeof settings === 'object' ? settings.speed : null;
  if (speed === 'slow') return 160;
  if (speed === 'fast') return 90;
  return TICK_MS;
}

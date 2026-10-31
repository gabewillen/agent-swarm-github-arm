// Quorum Run §17 — player settings (src/ui/settings.js).
//
// Stored as JSON with exactly the five keys below. Pure: no DOM, no
// randomness, no mutation of the arguments.

export const DEFAULT_SETTINGS = {
  sound: true,
  music: true,
  volume: 0.8,
  speed: 'normal',
  colorblind: false,
};

const SPEEDS = ['slow', 'normal', 'fast'];

// Milliseconds per tick by speed ('slow' 160, 'normal' TICK_MS = §2's 120,
// 'fast' 90).
const SPEED_MS = { slow: 160, normal: 120, fast: 90 };

// Validates every field of `src` and writes it onto `out`.
function apply(src, out) {
  if (src === null || typeof src !== 'object' || Array.isArray(src)) return out;
  if (typeof src.sound === 'boolean') out.sound = src.sound;
  if (typeof src.music === 'boolean') out.music = src.music;
  if (typeof src.colorblind === 'boolean') out.colorblind = src.colorblind;
  if (typeof src.volume === 'number' && Number.isFinite(src.volume)) {
    out.volume = Math.min(1, Math.max(0, src.volume));
  }
  if (SPEEDS.includes(src.speed)) out.speed = src.speed;
  return out;
}

// `loadSettings(text)` parses JSON and returns the defaults with every
// valid field of it applied; anything else is ignored.
export function loadSettings(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
  return apply(data, { ...DEFAULT_SETTINGS });
}

// `saveSettings(settings)` returns JSON holding exactly the five keys.
export function saveSettings(settings) {
  return JSON.stringify(apply(settings, { ...DEFAULT_SETTINGS }));
}

// `tickMs(settings)` is 160 for 'slow', 120 for 'normal', 90 for 'fast'.
export function tickMs(settings) {
  return SPEED_MS[settings && settings.speed] ?? SPEED_MS.normal;
}

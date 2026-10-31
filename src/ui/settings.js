// Player settings (DESIGN.md §17).
//
// Settings live somewhere persistent (localStorage in the page) as the JSON
// of saveSettings; loadSettings reads that JSON back, forgiving anything it
// cannot trust and falling back to the defaults. This module has no
// imports: it stays loadable on its own, and §17 fixes the tick values it
// returns ('normal' is §2's TICK_MS, 120).

const TICK_MS = 120;

export const DEFAULT_SETTINGS = {
  sound: true,
  music: true,
  volume: 0.8,
  speed: 'normal',
  colorblind: false,
};

const SPEEDS = ['slow', 'normal', 'fast'];

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

// The defaults with every valid field of src applied; wrong types, unknown
// keys, and non-objects are ignored.
function normalize(src) {
  const out = { ...DEFAULT_SETTINGS };
  if (typeof src.sound === 'boolean') out.sound = src.sound;
  if (typeof src.music === 'boolean') out.music = src.music;
  if (typeof src.volume === 'number' && Number.isFinite(src.volume)) {
    out.volume = Math.min(1, Math.max(0, src.volume));
  }
  if (SPEEDS.includes(src.speed)) out.speed = src.speed;
  if (typeof src.colorblind === 'boolean') out.colorblind = src.colorblind;
  return out;
}

// loadSettings(text) parses JSON and returns the defaults with every valid
// field applied; anything else falls back to the defaults.
export function loadSettings(text) {
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }
  return normalize(isPlainObject(data) ? data : {});
}

// saveSettings(settings) returns JSON holding exactly the five keys.
export function saveSettings(settings) {
  return JSON.stringify(normalize(isPlainObject(settings) ? settings : {}));
}

// tickMs(settings) is 160 for 'slow', TICK_MS (120) for 'normal', and 90
// for 'fast'.
export function tickMs(settings) {
  const speed = isPlainObject(settings) ? settings.speed : 'normal';
  if (speed === 'slow') return 160;
  if (speed === 'fast') return 90;
  return TICK_MS;
}

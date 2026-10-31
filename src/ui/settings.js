// Quorum Run — player settings and game speed (DESIGN.md §17).
//
// Settings live on disk (or in storage) as JSON text; these functions turn
// that text into a validated settings object and back, and map the speed
// setting to real milliseconds per tick. Every function here is pure.

// The TICK_MS of DESIGN.md §2, mirrored so this module stays loadable
// before `src/core/constants.js` lands.
const TICK_MS = 120;

export const DEFAULT_SETTINGS = {
  sound: true,
  music: true,
  volume: 0.8,
  speed: 'normal',
  colorblind: false,
};

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// Parses JSON text and returns the defaults with every valid field of it
// applied. Wrong types, unknown keys, and text that is not a JSON object
// are ignored.
export function loadSettings(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
  if (!isPlainObject(data)) return { ...DEFAULT_SETTINGS };
  const settings = { ...DEFAULT_SETTINGS };
  if (typeof data.sound === 'boolean') settings.sound = data.sound;
  if (typeof data.music === 'boolean') settings.music = data.music;
  if (typeof data.volume === 'number' && Number.isFinite(data.volume)) {
    settings.volume = Math.max(0, Math.min(1, data.volume));
  }
  if (data.speed === 'slow' || data.speed === 'normal' || data.speed === 'fast') {
    settings.speed = data.speed;
  }
  if (typeof data.colorblind === 'boolean') settings.colorblind = data.colorblind;
  return settings;
}

// JSON holding exactly the five keys.
export function saveSettings(settings) {
  const src = isPlainObject(settings) ? settings : {};
  const out = {};
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    out[key] = key in src ? src[key] : DEFAULT_SETTINGS[key];
  }
  return JSON.stringify(out);
}

// Real milliseconds per tick: 160 for slow, TICK_MS for normal, 90 for fast.
export function tickMs(settings) {
  const speed = settings && typeof settings === 'object' ? settings.speed : null;
  if (speed === 'slow') return 160;
  if (speed === 'fast') return 90;
  return TICK_MS;
}

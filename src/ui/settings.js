// Quorum Run — player settings (DESIGN.md §17).
// Pure: no DOM, no storage; the caller passes saved text in and out.

// { sound, music, volume, speed, colorblind } — §17.
export const DEFAULT_SETTINGS = {
  sound: true,
  music: true,
  volume: 0.8,
  speed: 'normal',
  colorblind: false,
};

const SPEEDS = ['slow', 'normal', 'fast'];

const clampVolume = (v) => Math.min(1, Math.max(0, v));

// Whether a value is a plain JSON object (not null, not an array).
const isJsonObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

// Parses saved JSON and returns the defaults with every valid field of it
// applied. A wrong type, an unknown key, or text that is not a JSON
// object is ignored. Never changes DEFAULT_SETTINGS.
export function loadSettings(text) {
  const out = { ...DEFAULT_SETTINGS };
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return out;
  }
  if (!isJsonObject(parsed)) return out;
  if (typeof parsed.sound === 'boolean') out.sound = parsed.sound;
  if (typeof parsed.music === 'boolean') out.music = parsed.music;
  if (SPEEDS.includes(parsed.speed)) out.speed = parsed.speed;
  if (typeof parsed.colorblind === 'boolean') out.colorblind = parsed.colorblind;
  if (typeof parsed.volume === 'number' && Number.isFinite(parsed.volume)) {
    out.volume = clampVolume(parsed.volume);
  }
  return out;
}

// JSON holding exactly the five keys, with the same fallbacks as
// loadSettings for fields that are missing or of a wrong type.
export function saveSettings(settings) {
  const src = isJsonObject(settings) ? settings : {};
  const out = {
    sound: typeof src.sound === 'boolean' ? src.sound : DEFAULT_SETTINGS.sound,
    music: typeof src.music === 'boolean' ? src.music : DEFAULT_SETTINGS.music,
    volume: clampVolume(
      typeof src.volume === 'number' && Number.isFinite(src.volume)
        ? src.volume
        : DEFAULT_SETTINGS.volume,
    ),
    speed: SPEEDS.includes(src.speed) ? src.speed : DEFAULT_SETTINGS.speed,
    colorblind:
      typeof src.colorblind === 'boolean' ? src.colorblind : DEFAULT_SETTINGS.colorblind,
  };
  return JSON.stringify(out);
}

// Real milliseconds per tick: 160 for 'slow', TICK_MS (§2, 120) for
// 'normal', 90 for 'fast'.
export function tickMs(settings) {
  const speed = isJsonObject(settings) ? settings.speed : DEFAULT_SETTINGS.speed;
  if (speed === 'slow') return 160;
  if (speed === 'fast') return 90;
  return 120; // TICK_MS of src/core/constants.js
}

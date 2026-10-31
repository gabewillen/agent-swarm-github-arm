// §14 — player settings and how they shape the run loop. The module is
// deliberately importable from anywhere, including Node-side tests: it
// never touches `window` or `localStorage`. It defaults to the darkest
// sensible boards: the palette's `bg` with `wall` blocks left alone.
//
// DEFAULT_SETTINGS is the record accepted by every menu; `loadSettings`
// is the friendly front door for whatever survived a page reload, and
// `saveSettings`/`tickMs` close the loop. `speed` only ever narrows to
// one of the three speeds, so the game's tick stays mechanical even when
// a stored value drifts.
import { TICK_MS } from '../core/constants.js';

// The five fields a settings record may have; anything else is not a
// setting and is dropped on save.
export const DEFAULT_SETTINGS = {
  sound: true,
  music: true,
  volume: 0.8,
  speed: 'normal',
  colorblind: false,
};

const SPEEDS = ['slow', 'normal', 'fast'];
const isBoolean = (v) => typeof v === 'boolean';
const isNumber = (v) => typeof v === 'number' && Number.isFinite(v);

// §14 — parse JSON text and fold it over the defaults, field by field.
// A wrong type, an unknown key, or text that does not parse to a plain
// object leaves the field (or all of them) as shipped.
export function loadSettings(text) {
  if (typeof text !== 'string') return { ...DEFAULT_SETTINGS };
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ...DEFAULT_SETTINGS };
  }
  const out = { ...DEFAULT_SETTINGS };
  if (isBoolean(parsed.sound)) out.sound = parsed.sound;
  if (isBoolean(parsed.music)) out.music = parsed.music;
  if (isBoolean(parsed.colorblind)) out.colorblind = parsed.colorblind;
  if (isNumber(parsed.volume)) {
    out.volume = Math.min(1, Math.max(0, parsed.volume));
  }
  if (SPEEDS.includes(parsed.speed)) out.speed = parsed.speed;
  return out;
}

// §14 — the JSON actually stored: exactly the five keys, extras dropped.
// Missing fields fall back to their default so the record round-trips.
export function saveSettings(settings) {
  const s = settings && typeof settings === 'object' && !Array.isArray(settings)
    ? settings
    : {};
  return JSON.stringify({
    sound: isBoolean(s.sound) ? s.sound : DEFAULT_SETTINGS.sound,
    music: isBoolean(s.music) ? s.music : DEFAULT_SETTINGS.music,
    volume: isNumber(s.volume)
      ? Math.min(1, Math.max(0, s.volume))
      : DEFAULT_SETTINGS.volume,
    speed: SPEEDS.includes(s.speed) ? s.speed : DEFAULT_SETTINGS.speed,
    colorblind: isBoolean(s.colorblind) ? s.colorblind : DEFAULT_SETTINGS.colorblind,
  });
}

// §14 — milliseconds per game tick at the settings' speed: 160 for slow,
// TICK_MS (120) for normal, 90 for fast.
export function tickMs(settings) {
  const speed = settings && typeof settings === 'object' && SPEEDS.includes(settings.speed)
    ? settings.speed
    : DEFAULT_SETTINGS.speed;
  if (speed === 'slow') return 160;
  if (speed === 'fast') return 90;
  return TICK_MS;
}

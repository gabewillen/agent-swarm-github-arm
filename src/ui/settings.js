// Player settings (DESIGN.md §17): five keys, loaded leniently from JSON
// text (whatever a caller stored for main.js). Nothing here touches the
// DOM or storage; every function is pure.

export const DEFAULT_SETTINGS = {
  sound: true,
  music: true,
  volume: 0.8,
  speed: 'normal',
  colorblind: false,
};

const SPEEDS = ['slow', 'normal', 'fast'];

const SLOW_TICK_MS = 160; // §17 for speed 'slow'
const TICK_MS = 120;      // §2's TICK_MS, the 'normal' tick
const FAST_TICK_MS = 90;  // §17 for speed 'fast'

// loadSettings(text) parses JSON and returns the defaults with every
// valid field of it applied: sound, music, and colorblind booleans,
// volume a number clamped to [0, 1], speed one of 'slow', 'normal',
// 'fast'; anything else (a wrong type, an unknown key, text that is not
// a JSON object) is ignored.
export function loadSettings(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return { ...DEFAULT_SETTINGS };
  }
  const out = { ...DEFAULT_SETTINGS };
  if (typeof data.sound === 'boolean') out.sound = data.sound;
  if (typeof data.music === 'boolean') out.music = data.music;
  if (typeof data.colorblind === 'boolean') out.colorblind = data.colorblind;
  if (typeof data.volume === 'number') out.volume = Math.min(1, Math.max(0, data.volume));
  if (typeof data.speed === 'string' && SPEEDS.includes(data.speed)) out.speed = data.speed;
  return out;
}

// saveSettings(settings) returns JSON holding exactly the five keys.
export function saveSettings(settings) {
  const s = settings && typeof settings === 'object' ? settings : {};
  return JSON.stringify({
    sound: typeof s.sound === 'boolean' ? s.sound : DEFAULT_SETTINGS.sound,
    music: typeof s.music === 'boolean' ? s.music : DEFAULT_SETTINGS.music,
    volume: typeof s.volume === 'number'
      ? Math.min(1, Math.max(0, s.volume))
      : DEFAULT_SETTINGS.volume,
    speed: SPEEDS.includes(s.speed) ? s.speed : DEFAULT_SETTINGS.speed,
    colorblind: typeof s.colorblind === 'boolean' ? s.colorblind : DEFAULT_SETTINGS.colorblind,
  });
}

// tickMs(settings) is 160 for 'slow', TICK_MS for 'normal', 90 for 'fast'.
export function tickMs(settings) {
  const speed = settings && typeof settings === 'object' ? settings.speed : null;
  if (speed === 'slow') return SLOW_TICK_MS;
  if (speed === 'fast') return FAST_TICK_MS;
  return TICK_MS;
}

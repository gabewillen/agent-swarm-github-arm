// Player settings (DESIGN.md §17). loadSettings and saveSettings move
// settings through JSON text; only the five known keys exist, and every
// invalid field falls back to its default. tickMs is the real
// milliseconds per tick the game loop should run at.

export const DEFAULT_SETTINGS = {
  sound: true,
  music: true,
  volume: 0.8,
  speed: 'normal',
  colorblind: false,
};

const SPEEDS = ['slow', 'normal', 'fast'];
const SPEED_MS = { slow: 160, normal: 120, fast: 90 };

// The defaults with every valid field of `obj` applied; anything else
// (a wrong type, an unknown key) is ignored.
function apply(obj) {
  const s = { ...DEFAULT_SETTINGS };
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return s;
  if (typeof obj.sound === 'boolean') s.sound = obj.sound;
  if (typeof obj.music === 'boolean') s.music = obj.music;
  if (typeof obj.colorblind === 'boolean') s.colorblind = obj.colorblind;
  if (typeof obj.volume === 'number' && Number.isFinite(obj.volume)) {
    s.volume = Math.min(1, Math.max(0, obj.volume));
  }
  if (SPEEDS.includes(obj.speed)) s.speed = obj.speed;
  return s;
}

export function loadSettings(text) {
  let obj;
  try {
    obj = JSON.parse(text);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
  return apply(obj);
}

// JSON holding exactly the five keys.
export function saveSettings(settings) {
  const s = apply(settings);
  return JSON.stringify({
    sound: s.sound,
    music: s.music,
    volume: s.volume,
    speed: s.speed,
    colorblind: s.colorblind,
  });
}

// The loop's tick length for the chosen speed (§2's TICK_MS at normal).
export function tickMs(settings) {
  const speed = apply(settings).speed;
  return SPEED_MS[speed];
}

// Player settings (DESIGN.md §17): a small record the page saves and
// loads, with every invalid field falling back to its default.

export const DEFAULT_SETTINGS = { sound: true, music: true, volume: 0.8, speed: 'normal', colorblind: false };

// The five settings keys and, per key, a check that the stored value is
// its right type. A value that fails is ignored, not clamped (except
// volume, which clamps to [0, 1]).
const CHECKS = {
  sound: { read: (v) => typeof v === 'boolean', take: (v) => v },
  music: { read: (v) => typeof v === 'boolean', take: (v) => v },
  colorblind: { read: (v) => typeof v === 'boolean', take: (v) => v },
  volume: {
    read: (v) => typeof v === 'number' && Number.isFinite(v),
    take: (v) => Math.min(1, Math.max(0, v)),
  },
  speed: { read: (v) => SPEEDS.includes(v), take: (v) => v },
};

const SPEEDS = ['slow', 'normal', 'fast'];

// A plain object holding the defaults, fresh every call so callers may
// change any field of theirs.
function defaults() {
  return { ...DEFAULT_SETTINGS };
}

// `loadSettings(text)` parses saved JSON and returns the defaults with
// every valid field applied; anything else keeps the default.
export function loadSettings(text) {
  let data;
  try { data = JSON.parse(text); } catch { return defaults(); }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return defaults();
  const out = defaults();
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    const check = CHECKS[key];
    if (check.read(data[key])) out[key] = check.take(data[key]);
  }
  return out;
}

// `saveSettings(settings)` returns JSON holding exactly the five keys.
export function saveSettings(settings) {
  const src = settings !== null && typeof settings === 'object' && !Array.isArray(settings)
    ? settings : {};
  const out = defaults();
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    const check = CHECKS[key];
    if (check.read(src[key])) out[key] = check.take(src[key]);
  }
  return JSON.stringify(out);
}

// `tickMs(settings)` maps the speed to real milliseconds per tick (§2's
// TICK_MS is 120).
export function tickMs(settings) {
  const speed = settings !== null && typeof settings === 'object' ? settings.speed : undefined;
  if (speed === 'slow') return 160;
  if (speed === 'fast') return 90;
  return 120;
}

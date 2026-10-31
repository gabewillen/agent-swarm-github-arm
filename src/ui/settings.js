// Quorum Run — §17: player settings, persisted as JSON (localStorage).

export const DEFAULT_SETTINGS = {
  sound: true,
  music: true,
  volume: 0.8,
  speed: 'normal',
  colorblind: false,
};

// The only speeds, and `tickMs`'s value for each (`TICK_MS` of §2 for
// 'normal').
const SPEEDS = ['slow', 'normal', 'fast'];
const TICK_MS = { slow: 160, normal: 120, fast: 90 };

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function clampNumber(value, low, high) {
  return Math.min(high, Math.max(low, value));
}

// Parse JSON settings text and return the defaults with every valid field
// of it applied. A wrong type, an unknown key, or text that is not a JSON
// object is ignored. Never changes `DEFAULT_SETTINGS`.
export function loadSettings(text) {
  const settings = { ...DEFAULT_SETTINGS };
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return settings;
  }
  if (!isObject(parsed)) return settings;
  if (typeof parsed.sound === 'boolean') settings.sound = parsed.sound;
  if (typeof parsed.music === 'boolean') settings.music = parsed.music;
  if (typeof parsed.colorblind === 'boolean') settings.colorblind = parsed.colorblind;
  if (typeof parsed.volume === 'number' && !Number.isNaN(parsed.volume)) {
    settings.volume = clampNumber(parsed.volume, 0, 1);
  }
  if (SPEEDS.includes(parsed.speed)) settings.speed = parsed.speed;
  return settings;
}

// JSON holding exactly the five keys; missing or invalid fields fall back
// to the defaults.
export function saveSettings(settings) {
  const s = isObject(settings) ? settings : {};
  return JSON.stringify({
    sound: typeof s.sound === 'boolean' ? s.sound : DEFAULT_SETTINGS.sound,
    music: typeof s.music === 'boolean' ? s.music : DEFAULT_SETTINGS.music,
    volume:
      typeof s.volume === 'number' && !Number.isNaN(s.volume)
        ? clampNumber(s.volume, 0, 1)
        : DEFAULT_SETTINGS.volume,
    speed: SPEEDS.includes(s.speed) ? s.speed : DEFAULT_SETTINGS.speed,
    colorblind: typeof s.colorblind === 'boolean' ? s.colorblind : DEFAULT_SETTINGS.colorblind,
  });
}

// Real milliseconds per tick: 160 for 'slow', 120 for 'normal', 90 for
// 'fast'.
export function tickMs(settings) {
  const speed = settings && settings.speed;
  return TICK_MS[SPEEDS.includes(speed) ? speed : 'normal'];
}

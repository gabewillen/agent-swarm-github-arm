// Quorum Run — §14: the high-score table.
// A table is an array of `{ name, score }` entries, best first.

// The table keeps the best this many entries.
const TABLE_MAX = 10;

// Return a new table with `entry` placed after every entry with a higher
// or equal score, cut to the best TABLE_MAX entries. Never changes
// `table`.
export function addScore(table, entry) {
  const list = [];
  let placed = false;
  for (const existing of table) {
    if (!placed && existing.score < entry.score) {
      list.push(entry);
      placed = true;
    }
    list.push(existing);
  }
  if (!placed) list.push(entry);
  return list.slice(0, TABLE_MAX);
}

// The score as 6 digits with leading zeros, capped at '999999'.
export function formatScore(n) {
  return String(Math.min(n, 999999)).padStart(6, '0');
}

// Parse a JSON high-score table: an array whose every entry is an object
// with a string `name` and an integer `score`. Anything else is an empty
// table.
export function parseTable(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  for (const entry of parsed) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      return [];
    }
    if (typeof entry.name !== 'string' || !Number.isInteger(entry.score)) {
      return [];
    }
  }
  return parsed;
}

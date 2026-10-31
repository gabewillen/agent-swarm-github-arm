// Quorum Run — the high-score table (DESIGN.md §14).
// Pure: every function returns new data and never changes its argument.

// A table is an array of `{ name, score }` entries, best first.

const TABLE_MAX = 10;

// Returns a new table with `entry` placed after every entry with a higher
// or equal score, cut to the best 10. The argument is not changed.
export function addScore(table, entry) {
  const rows = Array.isArray(table) ? table : [];
  const out = [];
  let placed = false;
  for (const row of rows) {
    if (!placed && entry.score > row.score) {
      out.push({ name: entry.name, score: entry.score });
      placed = true;
    }
    out.push({ name: row.name, score: row.score });
  }
  if (!placed) out.push({ name: entry.name, score: entry.score });
  return out.slice(0, TABLE_MAX);
}

// The score as 6 digits with leading zeros, capped at '999999'.
export function formatScore(n) {
  return String(Math.min(999999, Math.max(0, Math.floor(n)))).padStart(6, '0');
}

// Parses a JSON table: an array of `{ name, score }` where name is a
// string and score an integer. Anything else returns [].
export function parseTable(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  for (const row of parsed) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return [];
    if (typeof row.name !== 'string') return [];
    if (!Number.isInteger(row.score)) return [];
  }
  return parsed;
}

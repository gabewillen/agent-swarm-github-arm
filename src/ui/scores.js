// The high-score table (DESIGN.md §14): an array of { name, score },
// best first, kept at the ten best entries.

// The table holds at most the best ten scores.
const TOP = 10;

// addScore(table, entry) returns a new table with the entry placed after
// every entry with a higher or equal score, cut to the best ten. Neither
// the table nor the entry is changed.
export function addScore(table, entry) {
  const out = table.slice();
  let at = out.length;
  for (let i = 0; i < out.length; i++) {
    if (out[i].score < entry.score) {
      at = i;
      break;
    }
  }
  out.splice(at, 0, entry);
  return out.length > TOP ? out.slice(0, TOP) : out;
}

// formatScore(n) is the score as six digits with leading zeros, capped at
// '999999'.
export function formatScore(n) {
  const v = Number.isFinite(n) ? Math.max(0, Math.min(999999, Math.floor(n))) : 0;
  return String(v).padStart(6, '0');
}

// parseTable(text) parses a JSON table and returns [] for anything that is
// not an array of { name: string, score: integer } entries.
export function parseTable(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const table = [];
  for (const entry of parsed) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
    if (typeof entry.name !== 'string' || !Number.isInteger(entry.score)) return [];
    table.push({ name: entry.name, score: entry.score });
  }
  return table;
}

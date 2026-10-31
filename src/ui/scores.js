// DESIGN.md §14: the high-score table. A table is an array of
// { name, score } entries, best first. Every function here is pure.
const MAX_ENTRIES = 10;

// Returns a new table with the entry placed after every entry with a
// higher or equal score, cut to the best 10. Never changes its arguments.
export function addScore(table, entry) {
  const list = Array.isArray(table) ? table : [];
  const placed = { name: entry.name, score: entry.score };
  const out = [];
  let done = false;
  for (const e of list) {
    if (!done && e.score < entry.score) {
      out.push(placed);
      done = true;
    }
    out.push(e);
  }
  if (!done) out.push(placed);
  return out.slice(0, MAX_ENTRIES);
}

// The score as 6 digits with leading zeros, capped at '999999'.
export function formatScore(n) {
  const value = Math.floor(Number(n) || 0);
  return String(Math.min(999999, Math.max(0, value))).padStart(6, '0');
}

// Parses a JSON table; [] for anything that is not an array of entries
// whose name is a string and whose score is an integer.
export function parseTable(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  for (const e of data) {
    if (e === null || typeof e !== 'object' || Array.isArray(e)) return [];
    if (typeof e.name !== 'string' || !Number.isInteger(e.score)) return [];
  }
  return data;
}

// The high-score table (DESIGN.md §14): an array of `{ name, score }`
// entries, best first, kept to the best 10. Every function here is pure:
// addScore never changes the table or the entry it is given.

/**
 * Return a new table with `entry` placed after every entry that has a
 * higher or equal score, cut to the best 10.
 */
export function addScore(table, entry) {
  const out = table.slice();
  let at = 0;
  while (at < out.length && out[at].score >= entry.score) at++;
  out.splice(at, 0, { name: entry.name, score: entry.score });
  return out.slice(0, 10);
}

/** The score as 6 digits with leading zeros, and '999999' above that. */
export function formatScore(n) {
  if (!Number.isFinite(n) || n >= 999999) return '999999';
  if (n <= 0) return '000000';
  return String(Math.floor(n)).padStart(6, '0');
}

/** Parse a JSON table of entries; [] for anything that is not one. */
export function parseTable(text) {
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(value)) return [];
  const table = [];
  for (const item of value) {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) return [];
    if (typeof item.name !== 'string' || !Number.isInteger(item.score)) return [];
    table.push({ name: item.name, score: item.score });
  }
  return table;
}

// Quorum Run — the high-score table (DESIGN.md §14).
//
// A table is an array of `{ name, score }` entries, best first, kept to at
// most 10 entries. Every function here is pure.

const MAX_ENTRIES = 10;

// Returns a new table with `entry` placed after every entry with a higher
// or equal score, cut to the best MAX_ENTRIES entries.
export function addScore(table, entry) {
  const list = Array.isArray(table) ? table : [];
  let index = 0;
  while (index < list.length && list[index].score >= entry.score) index++;
  return [...list.slice(0, index), entry, ...list.slice(index)].slice(0, MAX_ENTRIES);
}

// The score as 6 digits with leading zeros, '999999' above that.
export function formatScore(n) {
  const value = Number.isFinite(n) ? Math.max(0, Math.min(999999, Math.floor(n))) : 0;
  return String(value).padStart(6, '0');
}

// Parses a JSON table; [] for anything that is not an array of
// `{ name: string, score: integer }`.
export function parseTable(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  const table = [];
  for (const item of data) {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) return [];
    if (typeof item.name !== 'string' || !Number.isInteger(item.score)) return [];
    table.push({ name: item.name, score: item.score });
  }
  return table;
}

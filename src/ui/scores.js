// DESIGN.md §14 — the high-score table.
// A table is a plain array of `{ name, score }`, best first, at most 10
// long, ties in the order they arrived. Nothing here touches storage: the
// caller loads and saves the text, and this module only shapes it.

const MAX_ENTRIES = 10;
const MAX_SCORE = 999999; // formatScore's width is 6 digits (§14).

function entryOf(value) {
  if (!value || typeof value !== 'object') return null;
  const name = typeof value.name === 'string' ? value.name : null;
  const score = Number.isInteger(value.score) ? value.score : null;
  if (name === null || score === null) return null;
  return { name, score };
}

/**
 * A new table with `entry` placed after every entry that scored at least
 * as much (so a tie lands behind the older entry), cut to the best 10.
 * Never changes `table` or its entries.
 */
export function addScore(table, entry) {
  const item = entryOf(entry) || { name: '', score: 0 };
  const list = (Array.isArray(table) ? table : [])
    .map(entryOf)
    .filter((e) => e !== null);
  let i = 0;
  while (i < list.length && list[i].score >= item.score) i++;
  list.splice(i, 0, item);
  return list.slice(0, MAX_ENTRIES);
}

/** The score as 6 digits with leading zeros; `'999999'` above that. */
export function formatScore(n) {
  const v = Number.isFinite(n) ? Math.trunc(n) : 0;
  if (v >= MAX_SCORE) return String(MAX_SCORE);
  return String(Math.max(0, v)).padStart(6, '0');
}

/**
 * A JSON table back into the array of entries, or `[]` for anything that
 * is not one: text that is not JSON, not an array, or an element that is
 * not `{ name: string, score: integer }`.
 */
export function parseTable(text) {
  let data;
  try {
    data = JSON.parse(typeof text === 'string' ? text : '');
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  const list = [];
  for (const element of data) {
    const e = entryOf(element);
    if (e === null) return [];
    list.push(e);
  }
  return list;
}

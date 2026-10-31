// Quorum Run §14 — the high-score table (src/ui/scores.js).
//
// A table is an array of `{ name, score }`, best first. Pure: no DOM, no
// randomness, no mutation of the arguments.

// A copy of an entry in table shape.
function entryOf(e) {
  return { name: e.name, score: e.score };
}

// `addScore(table, entry)` returns a new table with the entry placed after
// every entry with a higher or equal score, cut to the best 10. The table
// and the entry are left alone; a tie goes after the earlier entries.
export function addScore(table, entry) {
  const base = Array.isArray(table) ? table : [];
  const e = { name: entry.name, score: entry.score };
  let i = 0;
  while (i < base.length && base[i].score >= e.score) i++;
  return [...base.slice(0, i), e, ...base.slice(i)].slice(0, 10);
}

// `formatScore(n)` is the score as 6 digits with leading zeros, and
// '999999' above that.
export function formatScore(n) {
  const v = Math.max(0, Math.min(999999, Math.floor(Number(n) || 0)));
  return String(v).padStart(6, '0');
}

// `parseTable(text)` parses a JSON table and returns `[]` for anything that
// is not an array of `{ name: string, score: integer }`.
export function parseTable(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  const table = [];
  for (const e of data) {
    if (e === null || typeof e !== 'object' || Array.isArray(e)) return [];
    const { name, score } = e;
    if (typeof name !== 'string' || !Number.isInteger(score)) return [];
    table.push({ name, score });
  }
  return table;
}

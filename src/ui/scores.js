// The high-score table (DESIGN.md §14).
//
// A table is an array of `{ name, score }` entries, best first. Every
// function here is pure: none changes the table it is given.

const TABLE_MAX = 10;
const SCORE_CAP = 999999;

// Returns a new table with `entry` placed after every entry with a higher
// or equal score, cut to the best 10. Ties keep the earlier entry first.
export function addScore(table, entry) {
  const rows = Array.isArray(table) ? table : [];
  const inserted = { name: entry.name, score: entry.score };
  let at = 0;
  while (at < rows.length && rows[at].score >= inserted.score) at++;
  const next = [...rows.slice(0, at), inserted, ...rows.slice(at)];
  return next.slice(0, TABLE_MAX);
}

// The score as 6 digits with leading zeros, capped at 999999.
export function formatScore(n) {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v)) return '000000';
  const score = Math.min(SCORE_CAP, Math.max(0, v));
  return String(score).padStart(6, '0');
}

// Parses a JSON high-score table. Anything that is not an array whose
// every element is `{ name: string, score: integer }` becomes `[]`.
export function parseTable(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const rows = [];
  for (const item of parsed) {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) return [];
    if (typeof item.name !== 'string') return [];
    if (!Number.isInteger(item.score)) return [];
    rows.push({ name: item.name, score: item.score });
  }
  return rows;
}

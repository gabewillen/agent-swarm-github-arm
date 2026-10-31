// The high-score table (DESIGN.md §14). A table is an array of
// { name, score }, best first. All three functions are pure and never
// change their arguments.

const MAX_SCORES = 10;
const CAP = 999999;
const DIGITS = 6;

// A new entry goes after every entry with a higher or equal score
// (ties stay with the earlier entry), and only the best 10 are kept.
export function addScore(table, entry) {
  const rows = [];
  let placed = false;
  for (const row of table) {
    if (!placed && entry.score > row.score) {
      rows.push({ name: entry.name, score: entry.score });
      placed = true;
    }
    rows.push({ name: row.name, score: row.score });
  }
  if (!placed) rows.push({ name: entry.name, score: entry.score });
  return rows.slice(0, MAX_SCORES);
}

// The score as 6 digits with leading zeros, capped at the cap.
export function formatScore(n) {
  const value = Math.max(0, Math.min(CAP, n));
  return String(value).padStart(DIGITS, '0');
}

// A valid table is a JSON array of { name: string, score: integer }
// entries; anything else is an empty table.
export function parseTable(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out = [];
  for (const row of parsed) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return [];
    if (typeof row.name !== 'string') return [];
    if (typeof row.score !== 'number' || !Number.isInteger(row.score)) return [];
    out.push({ name: row.name, score: row.score });
  }
  return out;
}

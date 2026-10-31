// The high-score table (DESIGN.md §14).
//
// A table is an array of `{ name, score }`, best first. Every function here
// is pure: a table in is never changed, a new table comes out.

const TABLE_MAX = 10;

// addScore(table, entry) returns a new table with the entry placed after
// every entry with a higher or equal score, cut to the best 10.
export function addScore(table, entry) {
  const rows = Array.isArray(table) ? table : [];
  const fresh = { name: entry.name, score: entry.score };
  const next = [];
  let placed = false;
  for (const row of rows) {
    // First entry with a strictly lower score: the new one goes before it
    // (that is, after every entry with a higher or equal score).
    if (!placed && row.score < fresh.score) {
      next.push(fresh);
      placed = true;
    }
    next.push(row);
  }
  if (!placed) next.push(fresh);
  return next.slice(0, TABLE_MAX);
}

// formatScore(n) is the score as 6 digits with leading zeros, capped at
// '999999' above that.
export function formatScore(n) {
  const v = Number.isFinite(n) ? Math.min(999999, Math.max(0, Math.floor(n))) : 0;
  return String(v).padStart(6, '0');
}

// parseTable(text) parses a JSON table and returns [] for anything that is
// not an array of { name: string, score: integer }.
export function parseTable(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  const out = [];
  for (const row of data) {
    if (row === null || typeof row !== 'object' || Array.isArray(row)) return [];
    if (typeof row.name !== 'string' || !Number.isInteger(row.score)) return [];
    out.push({ name: row.name, score: row.score });
  }
  return out;
}

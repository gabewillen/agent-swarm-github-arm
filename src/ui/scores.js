// The high-score table (DESIGN.md §14): an array of { name, score },
// best first. Every function here is pure and frugal: nothing touches
// the DOM, nothing mutates its arguments, and the caller keeps the
// returned table wherever it wants (localStorage belongs to main.js).

// addScore(table, entry) returns a new table with entry placed after
// every entry with a higher or equal score, cut to the best 10.
export function addScore(table, entry) {
  const base = Array.isArray(table) ? table : [];
  const next = [...base, entry];
  // Sort by score descending; the sort is stable, so an equal score
  // keeps the entry after the earlier ones, as the design asks.
  next.sort((a, b) => b.score - a.score);
  return next.slice(0, SCORE_LIMIT);
}

// formatScore(n) is the score as 6 digits with leading zeros, capped
// at '999999'.
export function formatScore(n) {
  const v = Math.min(Math.max(Math.floor(Number(n) || 0), 0), SCORE_CAP);
  return String(v).padStart(6, '0');
}

// parseTable(text) parses a JSON table and returns [] for anything that
// is not an array of { name: string, score: integer }.
export function parseTable(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  for (const item of data) {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) return [];
    if (typeof item.name !== 'string') return [];
    if (typeof item.score !== 'number' || !Number.isInteger(item.score)) return [];
  }
  return data;
}

const SCORE_LIMIT = 10;
const SCORE_CAP = 999999;

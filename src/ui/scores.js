// The high-score table (DESIGN.md §14): best first, kept to ten, with a
// frugal six-digit formatter and a forgiving parser for saved JSON.

const MAX = 10;

export function addScore(table, entry) {
  const best = table.slice();
  // After every entry whose score is higher or equal; earlier entries stay
  // ahead of a newcomer on a tie.
  let at = best.length;
  for (let i = 0; i < best.length; i++) {
    if (best[i].score < entry.score) {
      at = i;
      break;
    }
  }
  best.splice(at, 0, entry);
  return best.slice(0, MAX);
}

export function formatScore(n) {
  const clamped = Math.min(Math.max(Math.trunc(n), 0), 999999);
  return String(clamped).padStart(6, '0');
}

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
    if (e === null || typeof e !== 'object') continue;
    if (typeof e.name !== 'string' || !Number.isInteger(e.score)) continue;
    table.push({ name: e.name, score: e.score });
  }
  return table;
}

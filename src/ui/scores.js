// §14 The high-score table: an array of { name, score }, best first.

const LIMIT = 10;
const MAX_SCORE = 999999;

export function addScore(table, entry) {
  const rows = Array.isArray(table) ? table : [];
  const out = [];
  let placed = false;
  for (const row of rows) {
    if (!placed && row.score < entry.score) {
      out.push({ ...entry });
      placed = true;
    }
    out.push(row);
  }
  if (!placed) out.push({ ...entry });
  return out.slice(0, LIMIT);
}

export function formatScore(n) {
  const v = Math.max(0, Math.floor(Number(n)));
  return v > MAX_SCORE ? String(MAX_SCORE) : String(v).padStart(6, '0');
}

export function parseTable(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const table = [];
  for (const entry of parsed) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
    if (typeof entry.name !== 'string') return [];
    if (!Number.isInteger(entry.score)) return [];
    table.push({ name: entry.name, score: entry.score });
  }
  return table;
}

// The high-score table (DESIGN.md §14). A table is an array of
// { name, score }, best first. Every function here is pure and never
// changes its argument, and never touches the DOM: the page (§15) owns
// storage, this module owns the shape.

// The table keeps at most this many entries.
export const TABLE_MAX = 10;

// `addScore(table, entry)` places the entry after every entry with a
// higher or equal score, and cuts the table to the best TABLE_MAX entries.
export function addScore(table, entry) {
  const rows = Array.isArray(table) ? table : [];
  const item = { name: entry.name, score: entry.score };
  // The first row the new entry beats; the entry goes in front of it.
  let at = rows.length;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].score < item.score) { at = i; break; }
  }
  const next = rows.slice(0, at);
  next.push(item);
  for (let i = at; i < rows.length; i++) next.push(rows[i]);
  return next.slice(0, TABLE_MAX);
}

// `formatScore(n)` renders a score as 6 digits with leading zeros, capped
// at '999999' for anything above.
export function formatScore(n) {
  const v = Math.min(Math.max(Math.floor(Number(n) || 0), 0), 999999);
  return String(v).padStart(6, '0');
}

// An entry of the table: a plain object with a string name and an integer
// score.
function isEntry(e) {
  return typeof e === 'object' && e !== null && !Array.isArray(e) &&
    typeof e.name === 'string' && Number.isInteger(e.score);
}

// `parseTable(text)` parses a JSON table, or returns [] for anything that
// is not an array of well-formed entries.
export function parseTable(text) {
  let data;
  try { data = JSON.parse(text); } catch { return []; }
  if (!Array.isArray(data)) return [];
  const out = [];
  for (const e of data) {
    if (!isEntry(e)) return [];
    out.push({ name: e.name, score: e.score });
  }
  return out;
}

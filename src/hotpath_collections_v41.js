export function findLastMatching(rows, predicate) {
  if (!Array.isArray(rows) || typeof predicate !== "function") return null;
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index];
    if (predicate(row, index, rows)) return row;
  }
  return null;
}

export function collectLastMatching(rows, limit, predicate) {
  if (!Array.isArray(rows) || typeof predicate !== "function") return [];
  const max = Math.max(0, Math.floor(Number(limit) || 0));
  if (!max) return [];

  const out = [];
  for (let index = rows.length - 1; index >= 0 && out.length < max; index -= 1) {
    const row = rows[index];
    if (predicate(row, index, rows)) out.push(row);
  }
  out.reverse();
  return out;
}

/**
 * ARKA — Search helpers
 *
 * `LIKE` queries must escape `%` and `_` from user input, otherwise a query such
 * as "50%" matches every row. SQLite needs an explicit ESCAPE clause, hence
 * ESCAPE_LIKE below (use it right after the placeholder).
 */

export const ESCAPE_LIKE = "ESCAPE '\\'";

/** Build a `%query%` pattern with SQL LIKE wildcards escaped. */
export function likePattern(query = '') {
  const escaped = String(query).replace(/[\\%_]/g, ch => `\\${ch}`);
  return `%${escaped}%`;
}

export default { likePattern, ESCAPE_LIKE };

/** Page sizes offered on every paginated table, and the default. */
export const PAGE_SIZES = [10, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 10;

export type PageQuery = Record<string, string | undefined>;

/** Reads ?page and ?per (falls back to page 1, 10 rows) and the row range for that page. */
export function readPaging(q: PageQuery) {
  const page = Math.max(1, Math.floor(Number(q.page) || 1));
  const per = (PAGE_SIZES as readonly number[]).includes(Number(q.per)) ? Number(q.per) : DEFAULT_PAGE_SIZE;
  const from = (page - 1) * per;
  return { page, per, from, to: from + per - 1 };
}

export const pageCount = (total: number, per: number) => Math.max(1, Math.ceil(total / per));

/**
 * URL for `path` with the current query and some keys replaced. Empty values, page 1 and the
 * default page size are left out so URLs stay short.
 */
export function withQuery(path: string, q: PageQuery, over: PageQuery = {}) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...q, ...over })) {
    if (!v) continue;
    if (k === 'page' && v === '1') continue;
    if (k === 'per' && v === String(DEFAULT_PAGE_SIZE)) continue;
    p.set(k, v);
  }
  const s = p.toString();
  return s ? `${path}?${s}` : path;
}

/** The rows of one page from a list held in memory (aggregated lists, master data). */
export function slicePage<T>(rows: T[], q: PageQuery) {
  const { page, per, from } = readPaging(q);
  const pages = pageCount(rows.length, per);
  return { rows: rows.slice(from, from + per), page, per, pages, total: rows.length, outOfRange: page > pages };
}

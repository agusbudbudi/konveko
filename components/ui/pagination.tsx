import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import { PAGE_SIZES, pageCount, readPaging, withQuery, type PageQuery } from '@/lib/paging';

/** 1 … 4 5 6 … 20: always first and last, plus the neighbours of the current page. */
function pageItems(page: number, pages: number): (number | 'gap')[] {
  const keep = new Set([1, pages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pages));
  const out: (number | 'gap')[] = [];
  let prev = 0;
  for (const n of [...keep].sort((a, b) => a - b)) {
    if (n - prev === 2) out.push(n - 1); // a gap of one page: show it instead of "…"
    else if (n - prev > 2) out.push('gap');
    out.push(n);
    prev = n;
  }
  return out;
}

const box = 'inline-flex h-10 min-w-10 items-center justify-center rounded-md border px-2 text-small';

/**
 * Link-based pagination (state in the URL, works without JS): range text, page size choice,
 * and page numbers. `hrefFor` builds the URL for a page, `hrefSize` for a page size.
 */
export function Pagination({
  page,
  pages,
  total,
  size,
  sizes,
  unit,
  hrefFor,
  hrefSize,
}: {
  page: number;
  pages: number;
  total: number;
  size: number;
  sizes: readonly number[];
  unit: string;
  hrefFor: (page: number) => string;
  hrefSize: (size: number) => string;
}) {
  const from = (page - 1) * size;
  return (
    <nav aria-label="Halaman" className="mt-4 flex flex-wrap items-center justify-between gap-3 text-small text-text-muted">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="num">
          {total === 0 ? 0 : from + 1}–{Math.min(from + size, total)} dari {total} {unit}
        </p>
        <div className="flex items-center gap-2">
          <span id="page-size-label">Tampilkan</span>
          <div role="group" aria-labelledby="page-size-label" className="flex gap-1 rounded-md bg-surface-muted p-1">
            {sizes.map((s) => (
              <Link
                key={s}
                href={hrefSize(s)}
                aria-current={s === size ? 'true' : undefined}
                className={cn(
                  'num inline-flex h-8 min-w-10 items-center justify-center rounded-sm px-2 font-medium',
                  s === size ? 'border border-border bg-surface text-text' : 'text-text-muted hover:text-text',
                )}
              >
                {s}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {pages > 1 && (
        <ul className="flex items-center gap-1">
          <li>
            <Step href={hrefFor(page - 1)} disabled={page <= 1} label="Halaman sebelumnya">
              <ChevronLeft size={16} strokeWidth={1.5} aria-hidden />
            </Step>
          </li>
          {pageItems(page, pages).map((n, i) =>
            n === 'gap' ? (
              <li key={`gap-${i}`} aria-hidden className="px-1 text-text-subtle">
                …
              </li>
            ) : (
              <li key={n}>
                <Link
                  href={hrefFor(n)}
                  aria-label={`Halaman ${n}`}
                  aria-current={n === page ? 'page' : undefined}
                  className={cn(
                    box,
                    'num',
                    n === page
                      ? 'border-primary bg-primary-soft font-medium text-primary'
                      : 'border-border bg-surface text-text hover:border-border-strong',
                  )}
                >
                  {n}
                </Link>
              </li>
            ),
          )}
          <li>
            <Step href={hrefFor(page + 1)} disabled={page >= pages} label="Halaman berikutnya">
              <ChevronRight size={16} strokeWidth={1.5} aria-hidden />
            </Step>
          </li>
        </ul>
      )}
    </nav>
  );
}

function Step({ href, disabled, label, children }: { href: string; disabled: boolean; label: string; children: React.ReactNode }) {
  if (disabled) {
    return (
      <span aria-disabled aria-label={label} className={cn(box, 'border-border bg-surface text-text-subtle')}>
        {children}
      </span>
    );
  }
  return (
    <Link href={href} aria-label={label} className={cn(box, 'border-border bg-surface text-text hover:border-border-strong')}>
      {children}
    </Link>
  );
}

/**
 * Pagination for a page whose state lives in the URL: builds every link from `path` and the
 * current query, so filters and tabs are kept. Props are plain data, so it also works inside
 * client components. Renders nothing for an empty list.
 */
export function UrlPagination({
  path,
  query,
  total,
  unit,
  className,
}: {
  path: string;
  query: PageQuery;
  total: number;
  unit: string;
  className?: string;
}) {
  if (total === 0) return null;
  const { page, per } = readPaging(query);
  return (
    <div className={className}>
      <Pagination
        page={page}
        pages={pageCount(total, per)}
        total={total}
        size={per}
        sizes={PAGE_SIZES}
        unit={unit}
        hrefFor={(n) => withQuery(path, query, { page: String(n) })}
        hrefSize={(n) => withQuery(path, query, { per: String(n), page: '1' })}
      />
    </div>
  );
}

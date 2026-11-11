import { cn } from '@/lib/cn';

/**
 * Page title block: h1 with optional badges beside it, optional description, and optional actions on the right.
 * Actions wrap under the title on narrow screens. Callers add their own top margin to the content below.
 */
export function PageHeader({
  title,
  badges,
  description,
  meta,
  actions,
  className,
}: {
  title: React.ReactNode;
  /** Status badges shown on the same line as the title. */
  badges?: React.ReactNode;
  description?: React.ReactNode;
  /** Extra small line under the description, e.g. "Pecahan dari ...". */
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('flex flex-wrap items-end justify-between gap-x-4 gap-y-3', className)}>
      <div className="min-w-0">
        {badges ? (
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-h1">{title}</h1>
            {badges}
          </div>
        ) : (
          <h1 className="text-h1">{title}</h1>
        )}
        {description && <p className="mt-1 text-text-muted">{description}</p>}
        {meta && <p className="text-small text-text-muted">{meta}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

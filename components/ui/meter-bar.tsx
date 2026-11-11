import { cn } from '@/lib/cn';

/**
 * Thin single-value bar with a hover tooltip. `share` is 0 to 1.
 * The tooltip sits outside the clipped track so it never gets cut off.
 */
export function MeterBar({
  share,
  color,
  tip,
  className,
}: {
  share: number;
  /** Tailwind bg class for the fill, e.g. bg-primary. */
  color: string;
  tip: React.ReactNode;
  /** Track height and spacing, e.g. "mt-2 h-1". */
  className?: string;
}) {
  return (
    <div className={cn('group relative', className)}>
      <div aria-hidden className="h-full overflow-hidden rounded-full bg-surface-muted">
        <div className={cn('h-full rounded-full transition-[filter] group-hover:brightness-90', color)} style={{ width: `${Math.min(Math.max(share, 0), 1) * 100}%` }} />
      </div>
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-full left-0 z-10 mb-1.5 whitespace-nowrap rounded-md bg-text px-2 py-1 text-caption text-surface opacity-0 transition-opacity group-hover:opacity-100"
      >
        {tip}
      </span>
    </div>
  );
}

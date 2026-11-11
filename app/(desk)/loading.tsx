import { Skeleton } from '@/components/ui/skeleton';

/** Shown while a desk page streams in. Mirrors the common layout: title, tabs, then a card of rows. */
export default function DeskLoading() {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">Memuat…</span>

      <Skeleton className="h-8 w-48" />
      <Skeleton className="mt-2 h-4 w-80 max-w-full" />

      <div className="mt-6 flex gap-2">
        <Skeleton className="h-9 w-24" />
        <Skeleton className="h-9 w-28" />
        <Skeleton className="h-9 w-24" />
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-border bg-surface">
        <div className="h-10 border-b border-border bg-surface-muted" />
        <ul className="divide-y divide-border">
          {Array.from({ length: 6 }, (_, i) => (
            <li key={i} className="flex items-center gap-4 px-5 py-4">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-16 max-md:hidden" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

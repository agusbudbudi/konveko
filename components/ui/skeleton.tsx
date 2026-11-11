import { cn } from '@/lib/cn';

/** Pulsing grey block. Size it with className (h-*, w-*). */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('animate-pulse rounded-md bg-surface-muted', className)} />;
}

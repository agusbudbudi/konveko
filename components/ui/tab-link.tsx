import Link from 'next/link';
import { cn } from '@/lib/cn';

/** Underlined tab row (label queue, WIP). Put TabLinks inside; the row scrolls sideways on narrow screens. */
export function TabList({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div role="tablist" aria-label={label} className={cn('flex gap-1 overflow-x-auto border-b border-border', className)}>
      {children}
    </div>
  );
}

const tabClass = (active: boolean) =>
  cn(
    '-mb-px inline-flex h-10 shrink-0 items-center gap-2 border-b-2 px-3 text-small font-medium whitespace-nowrap',
    active ? 'border-primary text-primary' : 'border-transparent text-text-muted hover:text-text',
  );

function TabCount({ active, count }: { active: boolean; count?: number }) {
  if (count === undefined) return null;
  return <span className={cn('num rounded-sm px-1.5 text-caption', active ? 'bg-primary-soft' : 'bg-surface-muted')}>{count}</span>;
}

/** One tab as a link (state lives in the URL), with an optional count badge. */
export function TabLink({ href, active, label, count }: { href: string; active: boolean; label: string; count?: number }) {
  return (
    <Link href={href} role="tab" aria-selected={active} className={tabClass(active)}>
      {label}
      <TabCount active={active} count={count} />
    </Link>
  );
}

/** Same tab as a button, for state held in a client component (e.g. an import preview). */
export function TabButton({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button type="button" role="tab" aria-selected={active} onClick={onClick} className={tabClass(active)}>
      {label}
      <TabCount active={active} count={count} />
    </button>
  );
}

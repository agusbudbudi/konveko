import Link from 'next/link';
import { cn } from '@/lib/cn';

const MODES = [
  { key: 'masuk', href: '/scan/gudang', label: 'Masuk rak' },
  { key: 'keluar', href: '/scan/gudang/keluar', label: 'Keluar' },
  { key: 'retur', href: '/scan/gudang/retur', label: 'Retur' },
] as const;

/** Warehouse scan modes: putaway, outbound picking, returns. */
export function ModeTabs({ active }: { active: (typeof MODES)[number]['key'] }) {
  return (
    <nav aria-label="Mode scan gudang" className="mx-4 mt-1 flex gap-1 rounded-md bg-surface-muted p-1">
      {MODES.map((m) => (
        <Link
          key={m.key}
          href={m.href}
          aria-current={active === m.key ? 'page' : undefined}
          className={cn(
            'inline-flex h-10 flex-1 items-center justify-center rounded-sm text-small font-medium',
            active === m.key ? 'border border-border bg-surface text-text' : 'text-text-muted hover:text-text',
          )}
        >
          {m.label}
        </Link>
      ))}
    </nav>
  );
}

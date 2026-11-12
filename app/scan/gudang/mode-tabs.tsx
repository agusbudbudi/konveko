import Link from 'next/link';
import { cn } from '@/lib/cn';
import { scanNavKind } from '@/lib/scan/nav';
import type { Role } from '@/lib/supabase/server';

const MODES = [
  { key: 'masuk', href: '/scan/gudang', label: 'Masuk rak' },
  { key: 'keluar', href: '/scan/gudang/keluar', label: 'Keluar' },
  { key: 'retur', href: '/scan/gudang/retur', label: 'Retur' },
  { key: 'opname', href: '/scan/gudang/opname', label: 'Opname' },
] as const;

/**
 * Warehouse scan modes: putaway, outbound picking, returns, stock count.
 * Warehouse-only accounts have these in the bottom tab bar; the segmented control on top
 * is for mixed accounts (supervisor), whose tab bar has a single "Gudang" entry.
 */
export function ModeTabs({ active, roles }: { active: (typeof MODES)[number]['key']; roles: Role[] }) {
  if (scanNavKind(roles) !== 'campuran') return null;
  return (
    <nav aria-label="Mode scan gudang" className="mx-4 mt-3 flex gap-1 rounded-md bg-surface-muted p-1">
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

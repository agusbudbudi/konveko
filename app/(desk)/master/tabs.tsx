'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';

const tabs = [
  { href: '/master/variant', label: 'Variant' },
  { href: '/master/rol', label: 'Rol kain' },
  { href: '/master/pemegang', label: 'Penjahit dan tim' },
  { href: '/master/user', label: 'User' },
  { href: '/master/alasan', label: 'Alasan' },
];

export function MasterTabs() {
  const path = usePathname();
  return (
    <nav className="mt-4 flex flex-wrap gap-1 rounded-md bg-surface-muted p-1" aria-label="Master data">
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={path === t.href ? 'page' : undefined}
          className={cn(
            'inline-flex h-10 items-center rounded-md px-3 text-small font-medium',
            path === t.href ? 'border border-border bg-surface text-text' : 'text-text-muted hover:text-text',
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

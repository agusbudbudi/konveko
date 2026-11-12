'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowUpRight, ClipboardList, History, PackagePlus, ScanLine, Undo2, UserRound, Warehouse, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { ScanNavKind } from '@/lib/scan/nav';

type Item = { href: string; label: string; icon: LucideIcon; match: (p: string) => boolean };

const exact = (href: string) => (p: string) => p === href;
const prefix = (href: string) => (p: string) => p === href || p.startsWith(`${href}/`);

const SCAN: Item = { href: '/scan', label: 'Scan', icon: ScanLine, match: exact('/scan') };
const RIWAYAT: Item = { href: '/scan/riwayat', label: 'Riwayat', icon: History, match: prefix('/scan/riwayat') };
const AKUN: Item = {
  href: '/scan/akun',
  label: 'Akun',
  icon: UserRound,
  match: (p) => prefix('/scan/akun')(p) || prefix('/scan/perangkat')(p),
};
const GUDANG: Item = { href: '/scan/gudang', label: 'Gudang', icon: Warehouse, match: prefix('/scan/gudang') };

const MASUK: Item = {
  href: '/scan/gudang',
  label: 'Masuk rak',
  icon: PackagePlus,
  match: (p) => p === '/scan/gudang',
};
const KELUAR: Item = { href: '/scan/gudang/keluar', label: 'Keluar', icon: ArrowUpRight, match: prefix('/scan/gudang/keluar') };
const RETUR: Item = { href: '/scan/gudang/retur', label: 'Retur', icon: Undo2, match: prefix('/scan/gudang/retur') };
const OPNAME: Item = { href: '/scan/gudang/opname', label: 'Opname', icon: ClipboardList, match: prefix('/scan/gudang/opname') };

const ITEMS: Record<ScanNavKind, Item[]> = {
  produksi: [SCAN, RIWAYAT, AKUN],
  gudang: [MASUK, KELUAR, RETUR, OPNAME, AKUN],
  campuran: [SCAN, GUDANG, RIWAYAT, AKUN],
};

/**
 * Bottom tab bar of the scan app, in thumb reach. Hidden while a task screen is open
 * (a result form, a return, a rack count): those render a [data-scan-task] bar, and
 * globals.css hides [data-scan-nav] when one is on the page.
 */
export function ScanNav({ kind }: { kind: ScanNavKind }) {
  const pathname = usePathname();
  const items = ITEMS[kind];
  return (
    <nav
      data-scan-nav
      aria-label="Menu scan"
      className="sticky bottom-0 z-10 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="grid h-16" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map((it) => {
          const on = it.match(pathname);
          const Icon = it.icon;
          return (
            <li key={it.href + it.label}>
              <Link
                href={it.href}
                aria-current={on ? 'page' : undefined}
                className={cn(
                  'flex h-full flex-col items-center justify-center gap-0.5 text-caption',
                  on ? 'font-semibold text-primary' : 'font-medium text-text-muted hover:text-text',
                )}
              >
                <span className={cn('flex h-7 w-12 items-center justify-center rounded-md', on && 'bg-primary-soft')}>
                  <Icon size={20} strokeWidth={1.75} aria-hidden />
                </span>
                {it.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

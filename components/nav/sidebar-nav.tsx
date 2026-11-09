'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  AlertTriangle,
  BarChart3,
  ChevronDown,
  Database,
  Hourglass,
  Layers,
  LayoutDashboard,
  Menu,
  Package,
  Tag,
  ScanLine,
  X,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/cn';

type Item = { href: string; label: string; icon: LucideIcon };
type Sub = { label: string; icon: LucideIcon; base: string; children: { href: string; label: string; exact?: boolean }[] };
type Group = { label: string; items: (Item | Sub)[] };

const GROUPS: Group[] = [
  {
    label: 'Monitoring',
    items: [
      { href: '/', label: 'Rekonsiliasi', icon: LayoutDashboard },
      { href: '/wip', label: 'WIP', icon: Hourglass },
      { href: '/selisih', label: 'Selisih', icon: AlertTriangle },
      { href: '/laporan', label: 'Laporan', icon: BarChart3 },
    ],
  },
  {
    label: 'Produksi',
    items: [
      { href: '/batch', label: 'Batch', icon: Layers },
      { href: '/scan', label: 'Scan', icon: ScanLine },
    ],
  },
  {
    label: 'Gudang',
    items: [
      {
        label: 'Stok',
        icon: Package,
        base: '/stok',
        children: [
          // exact: /stok must not stay highlighted on /stok/rak or /stok/produk
          { href: '/stok', label: 'Per variant', exact: true },
          { href: '/stok/rak', label: 'Per rak' },
          { href: '/stok/produk', label: 'Per produk' },
        ],
      },
      { href: '/label', label: 'Antrian label', icon: Tag },
    ],
  },
  {
    label: 'Pengaturan',
    items: [
      {
        label: 'Master data',
        icon: Database,
        base: '/master',
        children: [
          { href: '/master/variant', label: 'Variant' },
          { href: '/master/rol', label: 'Rol kain' },
          { href: '/master/rak', label: 'Rak' },
          { href: '/master/pemegang', label: 'Penjahit dan tim' },
          { href: '/master/user', label: 'User' },
          { href: '/master/alasan', label: 'Alasan' },
        ],
      },
    ],
  },
];

/** "/" is only active on itself; other items also cover their sub-pages (/batch/123). */
function isActive(path: string, href: string) {
  return href === '/' ? path === '/' : path === href || path.startsWith(`${href}/`);
}

const itemClass = (active: boolean) =>
  cn(
    'flex h-10 w-full items-center gap-3 rounded-md px-3 text-left',
    active ? 'bg-primary-soft font-medium text-primary' : 'text-text-muted hover:bg-surface-muted hover:text-text',
  );

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname();

  return (
    <nav aria-label="Menu utama" className="flex flex-col gap-5">
      {GROUPS.map((g) => (
        <div key={g.label}>
          <p className="px-3 pb-1.5 text-caption tracking-[0.02em] text-text-subtle">{g.label}</p>
          <ul className="flex flex-col gap-0.5">
            {g.items.map((item) =>
              'children' in item ? (
                <SubMenu key={item.label} sub={item} path={path} onNavigate={onNavigate} />
              ) : (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={isActive(path, item.href) ? 'page' : undefined}
                    className={itemClass(isActive(path, item.href))}
                  >
                    <item.icon size={20} strokeWidth={1.5} aria-hidden />
                    {item.label}
                  </Link>
                </li>
              ),
            )}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function SubMenu({ sub, path, onNavigate }: { sub: Sub; path: string; onNavigate?: () => void }) {
  const inside = isActive(path, sub.base);
  const [open, setOpen] = useState(inside);
  // open automatically when navigating into the section
  useEffect(() => {
    if (inside) setOpen(true);
  }, [inside]);
  const id = `sub-${sub.base.slice(1)}`;

  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={id}
        className={cn(itemClass(false), inside && 'text-text')}
      >
        <sub.icon size={20} strokeWidth={1.5} aria-hidden />
        <span className="flex-1">{sub.label}</span>
        <ChevronDown
          size={16}
          strokeWidth={1.5}
          aria-hidden
          className={cn('transition-transform duration-150', open && 'rotate-180')}
        />
      </button>
      {open && (
        <ul id={id} className="mt-0.5 ml-[21px] flex flex-col gap-0.5 border-l border-border pl-3">
          {sub.children.map((c) => (
            <li key={c.href}>
              <Link
                href={c.href}
                onClick={onNavigate}
                aria-current={(c.exact ? path === c.href : isActive(path, c.href)) ? 'page' : undefined}
                className={cn(itemClass(c.exact ? path === c.href : isActive(path, c.href)), 'h-9 px-3 text-small')}
              >
                {c.label}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/** Phone/tablet: same menu in a panel under the sticky header. */
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="mobile-nav"
        className="inline-flex h-10 items-center gap-2 rounded-md px-3 text-text-muted hover:bg-surface-muted hover:text-text"
      >
        {open ? <X size={20} strokeWidth={1.5} aria-hidden /> : <Menu size={20} strokeWidth={1.5} aria-hidden />}
        Menu
      </button>
      {open && (
        <div id="mobile-nav" className="absolute inset-x-0 top-full max-h-[calc(100dvh-56px)] overflow-y-auto border-b border-border-strong bg-surface p-3">
          <SidebarNav onNavigate={() => setOpen(false)} />
        </div>
      )}
    </>
  );
}

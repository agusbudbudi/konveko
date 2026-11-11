'use client';

import { createContext, useContext, useEffect, useState } from 'react';
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
  Truck,
  ScanBarcode,
  ScanLine,
  Search,
  X,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/cn';

type Item = { href: string; label: string; icon: LucideIcon };
type Sub = { label: string; icon: LucideIcon; base: string; children: { href: string; label: string; exact?: boolean }[] };
/** A group without a label is shown on its own at the top (Lacak). */
type Group = { label?: string; items: (Item | Sub)[] };

const GROUPS: Group[] = [
  { items: [{ href: '/lacak', label: 'Lacak', icon: Search }] },
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
          // exact: /stok must not stay highlighted on /stok/rak, /stok/produk or /stok/pcs
          { href: '/stok', label: 'Per variant', exact: true },
          { href: '/stok/rak', label: 'Per rak' },
          { href: '/stok/produk', label: 'Per produk' },
          { href: '/stok/pcs', label: 'Per pcs' },
        ],
      },
      { href: '/label', label: 'Antrian label', icon: Tag },
      { href: '/barang-keluar', label: 'Barang keluar', icon: Truck },
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
          { href: '/master/profil', label: 'Profil usaha' },
          { href: '/master/import', label: 'Import & export' },
        ],
      },
      { href: '/pengaturan/perangkat', label: 'Perangkat scan', icon: ScanBarcode },
    ],
  },
];

/** "/" is only active on itself; other items also cover their sub-pages (/batch/123). */
function isActive(path: string, href: string) {
  return href === '/' ? path === '/' : path === href || path.startsWith(`${href}/`);
}

/**
 * Detail pages that have no menu item of their own light up the menu they belong to,
 * so one item is always active: a bundle sits under Batch, a pcs under Stok > Per pcs.
 */
const MENU_ALIASES: [prefix: string, menuHref: string][] = [
  ['/bundle', '/batch'],
  ['/pcs', '/stok/pcs'],
];

function menuPath(path: string) {
  const hit = MENU_ALIASES.find(([prefix]) => isActive(path, prefix));
  return hit ? hit[1] : path;
}

/** `dark` = desktop sidebar on --sidebar; `light` = mobile menu panel on --surface. */
type Tone = 'dark' | 'light';

const TONES = {
  dark: {
    active: 'bg-sidebar-accent font-medium text-sidebar-accent-foreground',
    idle: 'text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-foreground',
    inside: 'text-sidebar-foreground',
    label: 'text-sidebar-subtle',
    rail: 'border-sidebar-border',
  },
  light: {
    active: 'bg-primary-soft font-medium text-primary',
    idle: 'text-text-muted hover:bg-surface-muted hover:text-text',
    inside: 'text-text',
    label: 'text-text-subtle',
    rail: 'border-border',
  },
} as const;

const itemClass = (active: boolean, tone: Tone) =>
  cn('flex h-10 w-full items-center gap-3 rounded-md px-3 text-left', active ? TONES[tone].active : TONES[tone].idle);

export function SidebarNav({ onNavigate, tone = 'light' }: { onNavigate?: () => void; tone?: Tone }) {
  const path = menuPath(usePathname());

  return (
    <nav aria-label="Menu utama" className="flex flex-col gap-5">
      {GROUPS.map((g) => (
        <div key={g.label ?? 'top'}>
          {g.label && <p className={cn('px-3 pb-1.5 text-caption tracking-[0.02em]', TONES[tone].label)}>{g.label}</p>}
          <ul className="flex flex-col gap-0.5">
            {g.items.map((item) =>
              'children' in item ? (
                <SubMenu key={item.label} sub={item} path={path} tone={tone} onNavigate={onNavigate} />
              ) : (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={isActive(path, item.href) ? 'page' : undefined}
                    className={itemClass(isActive(path, item.href), tone)}
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

function SubMenu({ sub, path, tone, onNavigate }: { sub: Sub; path: string; tone: Tone; onNavigate?: () => void }) {
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
        className={cn(itemClass(false, tone), inside && TONES[tone].inside)}
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
        <ul id={id} className={cn('mt-0.5 ml-[21px] flex flex-col gap-0.5 border-l pl-3', TONES[tone].rail)}>
          {sub.children.map((c) => (
            <li key={c.href}>
              <Link
                href={c.href}
                onClick={onNavigate}
                aria-current={(c.exact ? path === c.href : isActive(path, c.href)) ? 'page' : undefined}
                className={cn(itemClass(c.exact ? path === c.href : isActive(path, c.href), tone), 'h-9 px-3 text-small')}
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

/* ---------- Breadcrumb ---------- */

export type CrumbItem = { label: string; href?: string };
type CrumbExtra = { items: CrumbItem[]; root: boolean } | null;

const CrumbContext = createContext<{ extra: CrumbExtra; setExtra: (e: CrumbExtra) => void } | null>(null);

/** Wraps the desk layout so pages can add their own items (a batch code, a rack) to the header breadcrumb. */
export function CrumbProvider({ children }: { children: React.ReactNode }) {
  const [extra, setExtra] = useState<CrumbExtra>(null);
  return <CrumbContext.Provider value={{ extra, setExtra }}>{children}</CrumbContext.Provider>;
}

/**
 * Rendered by a page to extend the breadcrumb. `items` are appended after the menu trail;
 * with `root` they replace it, for pages outside the menu such as /bundle/[id].
 */
export function SetCrumb({ items, root = false }: { items: CrumbItem[]; root?: boolean }) {
  const setExtra = useContext(CrumbContext)?.setExtra;
  const key = JSON.stringify([items, root]);
  useEffect(() => {
    if (!setExtra) return;
    // keyed on the serialized value, so a new array literal on every render does not loop
    const [nextItems, nextRoot] = JSON.parse(key) as [CrumbItem[], boolean];
    setExtra({ items: nextItems, root: nextRoot });
    return () => setExtra(null);
  }, [key, setExtra]);
  return null;
}

/** Menu trail for the current path: group (no page of its own) > item > sub item. */
function menuTrail(path: string): CrumbItem[] {
  for (const g of GROUPS) {
    const group: CrumbItem[] = g.label ? [{ label: g.label }] : [];
    for (const item of g.items) {
      if ('children' in item) {
        if (!isActive(path, item.base)) continue;
        const child = item.children.find((c) => (c.exact ? path === c.href : isActive(path, c.href)));
        return [
          ...group,
          { label: item.label, href: item.children[0]!.href },
          ...(child ? [{ label: child.label, href: child.href }] : []),
        ];
      }
      if (isActive(path, item.href)) return [...group, { label: item.label, href: item.href }];
    }
  }
  return [];
}

/** Header breadcrumb, e.g. "Produksi / Batch / BT-0001". Items with a page are links, except the last. */
export function PageCrumb() {
  const path = usePathname();
  const extra = useContext(CrumbContext)?.extra;
  const trail = extra?.root ? extra.items : [...menuTrail(path), ...(extra?.items ?? [])];
  if (trail.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-2 text-small text-text-muted">
        {trail.map((t, i) => {
          const last = i === trail.length - 1;
          return (
            <li key={`${i}-${t.label}`} className="flex min-w-0 items-center gap-2">
              {i > 0 && (
                <span aria-hidden className="text-text-subtle">
                  /
                </span>
              )}
              {last ? (
                <span aria-current="page" className="truncate font-medium text-text">
                  {t.label}
                </span>
              ) : t.href ? (
                <Link href={t.href} className="truncate hover:text-text hover:underline">
                  {t.label}
                </Link>
              ) : (
                <span className="truncate">{t.label}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

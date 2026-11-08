import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LayoutDashboard, LogOut, ScanLine } from 'lucide-react';
import { logout } from '@/app/actions/auth';
import { Wordmark } from '@/components/brand/wordmark';
import { getCurrentAppUser } from '@/lib/supabase/server';

const nav = [
  { href: '/', label: 'Rekonsiliasi', icon: LayoutDashboard },
  { href: '/scan', label: 'Scan', icon: ScanLine },
];

export default async function DeskLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentAppUser();
  if (!user) redirect('/login');

  return (
    <div className="flex min-h-dvh">
      <aside className="hidden w-52 shrink-0 flex-col border-r border-border bg-surface px-3 py-4 lg:flex">
        <div className="px-3 pb-6">
          <Wordmark />
        </div>
        <nav className="flex flex-col gap-1">
          {nav.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className="flex h-10 items-center gap-3 rounded-md px-3 text-text-muted hover:bg-surface-muted hover:text-text">
              <Icon size={20} strokeWidth={1.5} aria-hidden />
              {label}
            </Link>
          ))}
        </nav>
        <form action={logout} className="mt-auto px-3">
          <p className="text-small text-text">{user.name}</p>
          <p className="text-caption text-text-muted">{user.roles.join(', ')}</p>
          <button type="submit" className="mt-3 inline-flex h-10 items-center gap-2 rounded-md text-small text-text-muted hover:text-text">
            <LogOut size={16} strokeWidth={1.5} aria-hidden /> Keluar
          </button>
        </form>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="flex h-14 items-center justify-between border-b border-border bg-surface px-4 lg:hidden">
          <Wordmark />
          <Link href="/scan" className="inline-flex h-10 items-center gap-2 rounded-md px-3 text-text-muted hover:bg-surface-muted">
            <ScanLine size={20} strokeWidth={1.5} aria-hidden /> Scan
          </Link>
        </header>
        <div className="mx-auto w-full max-w-[1280px] px-4 py-6 lg:px-8 lg:py-8">{children}</div>
      </div>
    </div>
  );
}

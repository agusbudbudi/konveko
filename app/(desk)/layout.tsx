import { redirect } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { logout } from '@/app/actions/auth';
import { Wordmark } from '@/components/brand/wordmark';
import { MobileNav, SidebarNav } from '@/components/nav/sidebar-nav';
import { getCurrentAppUser } from '@/lib/supabase/server';

export default async function DeskLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentAppUser();
  if (!user) redirect('/login');

  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-52 shrink-0 flex-col overflow-y-auto border-r border-border bg-surface px-3 py-4 lg:flex">
        <div className="px-3 pb-6 pt-1">
          <Wordmark size="lg" />
        </div>
        <SidebarNav />
        <div className="h-6 shrink-0" />
        <form action={logout} className="mt-auto border-t border-border px-3 pt-4">
          <p className="text-small text-text">{user.name}</p>
          <p className="text-caption text-text-muted">{user.roles.join(', ')}</p>
          <button type="submit" className="mt-3 inline-flex h-10 items-center gap-2 rounded-md text-small text-text-muted hover:text-text">
            <LogOut size={16} strokeWidth={1.5} aria-hidden /> Keluar
          </button>
        </form>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-border bg-surface px-4 lg:hidden">
          <Wordmark />
          <MobileNav />
        </header>
        <div className="mx-auto w-full max-w-[1280px] px-4 py-4 lg:px-6 lg:py-6">{children}</div>
      </div>
    </div>
  );
}

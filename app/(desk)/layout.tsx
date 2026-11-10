import { redirect } from 'next/navigation';
import { Wordmark } from '@/components/brand/wordmark';
import { CrumbProvider, MobileNav, PageCrumb, SidebarNav } from '@/components/nav/sidebar-nav';
import { UserMenu } from '@/components/nav/user-menu';
import { getCurrentAppUser } from '@/lib/supabase/server';

export default async function DeskLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentAppUser();
  if (!user) redirect('/login');

  return (
    <CrumbProvider>
      <div className="flex min-h-dvh">
        {/* Logo stays put; only the menu scrolls when it is taller than the screen. */}
        <aside className="sticky top-0 hidden h-dvh w-52 shrink-0 flex-col border-r border-border bg-surface lg:flex">
          <div className="shrink-0 px-6 pt-5 pb-6">
            <Wordmark size="lg" />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-6">
            <SidebarNav />
          </div>
        </aside>
        <div className="min-w-0 flex-1">
          {/* Top bar on every screen size: breadcrumb on the left, profile on the right. */}
          <header className="sticky top-0 z-10 flex h-14 items-center justify-between gap-3 border-b border-border bg-surface px-4 lg:px-6">
            <div className="flex min-w-0 items-center gap-2">
              <div className="lg:hidden">
                <Wordmark />
              </div>
              <div className="min-w-0 max-lg:hidden">
                <PageCrumb />
              </div>
            </div>
            <div className="flex items-center gap-1">
              <div className="lg:hidden">
                <MobileNav />
              </div>
              <UserMenu name={user.name} roles={user.roles} />
            </div>
          </header>
          <div className="mx-auto w-full max-w-[1280px] px-4 py-4 lg:px-6 lg:py-6">{children}</div>
        </div>
      </div>
    </CrumbProvider>
  );
}

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { logout } from '@/app/actions/auth';
import { Wordmark } from '@/components/brand/wordmark';
import { getCurrentAppUser } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Scan' };

export default async function ScanLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentAppUser();
  if (!user) redirect('/login?next=/scan');

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
      <header className="flex h-14 items-center justify-between px-4 pt-[env(safe-area-inset-top)]">
        <Wordmark />
        <form action={logout} className="flex items-center gap-3">
          <span className="text-small text-text-muted">{user.name}</span>
          <button type="submit" className="inline-flex h-10 items-center gap-1.5 rounded-md px-2 text-small text-text-muted hover:bg-surface-muted">
            <LogOut size={16} strokeWidth={1.5} aria-hidden />
            Keluar
          </button>
        </form>
      </header>
      {children}
    </div>
  );
}

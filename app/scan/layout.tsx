import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { LogOut, Settings2 } from 'lucide-react';
import { logout } from '@/app/actions/auth';
import { Wordmark } from '@/components/brand/wordmark';
import { getCurrentAppUser } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Scan' };

export default async function ScanLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentAppUser();
  if (!user) redirect('/login?next=/scan');

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
      {/* sticky like the desk header; z-10 keeps it above the camera's corner overlay.
          Height = 56px + the notch, so the notch padding does not squeeze the row. */}
      <header className="sticky top-0 z-10 flex h-[calc(3.5rem+env(safe-area-inset-top))] items-center justify-between border-b border-border bg-surface px-4 pt-[env(safe-area-inset-top)]">
        <Wordmark />
        <form action={logout} className="flex items-center gap-1">
          <span className="mr-2 text-small text-text-muted">{user.name}</span>
          <Link
            href="/scan/perangkat"
            aria-label="Perangkat scan"
            title="Perangkat scan"
            className="inline-flex size-10 items-center justify-center rounded-md text-text-muted hover:bg-surface-muted"
          >
            <Settings2 size={18} strokeWidth={1.5} aria-hidden />
          </Link>
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

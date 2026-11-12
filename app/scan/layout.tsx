import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Wordmark } from '@/components/brand/wordmark';
import { roleChip, scanNavKind } from '@/lib/scan/nav';
import { createClient, getCurrentAppUser } from '@/lib/supabase/server';
import { OnlineStatus } from './online-status';
import { ScanNav } from './scan-nav';
import { ScanToaster } from './scan-toaster';

export const metadata: Metadata = { title: 'Scan' };

export default async function ScanLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentAppUser();
  if (!user) redirect('/login?next=/scan');

  let holderName: string | null = null;
  if (user.holder_id) {
    const supabase = await createClient();
    const { data } = await supabase.from('holder').select('name').eq('id', user.holder_id).maybeSingle();
    holderName = data?.name ?? null;
  }
  const chip = roleChip(user.roles, holderName);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
      {/* Compact header: who and where only. Name, device settings and Keluar live in the Akun tab.
          z-20 keeps it above the camera's corner overlay; height = 52px + the notch. */}
      <header className="sticky top-0 z-20 flex h-[calc(3.25rem+env(safe-area-inset-top))] items-center gap-2.5 border-b border-border bg-surface px-4 pt-[env(safe-area-inset-top)]">
        <Wordmark />
        {chip && <span className="truncate rounded-sm bg-surface-muted px-2 py-1 text-caption font-medium text-neutral">{chip}</span>}
        <span className="ml-auto shrink-0">
          <OnlineStatus />
        </span>
      </header>
      {children}
      <ScanToaster />
      <ScanNav kind={scanNavKind(user.roles)} />
    </div>
  );
}

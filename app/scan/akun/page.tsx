import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChevronRight, LogOut } from 'lucide-react';
import { logout } from '@/app/actions/auth';
import { DeviceSettings } from '@/components/scan/device-settings';
import { Avatar } from '@/components/ui/avatar';
import { roleChip } from '@/lib/scan/nav';
import { createClient, getCurrentAppUser } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Akun' };

/**
 * Akun tab of the scan app: who is signed in, how this device scans, and Keluar.
 * Replaces the gear icon + Keluar button of the old scan header. The key log and the
 * SUNMI setup guide stay on /scan/perangkat, one tap away.
 */
export default async function ScanAccountPage() {
  const user = await getCurrentAppUser();
  if (!user) redirect('/login?next=/scan/akun');

  let holderName: string | null = null;
  if (user.holder_id) {
    const supabase = await createClient();
    const { data } = await supabase.from('holder').select('name').eq('id', user.holder_id).maybeSingle();
    holderName = data?.name ?? null;
  }

  return (
    <main className="flex flex-1 flex-col gap-6 px-4 pt-4 pb-8">
      <section className="flex items-center gap-3">
        <Avatar name={user.name} size={44} />
        <div className="min-w-0">
          <p className="truncate text-h3">{user.name}</p>
          <p className="truncate text-small text-text-muted">{roleChip(user.roles, holderName)}</p>
        </div>
      </section>

      <DeviceSettings part="basic" />

      <ul className="rounded-lg border border-border bg-surface">
        <li>
          <Link href="/scan/perangkat" className="flex min-h-12 items-center gap-3 px-4 hover:bg-surface-muted">
            <span className="flex-1">Log tombol dan panduan setup scanner</span>
            <ChevronRight size={18} strokeWidth={1.75} aria-hidden className="text-text-subtle" />
          </Link>
        </li>
      </ul>

      <form action={logout} className="mt-auto">
        <button
          type="submit"
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-md border border-border-strong bg-surface font-medium text-danger hover:bg-surface-muted"
        >
          <LogOut size={18} strokeWidth={1.75} aria-hidden />
          Keluar
        </button>
      </form>
    </main>
  );
}

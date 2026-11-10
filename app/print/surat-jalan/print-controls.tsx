'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Screen-only bar: print, toggle the serial list, warn when the business profile is empty. */
export function PrintControls({ profileMissing }: { profileMissing: boolean }) {
  const router = useRouter();
  const path = usePathname();
  const serials = useSearchParams().get('serial') === '1';

  return (
    <div className="print-bar">
      <div>
        <p className="font-medium">Surat jalan, A5</p>
        <p className="text-small text-text-muted">Printer kantor biasa, kertas A5 (atau A4 dengan skala A5), skala 100%.</p>
        {profileMissing && (
          <p className="mt-1 text-small text-warning">
            Isi <Link href="/master/profil" className="underline">Profil usaha</Link> agar kop memakai identitas usaha Anda.
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <label className="inline-flex items-center gap-2 text-small">
          <input
            type="checkbox"
            checked={serials}
            onChange={(e) => router.replace(e.target.checked ? `${path}?serial=1` : path)}
            className="size-4 accent-[var(--primary)]"
          />
          Lampirkan serial
        </label>
        <Button onClick={() => window.print()}>
          <Printer size={16} strokeWidth={1.5} aria-hidden /> Cetak
        </Button>
      </div>
    </div>
  );
}

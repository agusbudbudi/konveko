'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

/** Back to whichever scan mode opened the settings (produksi or gudang). */
export function BackButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => (history.length > 1 ? router.back() : router.push('/scan'))}
      aria-label="Kembali"
      className="inline-flex size-10 items-center justify-center rounded-md text-text-muted hover:bg-surface-muted"
    >
      <ArrowLeft size={20} strokeWidth={1.5} aria-hidden />
    </button>
  );
}

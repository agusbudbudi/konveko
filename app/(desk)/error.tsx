'use client';

import { useEffect } from 'react';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';

/** Catches render errors in any desk page; the sidebar and header stay usable. */
export default function DeskError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto mt-16 max-w-3xl">
      <EmptyState
        variant="document"
        hint="Coba muat ulang. Kalau tetap gagal, hubungi admin."
        action={<Button onClick={reset}>Coba lagi</Button>}
      >
        Halaman gagal dimuat.
      </EmptyState>
    </div>
  );
}

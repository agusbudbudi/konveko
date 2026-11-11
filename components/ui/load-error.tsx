'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CircleX, RotateCw } from 'lucide-react';
import { cn } from '@/lib/cn';

/** "Data gagal dimuat" banner with a retry that re-runs the server render in place. */
export function LoadError({ className, children = 'Data gagal dimuat.' }: { className?: string; children?: React.ReactNode }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div role="alert" className={cn('flex items-center gap-3 rounded-md bg-danger-soft px-4 py-3 text-danger', className)}>
      <CircleX aria-hidden size={16} strokeWidth={1.5} className="shrink-0" />
      <p className="min-w-0 flex-1">{children}</p>
      <button
        type="button"
        onClick={() => start(() => router.refresh())}
        disabled={pending}
        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-danger/30 bg-surface px-3 text-small font-medium text-danger transition-colors hover:border-danger disabled:opacity-60"
      >
        <RotateCw aria-hidden size={14} strokeWidth={1.5} className={pending ? 'animate-spin' : undefined} />
        {pending ? 'Memuat…' : 'Coba lagi'}
      </button>
    </div>
  );
}

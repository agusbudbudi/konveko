'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, LogOut } from 'lucide-react';
import { logout } from '@/app/actions/auth';
import { Avatar } from '@/components/ui/avatar';
import { Scrim, useScrollLock } from '@/components/ui/scrim';
import { cn } from '@/lib/cn';

/** Top-right profile button with a small dropdown: who is signed in, and Keluar. */
export function UserMenu({ name, roles }: { name: string; roles: string[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useScrollLock(open);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Akun: ${name}`}
        className="inline-flex h-10 items-center gap-2 rounded-md pr-2 pl-1.5 text-text hover:bg-surface-muted"
      >
        <Avatar name={name} />
        <span className="max-w-40 truncate text-small font-medium max-sm:hidden">{name}</span>
        <ChevronDown
          size={16}
          strokeWidth={1.5}
          aria-hidden
          className={cn('text-text-muted transition-transform duration-150', open && 'rotate-180')}
        />
      </button>

      {open && (
        <>
        <Scrim onClose={() => setOpen(false)} />
        <div
          role="menu"
          className="absolute top-full right-0 z-20 mt-1 w-60 rounded-lg border border-border-strong bg-surface p-1"
        >
          <div className="flex items-center gap-2.5 px-3 py-2.5">
            <Avatar name={name} size={32} />
            <div className="min-w-0">
              <p className="truncate text-small font-medium">{name}</p>
              <p className="truncate text-caption text-text-muted">{roles.join(', ')}</p>
            </div>
          </div>
          <div className="my-1 border-t border-border" />
          <form action={logout}>
            <button
              type="submit"
              role="menuitem"
              className="flex h-10 w-full items-center gap-2.5 rounded-md px-3 text-small text-text-muted hover:bg-surface-muted hover:text-text"
            >
              <LogOut size={16} strokeWidth={1.5} aria-hidden /> Keluar
            </button>
          </form>
        </div>
        </>
      )}
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { Wordmark } from '@/components/brand/wordmark';
import { WA_URL } from './contact';

const SECTIONS = [
  { href: '#alur', label: 'Alur kerja' },
  { href: '#fitur', label: 'Fitur' },
  { href: '#peran', label: 'Untuk siapa' },
  { href: '#faq', label: 'FAQ' },
  { href: '#kontak', label: 'Kontak' },
];

/** Sticky landing top bar. `app` = where a signed-in visitor goes (null when signed out). */
export function LandingHeader({ app }: { app: string | null }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const session = app ? (
    <Link href={app} className="inline-flex h-10 items-center rounded-md border border-border-strong bg-surface px-4 font-medium text-text hover:bg-surface-muted">
      Buka aplikasi
    </Link>
  ) : (
    <Link href="/login" className="inline-flex h-10 items-center rounded-md border border-border-strong bg-surface px-4 font-medium text-text hover:bg-surface-muted">
      Masuk
    </Link>
  );

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-surface">
      <div className="mx-auto flex h-16 max-w-[1200px] items-center gap-8 px-4 sm:px-6">
        <Link href="/" aria-label="Konveko, ke atas halaman" className="rounded-md">
          <Wordmark size="md" />
        </Link>
        <nav aria-label="Bagian halaman" className="hidden gap-1 lg:flex">
          {SECTIONS.map((s) => (
            <a key={s.href} href={s.href} className="rounded-md px-3 py-2 font-medium text-text-muted hover:bg-surface-muted hover:text-text">
              {s.label}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {session}
          <a href={WA_URL} className="hidden h-10 items-center rounded-md bg-primary px-4 font-medium text-primary-foreground hover:bg-primary-hover sm:inline-flex">
            Hubungi kami
          </a>
          <button
            type="button"
            aria-label={open ? 'Tutup menu' : 'Buka menu'}
            aria-expanded={open}
            aria-controls="landing-menu"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex size-11 items-center justify-center rounded-md border border-border-strong bg-surface text-text lg:hidden"
          >
            {open ? <X size={20} strokeWidth={1.5} aria-hidden /> : <Menu size={20} strokeWidth={1.5} aria-hidden />}
          </button>
        </div>
      </div>

      {open && (
        <>
          <div aria-hidden onClick={() => setOpen(false)} className="fixed inset-x-0 top-16 bottom-0 z-10 touch-none bg-text/40 lg:hidden" />
          <nav id="landing-menu" aria-label="Menu" className="absolute inset-x-0 top-full z-20 border-b border-border-strong bg-surface px-4 py-3 lg:hidden">
            <ul className="flex flex-col">
              {SECTIONS.map((s) => (
                <li key={s.href}>
                  <a href={s.href} onClick={() => setOpen(false)} className="flex h-12 items-center rounded-md px-3 font-medium text-text hover:bg-surface-muted">
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
            <a href={WA_URL} className="mt-3 flex h-12 items-center justify-center rounded-md bg-primary font-medium text-primary-foreground hover:bg-primary-hover">
              Hubungi kami
            </a>
          </nav>
        </>
      )}
    </header>
  );
}

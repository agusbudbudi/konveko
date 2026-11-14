'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { Wordmark } from '@/components/brand/wordmark';
import { WA_URL } from './contact';
import { useSignedIn } from './use-signed-in';

const SECTIONS = [
  { href: '#alur', label: 'Alur kerja' },
  { href: '#fitur', label: 'Fitur' },
  { href: '#peran', label: 'Untuk siapa' },
  { href: '#perangkat', label: 'Perangkat' },
  { href: '#faq', label: 'FAQ' },
  { href: '#kontak', label: 'Kontak' },
];

/**
 * The section being read: the last one whose top has passed just under the 64px header.
 * At the very bottom of the page the footer (Kontak) wins, since it is too short to reach the top.
 */
function useActiveSection() {
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      let current: string | null = null;
      for (const s of SECTIONS) {
        const el = document.getElementById(s.href.slice(1));
        if (el && el.getBoundingClientRect().top <= 96) current = s.href;
      }
      setActive(atBottom ? '#kontak' : current);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);
  return active;
}

/** Sticky landing top bar. The session button reads the browser session, so the page itself stays static. */
export function LandingHeader() {
  const [open, setOpen] = useState(false);
  const signedIn = useSignedIn();
  const active = useActiveSection();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // /app sends a signed-in user to their start page (scanner or Lacak)
  const session = (
    <Link
      href={signedIn ? '/app' : '/login'}
      className="inline-flex h-10 items-center rounded-md border border-border-strong bg-surface px-4 font-medium text-text transition-[background-color,transform] hover:bg-surface-muted active:scale-[0.98]"
    >
      {signedIn ? 'Buka aplikasi' : 'Masuk'}
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
            <a
              key={s.href}
              href={s.href}
              aria-current={active === s.href ? 'location' : undefined}
              className="rounded-md px-3 py-2 font-medium text-text-muted transition-colors hover:bg-surface-muted hover:text-text aria-[current=location]:bg-primary-soft aria-[current=location]:text-primary"
            >
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
            className="inline-flex size-10 items-center justify-center rounded-md border border-border-strong bg-surface text-text lg:hidden"
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
                  <a
                    href={s.href}
                    onClick={() => setOpen(false)}
                    aria-current={active === s.href ? 'location' : undefined}
                    className="flex h-12 items-center rounded-md px-3 font-medium text-text hover:bg-surface-muted aria-[current=location]:bg-primary-soft aria-[current=location]:text-primary"
                  >
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

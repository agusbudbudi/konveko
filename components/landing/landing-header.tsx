'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, Menu, X } from 'lucide-react';
import { Wordmark } from '@/components/brand/wordmark';
import { WA_URL } from './contact';
import { FeatureList, FeatureTray } from './feature-tray';
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

const navItem =
  'rounded-md px-3 py-2 font-medium text-text-muted transition-colors hover:bg-surface-muted hover:text-text aria-[current=location]:bg-primary-soft aria-[current=location]:text-primary';
const menuItem =
  'flex h-12 items-center rounded-md px-3 font-medium text-text hover:bg-surface-muted aria-[current=location]:bg-primary-soft aria-[current=location]:text-primary';

/** `base` is '' on the landing page and '/' on topic pages, so section links lead back to the landing page. */
/** Sticky landing top bar. The session button reads the browser session, so the page itself stays static. */
export function LandingHeader({ base = '' }: { base?: string }) {
  const [open, setOpen] = useState(false);
  // Fitur opens a tray listing every feature: a full-width panel on desktop, an expanding row in the mobile menu.
  const [tray, setTray] = useState(false);
  const [mobileFitur, setMobileFitur] = useState(false);
  const trayButton = useRef<HTMLButtonElement>(null);
  const trayArea = useRef<HTMLDivElement>(null);
  const signedIn = useSignedIn();
  const active = useActiveSection();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    if (!tray) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setTray(false);
      trayButton.current?.focus();
    };
    const onDown = (e: PointerEvent) => {
      if (!trayArea.current?.contains(e.target as Node)) setTray(false);
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [tray]);

  const closeMenu = () => {
    setOpen(false);
    setMobileFitur(false);
  };

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
          {SECTIONS.map((s) =>
            s.href === '#fitur' ? (
              <div key={s.href} ref={trayArea}>
                <button
                  ref={trayButton}
                  type="button"
                  aria-expanded={tray}
                  aria-controls="landing-fitur-tray"
                  aria-current={active === s.href ? 'location' : undefined}
                  onClick={() => setTray((v) => !v)}
                  className={`${navItem} inline-flex cursor-pointer items-center gap-1 aria-expanded:bg-surface-muted aria-expanded:text-text`}
                >
                  {s.label}
                  <ChevronDown
                    size={16}
                    strokeWidth={1.5}
                    aria-hidden
                    className={`transition-transform duration-300 ease-[cubic-bezier(0.2,0,0,1)] ${tray ? 'rotate-180' : ''}`}
                  />
                </button>
                {tray && <FeatureTray id="landing-fitur-tray" base={base} onNavigate={() => setTray(false)} />}
              </div>
            ) : (
              <a key={s.href} href={base + s.href} aria-current={active === s.href ? 'location' : undefined} className={navItem}>
                {s.label}
              </a>
            ),
          )}
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
            onClick={() => (open ? closeMenu() : setOpen(true))}
            className="inline-flex size-10 items-center justify-center rounded-md border border-border-strong bg-surface text-text lg:hidden"
          >
            {open ? <X size={20} strokeWidth={1.5} aria-hidden /> : <Menu size={20} strokeWidth={1.5} aria-hidden />}
          </button>
        </div>
      </div>

      {tray && <div aria-hidden className="fixed inset-x-0 top-16 bottom-0 -z-10 hidden animate-[fade-in_200ms_ease-out] bg-text/30 lg:block" />}

      {open && (
        <>
          <div aria-hidden onClick={closeMenu} className="fixed inset-x-0 top-16 bottom-0 z-10 touch-none bg-text/40 lg:hidden" />
          <nav id="landing-menu" aria-label="Menu" className="absolute inset-x-0 top-full z-20 max-h-[calc(100dvh-4rem)] overflow-y-auto border-b border-border-strong bg-surface px-4 py-3 lg:hidden">
            <ul className="flex flex-col">
              {SECTIONS.map((s) => (
                <li key={s.href}>
                  {s.href === '#fitur' ? (
                    <>
                      <button
                        type="button"
                        aria-expanded={mobileFitur}
                        aria-controls="landing-fitur-list"
                        aria-current={active === s.href ? 'location' : undefined}
                        onClick={() => setMobileFitur((v) => !v)}
                        className={`${menuItem} w-full cursor-pointer justify-between`}
                      >
                        {s.label}
                        <ChevronDown
                          size={20}
                          strokeWidth={1.5}
                          aria-hidden
                          className={`text-text-muted transition-transform duration-300 ease-[cubic-bezier(0.2,0,0,1)] ${mobileFitur ? 'rotate-180' : ''}`}
                        />
                      </button>
                      <div
                        id="landing-fitur-list"
                        inert={!mobileFitur}
                        className={`grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none ${
                          mobileFitur ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                        }`}
                      >
                        <div className="min-h-0 overflow-hidden">
                          <FeatureList base={base} onNavigate={closeMenu} />
                        </div>
                      </div>
                    </>
                  ) : (
                    <a href={base + s.href} onClick={closeMenu} aria-current={active === s.href ? 'location' : undefined} className={menuItem}>
                      {s.label}
                    </a>
                  )}
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

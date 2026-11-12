'use client';

import { useEffect } from 'react';

const QUERY = { sm: '(max-width: 639px)', lg: '(max-width: 1023px)' } as const;
type Breakpoint = keyof typeof QUERY;

/** Locks page scroll while `active`, only on screens below the breakpoint. Restores the previous values on cleanup. */
export function useScrollLock(active: boolean, below: Breakpoint = 'sm') {
  useEffect(() => {
    if (!active || !window.matchMedia(QUERY[below]).matches) return;
    const { overflow: htmlOverflow } = document.documentElement.style;
    const { overflow: bodyOverflow } = document.body.style;
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    return () => {
      document.documentElement.style.overflow = htmlOverflow;
      document.body.style.overflow = bodyOverflow;
    };
  }, [active, below]);
}

/**
 * Dims the page under the 56px top bar behind an open menu on small screens. Tap to close.
 * touch-none stops the page scrolling through it. Render it inside the sticky header, before the panel,
 * and give the panel a higher z-index than this (z-10).
 */
export function Scrim({ onClose, below = 'sm' }: { onClose: () => void; below?: Breakpoint }) {
  return (
    <div
      aria-hidden
      onClick={onClose}
      className={`fixed inset-x-0 top-14 bottom-0 z-10 touch-none bg-text/40 ${below === 'sm' ? 'sm:hidden' : 'lg:hidden'}`}
    />
  );
}

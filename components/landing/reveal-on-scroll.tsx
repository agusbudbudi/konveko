'use client';

import { useEffect } from 'react';

/**
 * Fades [data-reveal] elements up as they scroll into view (styles in globals.css).
 * Only elements still below the fold at mount are hidden, so nothing visible flashes away;
 * reduced motion and missing IntersectionObserver leave everything as rendered.
 */
export function RevealOnScroll() {
  useEffect(() => {
    if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const els = [...document.querySelectorAll<HTMLElement>('[data-reveal]')].filter(
      (el) => el.getBoundingClientRect().top > window.innerHeight * 0.92,
    );
    els.forEach((el) => el.classList.add('reveal-pending'));
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.remove('reveal-pending');
          io.unobserve(e.target);
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  return null;
}

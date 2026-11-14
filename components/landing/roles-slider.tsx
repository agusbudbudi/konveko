'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image, { type StaticImageData } from 'next/image';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export type RoleSlide = { role: string; task: string; photo: StaticImageData; alt: string };

const GAP = 16;

/**
 * "Untuk siapa": square photo cards in a horizontal scroll-snap track.
 * Desktop: the intro sits under the track, behind a transparent spacer the width of the intro;
 * as the cards slide left over it, the intro fades out. Phone: intro above, cards below, no fade.
 */
export function RolesSlider({ intro, slides, reveal = false }: { intro: React.ReactNode; slides: RoleSlide[]; reveal?: boolean }) {
  const track = useRef<HTMLUListElement>(null);
  const [fade, setFade] = useState(1);
  const [edge, setEdge] = useState({ start: true, end: false });

  const update = useCallback(() => {
    const el = track.current;
    if (!el) return;
    const x = el.scrollLeft;
    const spacer = el.querySelector<HTMLElement>('[data-spacer]')?.offsetWidth ?? 0;
    setFade(spacer > 0 ? Math.max(0, Math.min(1, 1 - x / (spacer * 0.75))) : 1);
    setEdge({ start: x <= 2, end: x + el.clientWidth >= el.scrollWidth - 2 });
  }, []);

  useEffect(() => {
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [update]);

  const step = (dir: 1 | -1) => {
    const el = track.current;
    const card = el?.querySelector<HTMLElement>('[data-card]');
    el?.scrollBy({ left: dir * ((card?.offsetWidth ?? 300) + GAP), behavior: 'smooth' });
  };

  const navBtn =
    'inline-flex size-11 items-center justify-center rounded-full border transition-[background-color,border-color,transform,opacity] enabled:active:scale-95 disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <div data-reveal={reveal || undefined} className="grid grid-cols-1 gap-y-6">
      <div
        style={{ opacity: fade }}
        className="relative z-0 flex flex-col gap-3 transition-opacity duration-150 ease-linear md:col-start-1 md:row-start-1 md:w-[400px] md:max-w-full md:self-center"
      >
        {intro}
      </div>

      <ul
        ref={track}
        onScroll={update}
        aria-label="Peran di Konveko"
        // Full bleed on both sides: the track runs from screen edge to screen edge, so cards slide off the
        // screen rather than at the content column. --bleed = distance from the screen edge to the content.
        className="relative z-[1] -mx-[var(--bleed)] flex snap-x snap-mandatory scroll-pl-[var(--bleed)] gap-4 overflow-x-auto px-[var(--bleed)] [--bleed:16px] [scrollbar-width:none] sm:[--bleed:24px] md:col-start-1 md:row-start-1 md:[--bleed:max(24px,calc(24px_+_(100vw_-_1200px)_/_2))] [&::-webkit-scrollbar]:hidden"
      >
        <li data-spacer aria-hidden className="hidden w-[424px] shrink-0 snap-start md:block" />
        {slides.map((s) => (
          <li data-card key={s.role} className="group relative aspect-square w-[280px] shrink-0 snap-start overflow-hidden rounded-lg bg-[#E7E4DF] md:w-[360px]">
            <Image src={s.photo} alt={s.alt} sizes="(min-width: 768px) 360px, 280px" className="absolute inset-0 size-full object-cover transition-transform duration-700 ease-[cubic-bezier(0.2,0,0,1)] group-hover:scale-105" />
            <div className="absolute inset-x-3 bottom-3 flex flex-col gap-0.5 rounded-md bg-primary px-3.5 py-3">
              <span className="text-h3 text-white">{s.role}</span>
              <span className="text-sm leading-5 text-[#CFE3DE]">{s.task}</span>
            </div>
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-end gap-2">
        <span className="num mr-auto text-small text-text-muted">{slides.length} peran</span>
        <button type="button" onClick={() => step(-1)} disabled={edge.start} aria-label="Peran sebelumnya" className={`${navBtn} border-border-strong bg-surface text-text enabled:hover:border-text-subtle`}>
          <ChevronLeft size={20} strokeWidth={1.5} aria-hidden />
        </button>
        <button type="button" onClick={() => step(1)} disabled={edge.end} aria-label="Peran berikutnya" className={`${navBtn} border-primary bg-primary text-primary-foreground hover:bg-primary-hover`}>
          <ChevronRight size={20} strokeWidth={1.5} aria-hidden />
        </button>
      </div>
    </div>
  );
}

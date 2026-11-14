'use client';

import { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';

export type FaqItem = { q: string; a: string };

/**
 * One-open-at-a-time accordion. Opening an item closes the one that was open.
 * The height animates through grid-template-rows (0fr ↔ 1fr), so no measuring is needed;
 * motion-reduce drops the transition.
 */
export function FaqAccordion({ items, defaultOpen = 0 }: { items: FaqItem[]; defaultOpen?: number | null }) {
  const [open, setOpen] = useState<number | null>(defaultOpen);
  const id = useId();

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      {items.map((f, i) => {
        const isOpen = open === i;
        const panel = `${id}-panel-${i}`;
        const button = `${id}-button-${i}`;
        return (
          <div key={f.q} className="not-last:border-b not-last:border-border">
            <h3>
              <button
                id={button}
                type="button"
                aria-expanded={isOpen}
                aria-controls={panel}
                onClick={() => setOpen(isOpen ? null : i)}
                className="flex min-h-14 w-full cursor-pointer items-center gap-4 px-5 py-4 text-left font-semibold transition-colors hover:bg-[#FAF9F7]"
              >
                {f.q}
                <ChevronDown
                  size={20}
                  strokeWidth={1.5}
                  aria-hidden
                  className={`ml-auto shrink-0 text-text-muted transition-transform duration-300 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none ${isOpen ? 'rotate-180' : ''}`}
                />
              </button>
            </h3>
            <div
              id={panel}
              role="region"
              aria-labelledby={button}
              inert={!isOpen}
              className={`grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none ${
                isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
              }`}
            >
              <div className="min-h-0 overflow-hidden">
                <p className="px-5 pb-5 text-pretty text-text-muted">{f.a}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

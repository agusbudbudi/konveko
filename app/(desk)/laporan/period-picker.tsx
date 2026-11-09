'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { rangeLabel, type Mode, type Period } from '@/lib/report';

const MODES: { mode: Exclude<Mode, 'custom'>; label: string }[] = [
  { mode: 'week', label: 'Mingguan' },
  { mode: 'month', label: 'Bulanan' },
];

const tab = (on: boolean) =>
  `inline-flex h-9 items-center rounded-sm px-3 text-small font-medium ${on ? 'bg-primary-soft text-primary' : 'text-text-muted hover:text-text'}`;
const arrow =
  'inline-flex size-10 items-center justify-center rounded-md border border-border bg-surface text-text-muted hover:border-border-strong hover:text-text';

/**
 * Period tabs. Week / month are links with prev / next arrows. "Custom"
 * opens the range calendar straight away; in custom mode the chosen range
 * is a button that reopens it. Future days cannot be picked.
 */
export function PeriodPicker({ period, today }: { period: Period; today: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const custom = period.mode === 'custom';

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [open]);

  return (
    <div ref={wrapRef} className="relative flex flex-wrap items-center gap-2">
      <div role="tablist" aria-label="Jenis periode" className="inline-flex rounded-md border border-border bg-surface p-0.5">
        {MODES.map((m) => (
          <Link key={m.mode} role="tab" aria-selected={period.mode === m.mode} href={`/laporan?mode=${m.mode}`} className={tab(period.mode === m.mode)}>
            {m.label}
          </Link>
        ))}
        <button
          type="button"
          role="tab"
          aria-selected={custom}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className={tab(custom || open)}
        >
          Custom
        </button>
      </div>

      {custom ? (
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-surface px-3 text-small hover:border-border-strong"
        >
          <CalendarDays size={16} strokeWidth={1.5} aria-hidden className="text-text-muted" />
          <span className="num">{rangeLabel(period.from, period.to)}</span>
        </button>
      ) : (
        <div className="flex gap-1">
          <Link href={`/laporan?mode=${period.mode}&date=${period.prevAnchor}`} className={arrow} aria-label="Periode sebelumnya">
            <ChevronLeft size={20} strokeWidth={1.5} aria-hidden />
          </Link>
          {period.nextAnchor ? (
            <Link href={`/laporan?mode=${period.mode}&date=${period.nextAnchor}`} className={arrow} aria-label="Periode berikutnya">
              <ChevronRight size={20} strokeWidth={1.5} aria-hidden />
            </Link>
          ) : (
            <span className={`${arrow} cursor-not-allowed opacity-40`} aria-disabled="true">
              <ChevronRight size={20} strokeWidth={1.5} aria-hidden />
            </span>
          )}
        </div>
      )}

      {open && (
        <div className="absolute top-full z-30 mt-2 max-sm:left-0 sm:right-0">
          <DateRangePicker
            from={custom ? period.from : null}
            to={custom ? period.to : null}
            max={today}
            onApply={(f, t) => {
              setOpen(false);
              router.push(`/laporan?mode=custom&from=${f}&to=${t}`);
            }}
            onCancel={() => setOpen(false)}
          />
        </div>
      )}
    </div>
  );
}

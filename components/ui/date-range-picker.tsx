'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { addDays, daysBetween, rangeLabel } from '@/lib/report';

const WEEKDAYS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
const monthTitle = new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const fullDay = new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const toDate = (iso: string) => new Date(`${iso}T00:00:00Z`);

/** All days shown for a month, Monday first, padded with nulls. */
function monthGrid(ym: string): (string | null)[] {
  const first = `${ym}-01`;
  const lead = (toDate(first).getUTCDay() + 6) % 7;
  const [y, m] = ym.split('-').map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: (string | null)[] = Array(lead).fill(null);
  for (let d = 0; d < days; d++) cells.push(addDays(first, d));
  while (cells.length % 7) cells.push(null);
  return cells;
}

const shiftMonth = (ym: string, n: number) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
};

type Props = {
  from: string | null;
  to: string | null;
  /** last selectable day (today); later days are disabled */
  max: string;
  /** longest range in days, inclusive span minus one */
  maxSpan?: number;
  onApply: (from: string, to: string) => void;
  onCancel: () => void;
};

/**
 * Range calendar: first click picks the start, second the end (swapped if
 * earlier). Days after `max` and beyond `maxSpan` from the start are
 * disabled. Arrow keys move the focus day; Enter / Space select.
 */
export function DateRangePicker({ from, to, max, maxSpan = 366, onApply, onCancel }: Props) {
  const [start, setStart] = useState<string | null>(from);
  const [end, setEnd] = useState<string | null>(to);
  const [hover, setHover] = useState<string | null>(null);
  const [month, setMonth] = useState((to ?? max).slice(0, 7));
  const [focus, setFocus] = useState(to ?? max);
  const gridRef = useRef<HTMLDivElement>(null);

  const picking = start !== null && end === null; // waiting for the second click
  const cells = useMemo(() => monthGrid(month), [month]);

  const disabled = (d: string) => {
    if (d > max) return true;
    if (picking && Math.abs(daysBetween(start!, d)) > maxSpan) return true;
    return false;
  };

  const pick = (d: string) => {
    if (disabled(d)) return;
    if (!picking) {
      setStart(d);
      setEnd(null);
    } else if (d < start!) {
      setEnd(start);
      setStart(d);
    } else {
      setEnd(d);
    }
  };

  // range to paint: the chosen one, or start..hover while picking
  const [lo, hi] = (() => {
    if (start && end) return [start, end];
    if (picking && hover) return hover < start! ? [hover, start!] : [start!, hover];
    return [start, start];
  })();

  const preset = (days: number | 'month' | 'year') => {
    const f = days === 'month' ? `${max.slice(0, 7)}-01` : days === 'year' ? `${max.slice(0, 4)}-01-01` : addDays(max, -(days - 1));
    setStart(f);
    setEnd(max);
    setMonth(max.slice(0, 7));
    setFocus(max);
  };

  // keyboard: move focus inside the grid, page through months as needed
  const move = (n: number) => {
    const next = addDays(focus, n);
    setFocus(next);
    if (next.slice(0, 7) !== month) setMonth(next.slice(0, 7));
  };
  useEffect(() => {
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${focus}"]`)?.focus({ preventScroll: true });
  }, [focus, month]);

  const span = start && end ? daysBetween(start, end) + 1 : 0;

  return (
    <div
      role="dialog"
      aria-label="Pilih rentang tanggal"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onCancel();
        }
      }}
      className="w-[min(92vw,520px)] rounded-lg border border-border-strong bg-surface p-4"
    >
      <div className="flex flex-col gap-4 sm:flex-row">
        <ul className="flex flex-wrap gap-1.5 sm:w-32 sm:flex-col sm:gap-0.5" aria-label="Rentang cepat">
          {(
            [
              [7, '7 hari terakhir'],
              [30, '30 hari terakhir'],
              [90, '90 hari terakhir'],
              ['month', 'Bulan ini'],
              ['year', 'Tahun ini'],
            ] as const
          ).map(([v, label]) => (
            <li key={label}>
              <button
                type="button"
                onClick={() => preset(v)}
                className="h-8 rounded-md px-2 text-left text-small text-text-muted hover:bg-surface-muted hover:text-text max-sm:border max-sm:border-border sm:w-full"
              >
                {label}
              </button>
            </li>
          ))}
        </ul>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setMonth(shiftMonth(month, -1))}
              aria-label="Bulan sebelumnya"
              className="inline-flex size-8 items-center justify-center rounded-md text-text-muted hover:bg-surface-muted hover:text-text"
            >
              <ChevronLeft size={18} strokeWidth={1.5} aria-hidden />
            </button>
            <p className="text-small font-medium" aria-live="polite">
              {monthTitle.format(toDate(`${month}-01`))}
            </p>
            <button
              type="button"
              onClick={() => setMonth(shiftMonth(month, 1))}
              disabled={`${shiftMonth(month, 1)}-01` > max}
              aria-label="Bulan berikutnya"
              className="inline-flex size-8 items-center justify-center rounded-md text-text-muted hover:bg-surface-muted hover:text-text disabled:opacity-30"
            >
              <ChevronRight size={18} strokeWidth={1.5} aria-hidden />
            </button>
          </div>

          <div className="mt-2 grid grid-cols-7 text-center text-caption font-normal text-text-subtle" aria-hidden>
            {WEEKDAYS.map((w) => (
              <span key={w} className="py-1">
                {w}
              </span>
            ))}
          </div>
          <div
            ref={gridRef}
            role="grid"
            className="grid grid-cols-7"
            onMouseLeave={() => setHover(null)}
            onKeyDown={(e) => {
              const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
              if (step) {
                e.preventDefault();
                move(step);
              }
            }}
          >
            {cells.map((d, i) => {
              if (!d) return <span key={`pad-${i}`} />;
              const off = disabled(d);
              const inRange = lo && hi && d >= lo && d <= hi;
              const edge = d === lo || d === hi;
              const isToday = d === max;
              return (
                <button
                  key={d}
                  type="button"
                  data-day={d}
                  tabIndex={d === focus ? 0 : -1}
                  disabled={off}
                  aria-label={fullDay.format(toDate(d))}
                  aria-pressed={Boolean(edge && inRange)}
                  onClick={() => {
                    setFocus(d);
                    pick(d);
                  }}
                  onMouseEnter={() => setHover(d)}
                  className={cn(
                    'num relative h-9 text-small',
                    inRange && !edge && 'bg-primary-soft text-primary',
                    d === lo && hi !== lo && 'rounded-l-md',
                    d === hi && hi !== lo && 'rounded-r-md',
                    edge && inRange ? 'rounded-md bg-primary font-medium text-primary-foreground' : !inRange && 'rounded-md hover:bg-surface-muted',
                    edge && inRange && lo !== hi && d === lo && '!rounded-r-none',
                    edge && inRange && lo !== hi && d === hi && '!rounded-l-none',
                    off && 'cursor-not-allowed text-text-subtle/50 hover:bg-transparent',
                    isToday && !edge && 'font-semibold underline decoration-2 underline-offset-4',
                  )}
                >
                  {Number(d.slice(8))}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <p className="text-small text-text-muted" aria-live="polite">
          {start && end ? (
            <>
              <span className="text-text">{rangeLabel(start, end)}</span> · {span} hari
            </>
          ) : start ? (
            'Pilih tanggal akhir'
          ) : (
            'Pilih tanggal awal'
          )}
        </p>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onCancel}>
            Batal
          </Button>
          <Button disabled={!start || !end} onClick={() => start && end && onApply(start, end)}>
            Terapkan
          </Button>
        </div>
      </div>
    </div>
  );
}

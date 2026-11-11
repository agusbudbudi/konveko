'use client';

import { useState } from 'react';
import { niceMax, type Bucket } from '@/lib/report';

const H = 168; // plot height in px

/**
 * Stacked columns: lolos QC (bottom) + reject (top), one per day or week.
 * Marks follow the dataviz spec: <= 24px wide, 4px rounded top, 2px surface
 * gap between segments, hairline grid, legend for the two series, hover and
 * keyboard tooltip. The same numbers are in the "harian" table / CSV.
 */
export function TrendChart({ data, weekly }: { data: Bucket[]; weekly: boolean }) {
  const [active, setActive] = useState<number | null>(null);
  const max = niceMax(Math.max(0, ...data.map((d) => d.ready + d.reject)));
  const ticks = [0, max / 2, max];
  const every = Math.ceil(data.length / 10); // at most ~10 x labels
  const a = active === null ? null : data[active];

  return (
    <div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-small text-text-muted">
        <li className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-sm bg-chart-ready" /> Lolos QC
        </li>
        <li className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-sm bg-chart-reject" /> Reject
        </li>
        <li className="ml-auto text-caption">{weekly ? 'per minggu' : 'per hari'}, pcs</li>
      </ul>

      <div className="relative mt-3 grid grid-cols-[32px_1fr] gap-2">
        {/* y axis */}
        <div className="relative" style={{ height: H }} aria-hidden>
          {ticks.map((t) => (
            <span key={t} className="num absolute right-0 -translate-y-1/2 text-caption font-normal text-text-subtle" style={{ top: H - (t / max) * H }}>
              {t}
            </span>
          ))}
        </div>

        <div className="relative" style={{ height: H }} onMouseLeave={() => setActive(null)}>
          {ticks.map((t) => (
            <span key={t} aria-hidden className="absolute inset-x-0 h-px bg-border" style={{ top: H - (t / max) * H }} />
          ))}
          <ol className="absolute inset-0 flex items-end" aria-label="Lolos QC dan reject">
            {data.map((d, i) => {
              const total = d.ready + d.reject;
              const hReady = (d.ready / max) * H;
              const hReject = (d.reject / max) * H;
              return (
                <li
                  key={d.key}
                  tabIndex={0}
                  aria-label={`${weekly ? `Minggu ${d.label}` : d.label}: ${d.ready} lolos QC, ${d.reject} reject`}
                  onMouseEnter={() => setActive(i)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                  className="group flex h-full min-w-0 flex-1 cursor-default flex-col items-center justify-end outline-none"
                >
                  <span className={`flex w-[60%] max-w-6 min-w-1 flex-col justify-end gap-0.5 ${active === i ? 'opacity-100' : active === null ? 'opacity-100' : 'opacity-50'}`}>
                    {d.reject > 0 && <span className="block w-full rounded-t-sm bg-chart-reject" style={{ height: Math.max(hReject, 2) }} />}
                    {d.ready > 0 && (
                      <span className={`block w-full bg-chart-ready ${d.reject > 0 ? '' : 'rounded-t-sm'}`} style={{ height: Math.max(hReady, 2) }} />
                    )}
                    {total === 0 && <span className="block h-px w-full" />}
                  </span>
                  <span className="pointer-events-none absolute inset-y-0 hidden w-px bg-border-strong group-focus-visible:block" />
                </li>
              );
            })}
          </ol>

          {a && active !== null && (
            <div
              role="status"
              className="pointer-events-none absolute top-0 z-10 w-40 rounded-md border border-border-strong bg-surface p-2.5 text-small"
              style={{
                left: `clamp(0px, calc(${((active + 0.5) / data.length) * 100}% - 80px), calc(100% - 160px))`,
              }}
            >
              <p className="font-medium">{weekly ? `Minggu ${a.label}` : a.label}</p>
              <p className="mt-1 flex items-center gap-1.5 text-text-muted">
                <span aria-hidden className="size-2 rounded-sm bg-chart-ready" /> Lolos QC <span className="num ml-auto text-text">{a.ready}</span>
              </p>
              <p className="flex items-center gap-1.5 text-text-muted">
                <span aria-hidden className="size-2 rounded-sm bg-chart-reject" /> Reject <span className="num ml-auto text-text">{a.reject}</span>
              </p>
              <p className="flex items-center gap-1.5 text-text-muted">
                <span aria-hidden className="size-2" /> Dipotong <span className="num ml-auto text-text">{a.cut}</span>
              </p>
            </div>
          )}
        </div>

        {/* x labels */}
        <span />
        <div className="flex" aria-hidden>
          {data.map((d, i) => (
            <span key={d.key} className="min-w-0 flex-1 text-center text-caption font-normal whitespace-nowrap text-text-subtle">
              {i % every === 0 ? d.label : ''}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

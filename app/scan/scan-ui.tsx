'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, Check, CircleX, Minus, Plus, ScanLine } from 'lucide-react';
import { cn } from '@/lib/cn';

/** Row under the app header on a task screen: a way back and what this screen does. */
export function TaskHeader({ title, backLabel = 'Batal', onBack }: { title: string; backLabel?: string; onBack: () => void }) {
  return (
    <div className="-mx-4 flex h-12 items-center gap-1 border-b border-border bg-surface px-2">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex h-11 items-center gap-1.5 rounded-md px-2 font-medium hover:bg-surface-muted"
      >
        <ArrowLeft size={20} strokeWidth={1.75} aria-hidden />
        {backLabel}
      </button>
      <span className="ml-auto pr-2 text-h3">{title}</span>
    </div>
  );
}

/**
 * Big quantity stepper for the scan flow: 72px tall, 40px number, thumb-sized - and +.
 * The number is still typeable for big corrections.
 */
export function BigStepper({
  id,
  label,
  value,
  onChange,
  min = 0,
  max,
  invalid,
  tone,
  inline = false,
  quick,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  invalid?: boolean;
  /** Color of the number, e.g. danger for Reject. */
  tone?: 'danger';
  /** Label left of the stepper (two steppers stacked) instead of above it. */
  inline?: boolean;
  /** One-tap preset shown next to the label, e.g. "Sesuai 20". */
  quick?: { label: string; value: number };
}) {
  const clamp = (n: number) => Math.max(min, max === undefined ? n : Math.min(max, n));
  const btn =
    'flex shrink-0 items-center justify-center bg-surface-muted text-text active:bg-primary-soft disabled:opacity-35';
  const box = (
    <div
      className={cn(
        'flex flex-1 items-stretch overflow-hidden rounded-lg border bg-surface',
        inline ? 'h-16' : 'h-[72px]',
        invalid ? 'border-danger' : 'border-border-strong',
      )}
    >
      <button
        type="button"
        onClick={() => onChange(clamp(value - 1))}
        disabled={value <= min}
        aria-label={`Kurangi ${label.toLowerCase()}`}
        className={cn(btn, 'border-r border-border', inline ? 'w-16' : 'w-[72px]')}
      >
        <Minus size={26} strokeWidth={2} aria-hidden />
      </button>
      <input
        id={id}
        inputMode="numeric"
        pattern="[0-9]*"
        value={Number.isFinite(value) ? String(value) : ''}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, '');
          onChange(digits === '' ? 0 : clamp(Number(digits)));
        }}
        aria-invalid={invalid || undefined}
        // inline size: globals.css forces fields to 16px on phones (iOS zoom guard) and would beat a text-* class
        style={{ fontSize: inline ? 32 : 40, lineHeight: inline ? '40px' : '48px' }}
        className={cn(
          'num w-full min-w-0 bg-transparent text-center font-semibold outline-none focus-visible:outline-none',
          tone === 'danger' && value > 0 ? 'text-danger' : 'text-text',
        )}
      />
      <button
        type="button"
        onClick={() => onChange(clamp(value + 1))}
        disabled={max !== undefined && value >= max}
        aria-label={`Tambah ${label.toLowerCase()}`}
        className={cn(btn, 'border-l border-border', inline ? 'w-16' : 'w-[72px]')}
      >
        <Plus size={26} strokeWidth={2} aria-hidden />
      </button>
    </div>
  );

  if (inline) {
    return (
      <div className="flex items-center gap-3">
        <label htmlFor={id} className="w-20 shrink-0 text-h3">
          {label}
        </label>
        {box}
      </div>
    );
  }
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <label htmlFor={id} className="text-h3">
          {label}
        </label>
        {quick && value !== quick.value && (
          <button
            type="button"
            onClick={() => onChange(quick.value)}
            className="h-9 rounded-sm border border-border-strong bg-surface px-2.5 text-small font-medium"
          >
            {quick.label}
          </button>
        )}
      </div>
      <div className="flex">{box}</div>
    </div>
  );
}

/**
 * Reasons as one-tap choices in two columns instead of a dropdown (2-3 taps).
 * `invalid` outlines the group while nothing is picked.
 */
export function ReasonChips({
  legend,
  options,
  value,
  onChange,
  invalid,
}: {
  legend: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  invalid?: boolean;
}) {
  return (
    <fieldset className="motion-safe:animate-[fade-in_150ms_cubic-bezier(0.2,0,0,1)]">
      <legend className="mb-2 text-h3">
        {legend}
        {invalid && <span className="ml-2 text-small font-medium text-danger">Pilih satu</span>}
      </legend>
      <div className="grid grid-cols-2 gap-2">
        {options.map((o) => {
          const on = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(o.value)}
              className={cn(
                'min-h-12 rounded-md px-3 py-2 text-left text-small leading-5',
                on ? 'border-2 border-primary bg-primary-soft font-semibold text-primary' : 'border border-border-strong bg-surface font-medium',
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/** A scan that cannot go ahead: one plain sentence, never a modal (DESIGN §6). */
export function RejectedPanel({ message, children }: { message: string; children?: React.ReactNode }) {
  return (
    <section role="alert" className="mt-3 rounded-lg border-t-[3px] border-danger bg-surface p-4">
      <div className="flex gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-danger-soft text-danger">
          <CircleX size={22} strokeWidth={2} aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-h2 text-danger">Scan ditolak</p>
          <p className="mt-0.5">{message}</p>
        </div>
      </div>
      {children}
      <p className="mt-3 flex items-center gap-1.5 text-small text-text-muted">
        <ScanLine size={16} strokeWidth={1.75} aria-hidden />
        Bisa langsung scan label berikutnya.
      </p>
    </section>
  );
}

/**
 * Full-screen success for `ms`, with a bar running down so people know it returns by itself.
 * Tap the button to go back sooner.
 */
export function SuccessScreen({
  title,
  subtitle,
  children,
  ms,
  onNext,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children?: React.ReactNode;
  ms: number;
  onNext: () => void;
}) {
  const [run, setRun] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setRun(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <div role="status" data-scan-task className="-mx-4 flex flex-1 flex-col bg-success-soft text-success">
      <div aria-hidden className="h-1.5 bg-success/20">
        <div
          className="h-full bg-success transition-[width] ease-linear"
          style={{ width: run ? '0%' : '100%', transitionDuration: `${ms}ms` }}
        />
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <span className="flex size-20 items-center justify-center rounded-full bg-success text-white">
          <Check size={44} strokeWidth={2.25} aria-hidden />
        </span>
        <p className="text-h1">{title}</p>
        {subtitle && <p className="text-text">{subtitle}</p>}
        {children}
      </div>
      <div className="px-4 pt-2 pb-[max(20px,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={onNext}
          className="h-13 w-full rounded-md border border-success py-3.5 font-semibold text-success hover:bg-success/5"
        >
          Scan berikutnya sekarang
        </button>
      </div>
    </div>
  );
}

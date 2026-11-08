'use client';

import { Minus, Plus } from 'lucide-react';

/** Numeric, right-aligned, tabular quantity input with 48px steppers (DESIGN §5.3). */
export function QtyStepper({
  id,
  label,
  value,
  onChange,
  min = 0,
  max,
  invalid,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  invalid?: boolean;
}) {
  const clamp = (n: number) => Math.max(min, max === undefined ? n : Math.min(max, n));
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block font-medium text-text">
        {label}
      </label>
      <div className="flex items-stretch gap-2">
        <button
          type="button"
          onClick={() => onChange(clamp(value - 1))}
          disabled={value <= min}
          className="flex size-12 shrink-0 items-center justify-center rounded-md border border-border bg-surface text-text disabled:opacity-40"
          aria-label={`Kurangi ${label.toLowerCase()}`}
        >
          <Minus size={24} strokeWidth={1.5} aria-hidden />
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
          className="num h-12 w-full min-w-0 rounded-md border border-border bg-surface px-3 text-right text-2xl font-semibold text-text focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-soft aria-[invalid=true]:border-danger"
        />
        <button
          type="button"
          onClick={() => onChange(clamp(value + 1))}
          disabled={max !== undefined && value >= max}
          className="flex size-12 shrink-0 items-center justify-center rounded-md border border-border bg-surface text-text disabled:opacity-40"
          aria-label={`Tambah ${label.toLowerCase()}`}
        >
          <Plus size={24} strokeWidth={1.5} aria-hidden />
        </button>
      </div>
    </div>
  );
}

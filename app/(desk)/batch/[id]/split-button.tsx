'use client';

import { useState, useTransition } from 'react';
import { Plus, Scissors, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InlineAlert } from '@/components/ui/inline-alert';
import { Input } from '@/components/ui/input';
import { splitBundle } from '../actions';

/** FR-07: split a bundle before it is received. Opens an inline panel. */
export function SplitButton({ code, qty }: { code: string; qty: number }) {
  const [open, setOpen] = useState(false);
  const half = Math.floor(qty / 2);
  const [parts, setParts] = useState<string[]>([String(qty - half), String(half)]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const nums = parts.map((p) => Number(p) || 0);
  const sum = nums.reduce((a, b) => a + b, 0);
  const valid = nums.length >= 2 && nums.every((n) => n > 0) && sum === qty;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-10 items-center gap-1.5 rounded-md px-3 text-small text-text-muted hover:bg-surface-muted hover:text-text"
      >
        <Scissors size={16} strokeWidth={1.5} aria-hidden /> Pecah
      </button>
    );
  }

  return (
    <div className="mt-2 w-full min-w-[260px] rounded-md border border-border-strong bg-surface p-3 text-left md:ml-auto md:w-80">
      <div className="flex items-center justify-between">
        <p className="font-medium">
          Pecah <span className="num">{code}</span>
        </p>
        <button type="button" onClick={() => setOpen(false)} className="flex size-8 items-center justify-center rounded-md text-text-muted hover:bg-surface-muted" aria-label="Tutup">
          <X size={16} strokeWidth={1.5} aria-hidden />
        </button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {parts.map((p, i) => (
          <span key={i} className="inline-flex items-center gap-2">
            {i > 0 && <span className="text-text-muted">+</span>}
            <span className="w-16 shrink-0">
              <Input
                aria-label={`Qty pecahan ${i + 1}`}
                inputMode="numeric"
                value={p}
                onChange={(e) => setParts((ps) => ps.map((x, j) => (j === i ? e.target.value.replace(/\D/g, '') : x)))}
                className="num h-10 text-right"
              />
            </span>
          </span>
        ))}
        <button
          type="button"
          onClick={() => setParts((ps) => [...ps, '0'])}
          disabled={parts.length >= qty}
          className="flex size-10 items-center justify-center rounded-md text-text-muted hover:bg-surface-muted disabled:opacity-40"
          aria-label="Tambah pecahan"
        >
          <Plus size={16} strokeWidth={1.5} aria-hidden />
        </button>
      </div>
      <p className={`num mt-2 text-small ${valid ? 'text-text-muted' : 'text-danger'}`}>
        {nums.join(' + ')} = {sum} dari {qty}
      </p>
      {error && <InlineAlert tone="danger" className="mt-2">{error}</InlineAlert>}
      <div className="mt-3 flex justify-end">
        <Button
          disabled={!valid || pending}
          onClick={() =>
            start(async () => {
              setError(null);
              const res = await splitBundle(code, nums);
              if (res.ok) setOpen(false);
              else setError(res.message);
            })
          }
        >
          {pending ? 'Memecah...' : `Pecah jadi ${nums.length} bundle`}
        </Button>
      </div>
    </div>
  );
}

'use client';

import { useState, useTransition } from 'react';
import { Plus, Scissors, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InlineAlert } from '@/components/ui/inline-alert';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { splitBundle } from '../actions';

const ghost =
  'inline-flex h-10 items-center gap-1.5 rounded-md px-3 text-small text-text-muted hover:bg-surface-muted hover:text-text';

/** FR-07: split a bundle before it is received. Form in a modal (DESIGN §5.10). */
export function SplitButton({ code, qty }: { code: string; qty: number }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={ghost}>
        <Scissors size={16} strokeWidth={1.5} aria-hidden /> Pecah
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Pecah bundle ${code}`} width={480}>
        {open && <SplitForm code={code} qty={qty} onClose={() => setOpen(false)} />}
      </Modal>
    </>
  );
}

function SplitForm({ code, qty, onClose }: { code: string; qty: number; onClose: () => void }) {
  const half = Math.floor(qty / 2);
  const [parts, setParts] = useState<string[]>([String(qty - half), String(half)]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const nums = parts.map((p) => Number(p) || 0);
  const sum = nums.reduce((a, b) => a + b, 0);
  const valid = nums.length >= 2 && nums.every((n) => n > 0) && sum === qty;

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        start(async () => {
          setError(null);
          const res = await splitBundle(code, nums);
          if (res.ok) onClose();
          else setError(res.message);
        });
      }}
    >
      <p className="text-small text-text-muted">
        Bagi <span className="num">{qty}</span> pcs menjadi beberapa bundle. Label <span className="num">{code}</span> tidak berlaku lagi; cetak label bundle baru setelahnya.
      </p>
      {/* one part per line: label, qty, remove */}
      <div className="flex flex-col gap-3">
        {parts.map((p, i) => (
          <div key={i} className="flex items-center gap-3">
            <label htmlFor={`split-${i}`} className="w-24 shrink-0 font-medium text-text">
              Bundle {i + 1}
            </label>
            <Input
              id={`split-${i}`}
              inputMode="numeric"
              value={p}
              onChange={(e) => setParts((ps) => ps.map((x, j) => (j === i ? e.target.value.replace(/\D/g, '') : x)))}
              className="num min-w-0 flex-1 text-right"
            />
            <span className="text-small text-text-muted">pcs</span>
            {parts.length > 2 ? (
              <button
                type="button"
                onClick={() => setParts((ps) => ps.filter((_, j) => j !== i))}
                className="flex size-10 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-surface-muted hover:text-text"
                aria-label={`Hapus bundle ${i + 1}`}
              >
                <X size={16} strokeWidth={1.5} aria-hidden />
              </button>
            ) : (
              <span aria-hidden className="size-10 shrink-0" />
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={() => setParts((ps) => [...ps, '0'])}
          disabled={parts.length >= qty}
          className="inline-flex h-10 items-center gap-1.5 self-start rounded-md px-3 text-small text-text-muted hover:bg-surface-muted hover:text-text disabled:opacity-40"
        >
          <Plus size={16} strokeWidth={1.5} aria-hidden /> Tambah pecahan
        </button>
      </div>
      <p className={`num text-small ${valid ? 'text-text-muted' : 'text-danger'}`} aria-live="polite">
        {nums.join(' + ')} = {sum} dari {qty}
      </p>
      {error && <InlineAlert tone="danger">{error}</InlineAlert>}
      <div className="sticky bottom-0 -mx-5 mt-1 flex justify-end gap-2 border-t border-border bg-surface px-5 py-3">
        <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
          Batal
        </Button>
        <Button type="submit" disabled={!valid || pending}>
          {pending ? 'Memecah...' : `Pecah jadi ${nums.length} bundle`}
        </Button>
      </div>
    </form>
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Delete } from 'lucide-react';
import { cn } from '@/lib/cn';
import { expandCode, type EntryKind } from '@/lib/scan/normalize';

export type { EntryKind };

const KIND: Record<EntryKind, { label: string; prefix: string }> = {
  bundle: { label: 'Bundle B-', prefix: 'B-' },
  piece: { label: 'Pcs P-', prefix: 'P-' },
  rack: { label: 'Rak', prefix: '' },
};

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '-', '0'] as const;

/**
 * Type a code when a label is damaged. Bundle and pcs codes are digits, so the page
 * shows its own keypad: the phone keyboard does not pop up and cover half the screen.
 * A rack code has letters and uses the normal keyboard. A plain page section, not a modal.
 */
export function KeypadEntry({
  kinds,
  onSubmit,
  onClose,
  busy,
  className,
}: {
  kinds: EntryKind[];
  onSubmit: (code: string) => void;
  onClose: () => void;
  busy?: boolean;
  className?: string;
}) {
  const [kind, setKind] = useState<EntryKind>(kinds[0]);
  const [typed, setTyped] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const isRack = kind === 'rack';
  const full = expandCode(kind, typed);

  // a rack code needs the system keyboard; digits come from the keypad (or a desk keyboard)
  useEffect(() => {
    if (isRack || window.matchMedia('(pointer: fine)').matches) inputRef.current?.focus();
  }, [isRack]);

  const submit = () => {
    if (!full || busy) return;
    onSubmit(full);
    setTyped('');
  };

  return (
    // data-keypad hides the page's task bar (Kirim, Tutup rak) while typing: it would cover the keys
    <section data-keypad aria-label="Ketik kode" className={cn('flex flex-1 flex-col', className)}>
      <div className="flex flex-1 flex-col gap-3 px-4 pt-2 pb-4">
        <button
          type="button"
          onClick={onClose}
          className="-ml-2 inline-flex h-11 items-center gap-1.5 self-start rounded-md px-2 font-medium hover:bg-surface-muted"
        >
          <ArrowLeft size={20} strokeWidth={1.75} aria-hidden />
          Kembali ke scan
        </button>

        {kinds.length > 1 && (
          <div role="radiogroup" aria-label="Jenis kode" className="grid gap-1 rounded-md bg-surface-muted p-1" style={{ gridTemplateColumns: `repeat(${kinds.length}, minmax(0, 1fr))` }}>
            {kinds.map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={kind === k}
                onClick={() => {
                  setKind(k);
                  setTyped('');
                }}
                className={cn(
                  'h-11 rounded-sm text-small',
                  kind === k ? 'border border-border-strong bg-surface font-semibold text-text' : 'font-medium text-text-muted',
                )}
              >
                {KIND[k].label}
              </button>
            ))}
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <label htmlFor="keypad-code" className="mb-1.5 block text-small font-medium text-text-muted">
            {isRack ? 'Kode rak' : 'Kode di bawah QR label'}
          </label>
          <div className="flex h-[72px] items-center rounded-lg border-2 border-primary bg-surface px-4">
            {!isRack && <span className="num text-[32px] font-semibold text-text-subtle">{KIND[kind].prefix}</span>}
            <input
              ref={inputRef}
              id="keypad-code"
              data-scan-field
              value={typed}
              onChange={(e) => setTyped(isRack ? e.target.value : e.target.value.replace(/[^0-9-]/g, ''))}
              inputMode={isRack ? 'text' : 'none'}
              autoCapitalize="characters"
              autoComplete="off"
              enterKeyHint="go"
              placeholder={isRack ? 'A1' : ''}
              // inline size: globals.css forces fields to 16px on phones (iOS zoom guard) and would
              // beat a text-* class; 32px is above that threshold anyway
              style={{ fontSize: 32, lineHeight: '40px', outline: 'none' }}
              className="num w-full min-w-0 bg-transparent pl-0.5 font-semibold uppercase outline-none placeholder:text-text-subtle focus-visible:outline-none"
            />
          </div>
          <p className="mt-2 text-small text-text-muted" aria-live="polite">
            {isRack ? (
              'Huruf dan angka seperti di label rak.'
            ) : full ? (
              <>
                Dibuka sebagai <span className="num font-medium text-text">{full}</span>
              </>
            ) : (
              'Nol di depan tidak perlu diketik.'
            )}
          </p>
        </form>
      </div>

      {isRack ? (
        <div className="px-4 pt-4 pb-4">
          <button
            type="button"
            onClick={submit}
            disabled={!full || busy}
            className="h-14 w-full rounded-md bg-primary text-[17px] font-semibold text-primary-foreground disabled:opacity-40"
          >
            {busy ? 'Mencari...' : 'Buka'}
          </button>
        </div>
      ) : (
        <div aria-label="Keypad" className="grid grid-cols-3 gap-1.5 border-t border-border-strong bg-surface-muted p-2 pb-[max(8px,env(safe-area-inset-bottom))]">
          {KEYS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setTyped((t) => (t + k).slice(0, 12))}
              className="num h-14 rounded-md bg-surface text-2xl font-medium active:bg-primary-soft"
            >
              {k}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setTyped((t) => t.slice(0, -1))}
            className="flex h-14 items-center justify-center gap-1.5 rounded-md bg-border-strong text-small font-medium active:bg-primary-soft"
          >
            <Delete size={22} strokeWidth={1.75} aria-hidden />
            Hapus
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!full || busy}
            className="col-span-3 h-14 rounded-md bg-primary text-[17px] font-semibold text-primary-foreground disabled:opacity-40"
          >
            {busy ? 'Mencari...' : 'Buka'}
          </button>
        </div>
      )}
    </section>
  );
}

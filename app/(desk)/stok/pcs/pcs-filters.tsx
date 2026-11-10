'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Loader2, Search } from 'lucide-react';
import { Combobox } from '@/components/ui/combobox';
import { Input } from '@/components/ui/input';

const DEBOUNCE_MS = 300;

/**
 * Filters for Per pcs that apply as you go: a product or rack choice updates the URL right away,
 * typing in search waits until the user pauses. The URL stays the source of truth, so a change
 * starts again at page 1 and keeps the tab and page size.
 */
export function PcsFilters({
  products,
  racks,
  reasons,
}: {
  products: string[];
  racks: string[];
  reasons: { value: string; label: string }[];
}) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();

  const urlQ = params.get('q') ?? '';
  const produk = params.get('produk') ?? '';
  const rak = params.get('rak') ?? '';
  const alasan = params.get('alasan') ?? '';
  const [text, setText] = useState(urlQ);
  const inputRef = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // last search text sent to the URL, so the debounce does not resend it
  const sentQ = useRef(urlQ);

  const apply = (over: Record<string, string>) => {
    clearTimeout(timer.current);
    if ('q' in over) sentQ.current = over.q;
    // read the live URL, not `params` from an earlier render, so changes made meanwhile are kept
    const next = new URLSearchParams(window.location.search);
    for (const [k, v] of Object.entries(over)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    next.delete('page');
    const s = next.toString();
    start(() => router.replace(s ? `${path}?${s}` : path, { scroll: false }));
  };

  // Debounced search: only after a pause, and only when it differs from what was last sent.
  useEffect(() => {
    const value = text.trim();
    if (value === sentQ.current) return;
    timer.current = setTimeout(() => apply({ q: value }), DEBOUNCE_MS);
    return () => clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- apply reads the live URL itself
  }, [text]);

  // The URL can change from elsewhere (back button, a tab link): follow it unless the user is typing.
  useEffect(() => {
    sentQ.current = urlQ;
    if (document.activeElement !== inputRef.current) setText(urlQ);
  }, [urlQ]);

  const filtered = Boolean(urlQ || produk || rak || alasan);

  return (
    <div className="mt-6 flex flex-wrap items-center gap-2" aria-busy={pending}>
      <div className="relative w-full sm:w-52">
        <label htmlFor="pcs-q" className="sr-only">
          Cari kode pcs
        </label>
        <Search size={16} strokeWidth={1.5} aria-hidden className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-muted" />
        <Input
          ref={inputRef}
          id="pcs-q"
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && apply({ q: text.trim() })}
          placeholder="Cari kode pcs"
          autoComplete="off"
          className="num h-10 pl-9"
        />
      </div>
      <div className="w-full sm:w-48">
        <Combobox
          searchable
          aria-label="Produk"
          value={produk}
          onChange={(v) => apply({ produk: v })}
          options={[{ value: '', label: 'Semua produk' }, ...products.map((p) => ({ value: p, label: p }))]}
        />
      </div>
      <div className="w-full sm:w-40">
        <Combobox
          searchable
          aria-label="Rak"
          value={rak}
          onChange={(v) => apply({ rak: v })}
          options={[{ value: '', label: 'Semua rak' }, ...racks.map((r) => ({ value: r, label: `Rak ${r}` }))]}
        />
      </div>
      <div className="w-full sm:w-56">
        <Combobox
          searchable
          aria-label="Alasan reject"
          value={alasan}
          onChange={(v) => apply({ alasan: v })}
          options={[{ value: '', label: 'Semua alasan reject' }, ...reasons]}
        />
      </div>
      {filtered && (
        <button
          type="button"
          onClick={() => {
            setText('');
            apply({ q: '', produk: '', rak: '', alasan: '' });
          }}
          className="inline-flex h-10 items-center px-2 text-small text-text-muted hover:text-text"
        >
          Hapus filter
        </button>
      )}
      {pending && <Loader2 size={16} strokeWidth={1.5} aria-label="Memuat" className="animate-spin text-text-muted" />}
    </div>
  );
}

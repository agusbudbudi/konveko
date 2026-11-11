'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Loader2, ScanLine, Search, X } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { CameraScanner } from '@/app/scan/camera-scanner';
import { normalizeScan } from '@/lib/scan/normalize';
import { useScanner } from '@/lib/scan/use-scanner';

const DEBOUNCE_MS = 300;

/**
 * The one search box of Lacak. Results come from the server page via ?q; typing waits for a
 * pause, Enter searches at once. Autofocused so a handheld scanner can type straight into it; when
 * it is not focused, hardware scans still arrive through useScanner.
 * The Scan button reads a label QR with the camera; the server then opens that pcs, bundle or
 * rack directly.
 */
export function LacakBox() {
  const router = useRouter();
  const path = usePathname();
  const urlQ = useSearchParams().get('q') ?? '';
  const [text, setText] = useState(urlQ);
  const [pending, start] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const sentQ = useRef(urlQ);
  const [scanning, setScanning] = useState(false);

  const onScanned = (code: string) => {
    setScanning(false);
    navigator.vibrate?.(60);
    const value = normalizeScan(code);
    setText(value);
    sentQ.current = value;
    // push, not replace: Back from the opened page returns here
    start(() => router.push(`${path}?q=${encodeURIComponent(value)}`));
  };

  // A hardware scanner (SUNMI, wedge gun) works even when the search box is not focused.
  useScanner(onScanned, !scanning);

  const go = (value: string) => {
    clearTimeout(timer.current);
    sentQ.current = value;
    start(() => router.replace(value ? `${path}?q=${encodeURIComponent(value)}` : path, { scroll: false }));
  };

  useEffect(() => {
    const value = text.trim();
    if (value === sentQ.current) return;
    timer.current = setTimeout(() => go(value), DEBOUNCE_MS);
    return () => clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- go only reads refs and stable values
  }, [text]);

  // follow the URL when it changes from elsewhere (back button), unless the user is typing
  useEffect(() => {
    sentQ.current = urlQ;
    if (document.activeElement !== inputRef.current) setText(urlQ);
  }, [urlQ]);

  return (
    <div className="flex gap-2">
      <div className="relative min-w-0 flex-1">
        <label htmlFor="lacak-q" className="sr-only">
          Cari batch, bundle, pcs, rak, produk, atau variant
        </label>
        <Search size={20} strokeWidth={1.5} aria-hidden className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-text-muted" />
        <input
          ref={inputRef}
          id="lacak-q"
          type="search"
          data-scan-field
          autoFocus
          autoComplete="off"
          spellCheck={false}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && go(text.trim())}
          placeholder="Cari kode batch, bundle, pcs, rak, SKU, atau nama produk"
          className="h-14 w-full rounded-lg border border-border-strong bg-surface pr-12 pl-12 text-[17px] text-text placeholder:text-text-muted focus:border-primary focus:ring-2 focus:ring-primary-soft focus:outline-none [&::-webkit-search-cancel-button]:hidden"
        />
        <span className="absolute top-1/2 right-3 flex -translate-y-1/2 items-center">
          {pending ? (
            <Loader2 size={20} strokeWidth={1.5} aria-label="Mencari" className="animate-spin text-text-muted" />
          ) : (
            text && (
              <button
                type="button"
                aria-label="Kosongkan pencarian"
                onClick={() => {
                  setText('');
                  go('');
                  inputRef.current?.focus();
                }}
                className="inline-flex size-8 items-center justify-center rounded-md text-text-muted hover:bg-surface-muted hover:text-text"
              >
                <X size={18} strokeWidth={1.5} aria-hidden />
              </button>
            )
          )}
        </span>
      </div>
      <button
        type="button"
        onClick={() => setScanning(true)}
        className="inline-flex h-14 shrink-0 items-center gap-2 rounded-lg border border-border-strong bg-surface px-4 font-medium text-text hover:border-primary hover:text-primary"
      >
        <ScanLine size={20} strokeWidth={1.5} aria-hidden />
        <span className="max-sm:sr-only">Scan</span>
      </button>

      <Modal open={scanning} onClose={() => setScanning(false)} title="Scan label">
        {scanning && (
          // the modal body has no bottom padding (forms use a sticky footer), so add it here
          <div className="flex flex-col gap-3 pb-5">
            <p className="text-small text-text-muted">Arahkan ke QR di label pcs, bundle, atau rak. Halamannya langsung terbuka.</p>
            <CameraScanner onDetected={onScanned} paused={false} fallback="Tutup, lalu ketik kodenya di kolom cari." />
          </div>
        )}
      </Modal>
    </div>
  );
}

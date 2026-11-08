'use client';

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * Controlled modal on the native <dialog>: focus is trapped and restored,
 * Esc closes. Overlay per DESIGN §4.3: --surface, 1px --border-strong,
 * rgba(20,20,19,0.40) backdrop, no shadow.
 *
 * closeOnBackdrop is off by default so a stray click cannot throw away a
 * half-filled form; turn it on for read-only content (e.g. photo preview).
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  width = 560,
  closeOnBackdrop = false,
  bodyClassName,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  width?: number;
  closeOnBackdrop?: boolean;
  bodyClassName?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      // showModal() focuses the first focusable (the close button); start on the first field instead
      d.querySelector<HTMLElement>(
        '[data-modal-body] input:not([type=hidden]):not([disabled]):not([aria-hidden=true]), [data-modal-body] select, [data-modal-body] textarea',
      )?.focus();
    }
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label={title}
      // Esc and form method=dialog fire "close"; keep parent state in sync
      onClose={() => onCloseRef.current()}
      onClick={(e) => {
        if (closeOnBackdrop && e.target === e.currentTarget) onCloseRef.current();
      }}
      style={{ width: `min(92vw, ${width}px)` }}
      className="m-auto max-h-[90dvh] overflow-hidden rounded-lg border border-border-strong bg-surface p-0 text-text backdrop:bg-[rgba(20,20,19,0.40)] open:flex open:flex-col open:motion-safe:animate-[fade-in_150ms_cubic-bezier(0.2,0,0,1)]"
    >
      {open && (
        <>
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-3">
            <h2 className="min-w-0 truncate text-h3">{title}</h2>
            <button
              type="button"
              onClick={() => onCloseRef.current()}
              aria-label="Tutup"
              className="inline-flex size-10 items-center justify-center rounded-md text-text-muted hover:bg-surface-muted hover:text-text"
            >
              <X size={20} strokeWidth={1.5} aria-hidden />
            </button>
          </div>
          <div data-modal-body className={cn('min-h-0 scroll-pb-20 overflow-y-auto px-5 pt-5', bodyClassName)}>
            {children}
          </div>
        </>
      )}
    </dialog>
  );
}

'use client';

import { useRef } from 'react';
import { ImageIcon, X } from 'lucide-react';

/**
 * Button that opens a photo in a modal (native <dialog>: Esc to close,
 * focus is trapped and restored). Overlay style per DESIGN §4.3:
 * surface + border-strong, rgba(20,20,19,0.40) backdrop, no shadow.
 */
export function PhotoPreview({ url, caption }: { url: string; caption: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const close = () => ref.current?.close();

  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        className="mt-1 inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-surface px-2 text-small text-text-muted hover:border-border-strong hover:text-text"
      >
        <ImageIcon size={16} strokeWidth={1.5} aria-hidden /> Lihat foto
      </button>

      <dialog
        ref={ref}
        aria-label={caption}
        // click on the backdrop (the dialog element itself, outside the panel) closes it
        onClick={(e) => {
          if (e.target === e.currentTarget) close();
        }}
        className="m-auto w-[min(92vw,720px)] rounded-lg border border-border-strong bg-surface p-0 text-text backdrop:bg-[rgba(20,20,19,0.40)] open:motion-safe:animate-[fade-in_150ms_cubic-bezier(0.2,0,0,1)]"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <p className="min-w-0 truncate font-medium">{caption}</p>
          <button
            type="button"
            onClick={close}
            className="inline-flex h-10 items-center gap-1.5 rounded-md px-3 text-small text-text-muted hover:bg-surface-muted hover:text-text"
          >
            <X size={16} strokeWidth={1.5} aria-hidden /> Tutup
          </button>
        </div>
        <div className="flex items-center justify-center bg-surface-muted p-4">
          {/* signed URL from Supabase Storage; next/image would need remote config per environment */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={caption} loading="lazy" className="max-h-[75dvh] w-auto max-w-full rounded-md object-contain" />
        </div>
      </dialog>
    </>
  );
}

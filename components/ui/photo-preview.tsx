'use client';

import { useState } from 'react';
import { ImageIcon } from 'lucide-react';
import { Modal } from './modal';

/** Button that opens a photo in a modal. Backdrop click closes (nothing to lose). */
export function PhotoPreview({ url, caption }: { url: string; caption: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1 inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-surface px-2 text-small text-text-muted hover:border-border-strong hover:text-text"
      >
        <ImageIcon size={16} strokeWidth={1.5} aria-hidden /> Lihat foto
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={caption} width={720} closeOnBackdrop bodyClassName="flex items-center justify-center bg-surface-muted p-4">
        {/* signed URL from Supabase Storage; next/image would need remote config per environment */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={caption} className="max-h-[75dvh] w-auto max-w-full rounded-md object-contain" />
      </Modal>
    </>
  );
}

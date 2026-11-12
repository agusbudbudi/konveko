'use client';

import { useState, useTransition } from 'react';
import { cancelRework } from '@/app/(desk)/rework/actions';
import { Button } from '@/components/ui/button';
import { InlineAlert } from '@/components/ui/inline-alert';
import { Label } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';

/** Undo a rework bundle that has not been scanned yet. Its pcs go back to their rack. */
export function CancelRework({ code, qty, originCode }: { code: string; qty: number; originCode: string }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <>
      <Button
        variant="secondary"
        onClick={() => {
          setNote('');
          setError(null);
          setOpen(true);
        }}
      >
        Batalkan rework
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Batalkan rework ${code}`} width={440}>
        {open && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (pending || note.trim() === '') return;
              start(async () => {
                setError(null);
                const res = await cancelRework(code, note);
                if (res.ok) setOpen(false);
                else setError(res.message);
              });
            }}
            className="flex flex-col gap-4"
          >
            <InlineAlert tone="info">
              {qty} pcs kembali menjadi reject bundle <span className="num">{originCode}</span>, di rak asalnya. Label bundle{' '}
              <span className="num">{code}</span> tidak berlaku lagi.
            </InlineAlert>
            <div>
              <Label htmlFor="cancel-rework-note">Alasan</Label>
              <textarea
                id="cancel-rework-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                maxLength={500}
                placeholder="Misal: tidak bisa diperbaiki, dijual BS"
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-text placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-soft"
              />
            </div>
            {error && <InlineAlert tone="danger">{error}</InlineAlert>}
            <div className="sticky bottom-0 -mx-5 mt-1 flex justify-end gap-2 border-t border-border bg-surface px-5 py-3">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
                Kembali
              </Button>
              <Button type="submit" variant="danger" disabled={pending || note.trim() === ''}>
                {pending ? 'Menyimpan...' : 'Batalkan rework'}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}

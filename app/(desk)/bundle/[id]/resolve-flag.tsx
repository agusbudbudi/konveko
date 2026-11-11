'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { InlineAlert } from '@/components/ui/inline-alert';
import { Label } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { resolveDiscrepancy } from '../actions';

/** FR-22a: close a selisih flag with a note. Numbers do not change. */
export function ResolveFlag({ id, qty }: { id: string; qty: number }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const show = () => {
    setNote('');
    setError(null);
    setOpen(true);
  };

  return (
    <>
      <Button variant="secondary" onClick={show}>
        Selesaikan
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Selesaikan selisih ${qty} pcs`} width={440}>
        {open && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (pending || note.trim() === '') return;
              start(async () => {
                setError(null);
                const res = await resolveDiscrepancy(id, note);
                if (res.ok) setOpen(false);
                else setError(res.message);
              });
            }}
            className="flex flex-col gap-4"
          >
            <InlineAlert tone="info">Angka tidak berubah. Jika qty salah catat, gunakan Koreksi qty di riwayat scan.</InlineAlert>
            <div>
              <Label htmlFor={`resolve-${id}`}>Catatan penyelesaian</Label>
              <textarea
                id={`resolve-${id}`}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder="Misal: sudah dicek, kain memang kurang dari potong"
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-text placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-soft"
              />
            </div>
            {error && <InlineAlert tone="danger">{error}</InlineAlert>}
            <div className="sticky bottom-0 -mx-5 mt-1 flex justify-end gap-2 border-t border-border bg-surface px-5 py-3">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
                Batal
              </Button>
              <Button type="submit" disabled={pending || note.trim() === ''}>
                {pending ? 'Menyimpan...' : 'Selesaikan'}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}

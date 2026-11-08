'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { resolveDiscrepancy } from '../actions';

/** FR-22a: close a selisih flag with a note. Numbers do not change. */
export function ResolveFlag({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Selesaikan
      </Button>
    );
  }
  return (
    <div className="flex w-full max-w-md flex-col gap-2 sm:w-auto">
      <div className="flex gap-2">
        <Input aria-label="Catatan penyelesaian" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Catatan, misal: sudah dicek" maxLength={500} />
        <Button
          disabled={pending || note.trim() === ''}
          onClick={() =>
            start(async () => {
              setError(null);
              const res = await resolveDiscrepancy(id, note);
              if (!res.ok) setError(res.message);
            })
          }
        >
          Simpan
        </Button>
      </div>
      {error && <p className="text-small text-danger">{error}</p>}
      <p className="text-small text-text-muted">Angka tidak berubah. Jika qty salah catat, gunakan koreksi.</p>
    </div>
  );
}

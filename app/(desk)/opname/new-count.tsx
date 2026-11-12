'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ClipboardList } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InlineAlert } from '@/components/ui/inline-alert';
import { Input, Label } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { cn } from '@/lib/cn';
import { createCount } from './actions';

export type RackOption = { code: string; kind: 'stok' | 'reject'; qty: number; busy: string | null };

/** "Opname baru": choose racks; racks in another open count cannot be chosen. */
export function NewCountButton({ racks }: { racks: RackOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const free = racks.filter((r) => !r.busy);

  const toggle = (c: string) => setPicked((p) => (p.includes(c) ? p.filter((x) => x !== c) : [...p, c]));

  return (
    <>
      <Button
        onClick={() => {
          setPicked([]);
          setNote('');
          setError(null);
          setOpen(true);
        }}
      >
        <ClipboardList size={16} strokeWidth={1.5} aria-hidden /> Opname baru
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Stok opname baru" width={560}>
        {open && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (pending || picked.length === 0) return;
              start(async () => {
                setError(null);
                const res = await createCount(picked, note);
                if (!res.ok) return setError(res.message);
                setOpen(false);
                router.push(`/opname/${res.data.id}`);
              });
            }}
            className="flex flex-col gap-5"
          >
            <fieldset>
              <div className="mb-1.5 flex items-center justify-between gap-3">
                <legend className="font-medium">Rak yang dihitung</legend>
                {free.length > 1 && (
                  <button
                    type="button"
                    className="text-small font-medium text-primary hover:underline"
                    onClick={() => setPicked(picked.length === free.length ? [] : free.map((r) => r.code))}
                  >
                    {picked.length === free.length ? 'Kosongkan' : 'Pilih semua'}
                  </button>
                )}
              </div>
              <ul className="grid max-h-72 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
                {racks.map((r) => (
                  <li key={r.code}>
                    <label
                      className={cn(
                        'flex min-h-14 cursor-pointer items-center gap-3 rounded-md border px-3 py-2',
                        picked.includes(r.code) ? 'border-primary bg-primary-soft' : 'border-border hover:border-border-strong',
                        r.busy && 'cursor-not-allowed opacity-50',
                      )}
                    >
                      <input
                        type="checkbox"
                        className="size-4 accent-primary"
                        checked={picked.includes(r.code)}
                        disabled={!!r.busy}
                        onChange={() => toggle(r.code)}
                      />
                      <span>
                        <span className="num font-medium">{r.code}</span>
                        <span className="block text-caption text-text-muted">
                          {r.busy ? `di ${r.busy}` : `${r.kind === 'reject' ? 'reject' : 'stok'} · ${r.qty} pcs`}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>
            <div>
              <Label htmlFor="count-note">
                Catatan <span className="font-normal text-text-muted">(opsional)</span>
              </Label>
              <Input id="count-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Misal: opname akhir bulan" />
            </div>
            <InlineAlert tone="info">
              Rak yang dipilih terkunci sampai opname disetujui atau dibatalkan: tidak bisa putaway, keluar rak, atau kirim barang dari rak itu.
            </InlineAlert>
            {error && <InlineAlert tone="danger">{error}</InlineAlert>}
            <div className="sticky bottom-0 -mx-5 mt-1 flex items-center justify-end gap-2 border-t border-border bg-surface px-5 py-3">
              <span className="num mr-auto text-small text-text-muted">{picked.length} rak dipilih</span>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
                Batal
              </Button>
              <Button type="submit" disabled={pending || picked.length === 0}>
                {pending ? 'Menyimpan...' : 'Mulai opname'}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}

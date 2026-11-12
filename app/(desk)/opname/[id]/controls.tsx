'use client';

import { useState, useTransition } from 'react';
import { CircleCheck, RotateCcw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InlineAlert } from '@/components/ui/inline-alert';
import { Label } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { approveCount, cancelCount, dropScan, reopenRack } from '../actions';

export type ApproveSummary = {
  hilang: number;
  pindah: number;
  jenisSalah: number;
  unlabeled: number;
  findings: number;
};

/** Approve: one confirmation listing what will change. */
export function ApproveButton({ countId, code, summary, blocked }: { countId: string; code: string; summary: ApproveSummary; blocked: boolean }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const items = [
    summary.hilang > 0 && `${summary.hilang} pcs hilang dikeluarkan lewat dokumen penyesuaian`,
    summary.pindah > 0 && `${summary.pindah} pcs dipindah ke rak tempat ditemukan`,
    summary.jenisSalah > 0 && `${summary.jenisSalah} pcs dikeluarkan dari rak karena jenis raknya salah`,
    summary.unlabeled > 0 && `${summary.unlabeled} pcs stok awal dibuat, labelnya masuk antrean cetak`,
    summary.findings > 0 && `${summary.findings} temuan hanya dicatat, tidak diubah`,
  ].filter(Boolean) as string[];

  return (
    <>
      <Button
        disabled={blocked}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        <CircleCheck size={16} strokeWidth={1.5} aria-hidden /> Setujui
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Setujui ${code}`} width={480}>
        {open && (
          <div className="flex flex-col gap-4">
            {items.length === 0 ? (
              <InlineAlert tone="success">Semua cocok. Tidak ada perubahan stok.</InlineAlert>
            ) : (
              <ul className="list-disc pl-5">
                {items.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            )}
            <p className="text-small text-text-muted">Kunci rak dilepas. Setelah disetujui, opname tidak bisa diubah.</p>
            {error && <InlineAlert tone="danger">{error}</InlineAlert>}
            <div className="sticky bottom-0 -mx-5 mt-1 flex justify-end gap-2 border-t border-border bg-surface px-5 py-3">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
                Kembali
              </Button>
              <Button
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    setError(null);
                    const res = await approveCount(countId);
                    if (res.ok) setOpen(false);
                    else setError(res.message);
                  })
                }
              >
                {pending ? 'Menyimpan...' : 'Setujui opname'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

export function CancelCountButton({ countId, code }: { countId: string; code: string }) {
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
        Batalkan
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Batalkan ${code}`} width={440}>
        {open && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (pending || !note.trim()) return;
              start(async () => {
                setError(null);
                const res = await cancelCount(countId, note);
                if (res.ok) setOpen(false);
                else setError(res.message);
              });
            }}
            className="flex flex-col gap-4"
          >
            <InlineAlert tone="info">Hasil hitung dibuang dan kunci rak dilepas. Stok tidak berubah.</InlineAlert>
            <div>
              <Label htmlFor="cancel-count-note">Alasan</Label>
              <textarea
                id="cancel-count-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                maxLength={500}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-text placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-soft"
              />
            </div>
            {error && <InlineAlert tone="danger">{error}</InlineAlert>}
            <div className="sticky bottom-0 -mx-5 mt-1 flex justify-end gap-2 border-t border-border bg-surface px-5 py-3">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
                Kembali
              </Button>
              <Button type="submit" variant="danger" disabled={pending || !note.trim()}>
                {pending ? 'Menyimpan...' : 'Batalkan opname'}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}

/** Recount one rack: its scans are dropped and it goes back to counting. */
export function ReopenRackButton({ countId, rack }: { countId: string; rack: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <>
      <Button variant="ghost" onClick={() => setOpen(true)}>
        <RotateCcw size={16} strokeWidth={1.5} aria-hidden /> Hitung ulang
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Hitung ulang rak ${rack}`} width={420}>
        {open && (
          <div className="flex flex-col gap-4">
            <p>Semua scan rak <span className="num">{rack}</span> di opname ini dihapus, lalu rak dihitung ulang dari awal.</p>
            {error && <InlineAlert tone="danger">{error}</InlineAlert>}
            <div className="sticky bottom-0 -mx-5 mt-1 flex justify-end gap-2 border-t border-border bg-surface px-5 py-3">
              <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
                Kembali
              </Button>
              <Button
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const res = await reopenRack(countId, rack);
                    if (res.ok) setOpen(false);
                    else setError(res.message);
                  })
                }
              >
                {pending ? 'Menyimpan...' : 'Hitung ulang'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

/** Drop one scan of a pcs on one rack (resolving a double scan). */
export function DropScanButton({ countId, rack, piece }: { countId: string; rack: string; piece: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <Button
        variant="ghost"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await dropScan(countId, rack, piece);
            if (!res.ok) setError(res.message);
          })
        }
      >
        <X size={16} strokeWidth={1.5} aria-hidden /> Hapus scan di {rack}
      </Button>
      {error && <span className="text-small text-danger">{error}</span>}
    </span>
  );
}

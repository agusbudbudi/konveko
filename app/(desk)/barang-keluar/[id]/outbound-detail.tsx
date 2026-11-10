'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Truck, Undo2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { InlineAlert } from '@/components/ui/inline-alert';
import { Input, Label } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { RETURN_REASONS, SKIP_LABEL } from '@/lib/outbound';
import { addToOutbound, cancelOutbound, removeFromOutbound, returnPiece, shipOutbound } from '../actions';

/** Desk entry: type a code or use a handheld scanner (it types and presses Enter). */
export function AddByCode({ id }: { id: string }) {
  const [code, setCode] = useState('');
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ tone: 'success' | 'danger' | 'warning'; text: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = () => {
    const value = code.trim();
    if (!value) return;
    start(async () => {
      const res = await addToOutbound(id, value);
      if (!res.ok) setResult({ tone: 'danger', text: res.message });
      else {
        const skipped = Object.entries(res.data.skipped)
          .map(([k, n]) => `${n} ${SKIP_LABEL[k] ?? k}`)
          .join(', ');
        setResult({
          tone: res.data.warning ? 'warning' : 'success',
          text: [res.data.message, skipped && `Dilewati: ${skipped}.`, res.data.warning].filter(Boolean).join(' '),
        });
      }
      setCode('');
      inputRef.current?.focus();
    });
  };

  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <Label htmlFor="ob-add">Tambah barang</Label>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Input
          ref={inputRef}
          id="ob-add"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Scan atau ketik kode pcs / bundle"
          autoComplete="off"
          autoFocus
          className="num h-10"
        />
        <Button type="submit" disabled={pending || !code.trim()}>
          {pending ? 'Menambah...' : 'Tambah'}
        </Button>
      </form>
      <p className="mt-1 text-small text-text-muted">Label bundle menambah semua pcs-nya yang masih di gudang.</p>
      {result && (
        <InlineAlert tone={result.tone} className="mt-3">
          {result.text}
        </InlineAlert>
      )}
    </div>
  );
}

/** Ship and cancel, each behind a confirmation. */
export function DocumentActions({
  id,
  code,
  count,
  destination,
  adjustment,
}: {
  id: string;
  code: string;
  count: number;
  destination: string;
  adjustment: boolean;
}) {
  const [open, setOpen] = useState<'ship' | 'cancel' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const run = (what: 'ship' | 'cancel') =>
    start(async () => {
      setError(null);
      const res = what === 'ship' ? await shipOutbound(id) : await cancelOutbound(id);
      if (!res.ok) return setError(res.message);
      setOpen(null);
      if (what === 'cancel') router.push('/barang-keluar?status=batal');
    });

  return (
    <>
      <Button variant="ghost" onClick={() => setOpen('cancel')}>
        Batalkan
      </Button>
      <Button onClick={() => setOpen('ship')} disabled={count === 0}>
        <Truck size={16} strokeWidth={1.5} aria-hidden /> {adjustment ? 'Keluarkan dari stok' : 'Kirim'}
      </Button>
      <Modal open={open !== null} onClose={() => setOpen(null)} title={open === 'ship' ? (adjustment ? 'Keluarkan dari stok' : 'Kirim barang') : 'Batalkan dokumen'}>
        <div className="flex flex-col gap-4 pb-5">
          {open === 'ship' ? (
            <p>
              <span className="num font-medium">{count} pcs</span>{' '}
              {adjustment ? 'akan dikeluarkan dari stok.' : <>akan dikirim ke <b>{destination}</b>.</>} Setelah ini dokumen{' '}
              <span className="num">{code}</span> tidak bisa diubah. Barang yang kembali dicatat lewat retur.
            </p>
          ) : (
            <p>
              Dokumen <span className="num">{code}</span> dibatalkan dan {count} pcs kembali bebas dipakai. Barang tetap di raknya.
            </p>
          )}
          {error && <InlineAlert tone="danger">{error}</InlineAlert>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(null)} disabled={pending}>
              Kembali
            </Button>
            <Button variant={open === 'cancel' ? 'danger' : 'primary'} onClick={() => run(open!)} disabled={pending}>
              {pending ? 'Menyimpan...' : open === 'ship' ? (adjustment ? 'Ya, keluarkan' : 'Ya, kirim') : 'Ya, batalkan'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

/** Per piece: remove from a draft, or record a return on a shipped document. */
export function ItemAction({ id, code, mode }: { id: string; code: string; mode: 'remove' | 'return' }) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [condition, setCondition] = useState<'baik' | 'rusak'>('baik');
  const [reason, setReason] = useState<string>(RETURN_REASONS[0]);
  const [note, setNote] = useState('');

  if (mode === 'remove') {
    return (
      <Button
        variant="ghost"
        aria-label={`Hapus ${code} dari dokumen`}
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await removeFromOutbound(id, code);
            if (!res.ok) setError(res.message);
          })
        }
      >
        <X size={16} strokeWidth={1.5} aria-hidden />
        {error && <span className="text-small text-danger">{error}</span>}
      </Button>
    );
  }

  return (
    <>
      <Button variant="ghost" onClick={() => setOpen(true)}>
        <Undo2 size={16} strokeWidth={1.5} aria-hidden /> Retur
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Retur ${code}`}>
        <div className="flex flex-col gap-4 pb-5">
          <div>
            <Label htmlFor={`rt-c-${code}`}>Kondisi</Label>
            <Combobox
              id={`rt-c-${code}`}
              value={condition}
              onChange={(v) => setCondition(v as 'baik' | 'rusak')}
              options={[
                { value: 'baik', label: 'Baik', hint: 'kembali ke stok' },
                { value: 'rusak', label: 'Rusak', hint: 'ke rak reject, bisa dijual BS' },
              ]}
            />
          </div>
          <div>
            <Label htmlFor={`rt-r-${code}`}>Alasan</Label>
            <Combobox
              id={`rt-r-${code}`}
              value={reason}
              onChange={setReason}
              options={[...RETURN_REASONS.map((r) => ({ value: r, label: r })), { value: 'lain', label: 'Lainnya' }]}
            />
          </div>
          <div>
            <Label htmlFor={`rt-n-${code}`}>
              Catatan {reason !== 'lain' && <span className="font-normal text-text-muted">(opsional)</span>}
            </Label>
            <Input id={`rt-n-${code}`} value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} className="h-10" />
          </div>
          {error && <InlineAlert tone="danger">{error}</InlineAlert>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Kembali
            </Button>
            <Button
              disabled={pending || (reason === 'lain' && !note.trim())}
              onClick={() =>
                start(async () => {
                  setError(null);
                  const text = [reason === 'lain' ? '' : reason, note.trim()].filter(Boolean).join('. ');
                  const res = await returnPiece(code, condition, text);
                  if (!res.ok) return setError(res.message);
                  setOpen(false);
                })
              }
            >
              {pending ? 'Menyimpan...' : 'Simpan retur'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Pencil, Plus, Printer, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { InlineAlert } from '@/components/ui/inline-alert';
import { Input, Label } from '@/components/ui/input';
import { addBundleToBatch, editBundle } from '../actions';

export type VariantOption = { id: string; sku: string; product_name: string; size: string; color: string };

const variantOptions = (variants: VariantOption[]) =>
  variants.map((v) => ({ value: v.id, label: `${v.product_name} ${v.size} · ${v.color}`, hint: v.sku }));

const ghost =
  'inline-flex h-10 items-center gap-1.5 rounded-md px-3 text-small text-text-muted hover:bg-surface-muted hover:text-text';

/** After a change the label is out of date (it prints variant and qty). */
function Reprint({ message, bundleId, onClose }: { message: string; bundleId: string; onClose: () => void }) {
  return (
    <InlineAlert tone="success" className="mt-2 text-left">
      <span>{message} </span>
      <Link href={`/print/labels?bundle=${bundleId}`} className="inline-flex items-center gap-1 font-medium underline">
        <Printer size={14} strokeWidth={1.5} aria-hidden /> Cetak label
      </Link>
      <button type="button" onClick={onClose} className="ml-2 underline">
        Tutup
      </button>
    </InlineAlert>
  );
}

function Panel({ title, onClose, children }: { title: React.ReactNode; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="mt-2 w-full min-w-[260px] rounded-md border border-border-strong bg-surface p-3 text-left md:ml-auto md:w-96">
      <div className="flex items-center justify-between">
        <p className="font-medium">{title}</p>
        <button type="button" onClick={onClose} className="flex size-8 items-center justify-center rounded-md text-text-muted hover:bg-surface-muted" aria-label="Tutup">
          <X size={16} strokeWidth={1.5} aria-hidden />
        </button>
      </div>
      {children}
    </div>
  );
}

/** FR-10: change qty and/or variant of one bundle while the batch is draft. */
export function EditBundleButton({
  code,
  qty,
  variantId,
  variants,
}: {
  code: string;
  qty: number;
  variantId: string;
  variants: VariantOption[];
}) {
  const [open, setOpen] = useState(false);
  const [newQty, setNewQty] = useState(String(qty));
  const [newVariant, setNewVariant] = useState(variantId);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ message: string; bundleId: string } | null>(null);
  const [pending, start] = useTransition();

  const n = Number(newQty) || 0;
  const changed = n !== qty || newVariant !== variantId;
  const valid = n > 0 && newVariant !== '' && changed;

  if (done) return <Reprint {...done} onClose={() => setDone(null)} />;
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={ghost}>
        <Pencil size={16} strokeWidth={1.5} aria-hidden /> Ubah
      </button>
    );
  }

  const close = () => {
    setOpen(false);
    setError(null);
    setNewQty(String(qty));
    setNewVariant(variantId);
  };

  return (
    <Panel title={<>Ubah <span className="num">{code}</span></>} onClose={close}>
      <div className="mt-3 flex flex-col gap-3">
        <div>
          <Label htmlFor={`v-${code}`}>Variant</Label>
          <Combobox id={`v-${code}`} value={newVariant} onChange={setNewVariant} searchable placeholder="Pilih variant" options={variantOptions(variants)} />
        </div>
        <div className="w-32">
          <Label htmlFor={`q-${code}`}>Qty potong</Label>
          <Input
            id={`q-${code}`}
            inputMode="numeric"
            value={newQty}
            onChange={(e) => setNewQty(e.target.value.replace(/\D/g, ''))}
            className="num h-10 text-right"
          />
        </div>
        <p className="text-small text-text-muted">Label lama tidak berlaku lagi untuk qty atau variant baru. Cetak ulang setelah disimpan.</p>
        {error && <InlineAlert tone="danger">{error}</InlineAlert>}
        <div className="flex justify-end">
          <Button
            disabled={!valid || pending}
            onClick={() =>
              start(async () => {
                setError(null);
                const res = await editBundle({ code, qty: n, variantId: newVariant });
                if (!res.ok) return setError(res.message);
                setOpen(false);
                setDone({ message: res.data.message, bundleId: res.data.bundle_id });
              })
            }
          >
            {pending ? 'Menyimpan...' : 'Simpan'}
          </Button>
        </div>
      </div>
    </Panel>
  );
}

/** FR-10: add a variant that was forgotten at cutting. */
export function AddBundleButton({ batchId, variants }: { batchId: string; variants: VariantOption[] }) {
  const [open, setOpen] = useState(false);
  const [variant, setVariant] = useState('');
  const [qty, setQty] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ message: string; bundleId: string } | null>(null);
  const [pending, start] = useTransition();
  const n = Number(qty) || 0;

  if (done) return <Reprint {...done} onClose={() => setDone(null)} />;
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={ghost}>
        <Plus size={16} strokeWidth={1.5} aria-hidden /> Tambah variant
      </button>
    );
  }

  return (
    <Panel title="Tambah variant" onClose={() => { setOpen(false); setError(null); }}>
      <div className="mt-3 flex flex-col gap-3">
        <div>
          <Label htmlFor="add-variant">Variant</Label>
          <Combobox id="add-variant" value={variant} onChange={setVariant} searchable placeholder="Pilih variant" options={variantOptions(variants)} />
        </div>
        <div className="w-32">
          <Label htmlFor="add-qty">Qty potong</Label>
          <Input id="add-qty" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ''))} className="num h-10 text-right" />
        </div>
        {error && <InlineAlert tone="danger">{error}</InlineAlert>}
        <div className="flex justify-end">
          <Button
            disabled={!variant || n <= 0 || pending}
            onClick={() =>
              start(async () => {
                setError(null);
                const res = await addBundleToBatch({ batchId, variantId: variant, qty: n });
                if (!res.ok) return setError(res.message);
                setOpen(false);
                setVariant('');
                setQty('');
                setDone({ message: res.data.message, bundleId: res.data.bundle_id });
              })
            }
          >
            {pending ? 'Menyimpan...' : 'Tambah bundle'}
          </Button>
        </div>
      </div>
    </Panel>
  );
}

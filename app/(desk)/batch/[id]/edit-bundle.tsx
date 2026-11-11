'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Pencil, Plus, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { InlineAlert } from '@/components/ui/inline-alert';
import { Input, Label } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import type { ActionResult } from '@/lib/types';
import { addBundleToBatch, editBundle } from '../actions';

export type VariantOption = { id: string; sku: string; product_name: string; size: string; color: string };

type Saved = { message: string; bundle_id: string };

const ghost =
  'inline-flex h-10 items-center gap-1.5 rounded-md px-3 text-small text-text-muted hover:bg-surface-muted hover:text-text';

/** After a change the label is out of date (it prints variant and qty). */
function Reprint({ saved, onClose }: { saved: Saved; onClose: () => void }) {
  return (
    <InlineAlert tone="success" className="mt-2 text-left">
      <span>{saved.message} </span>
      <Link href={`/print/labels?bundle=${saved.bundle_id}`} className="inline-flex items-center gap-1 font-medium underline">
        <Printer size={14} strokeWidth={1.5} aria-hidden /> Cetak label
      </Link>
      <button type="button" onClick={onClose} className="ml-2 underline">
        Tutup
      </button>
    </InlineAlert>
  );
}

/**
 * Variant + qty form in a modal (DESIGN §5.10: add/edit forms open in a modal, never inline in a list).
 * Mounted only while the modal is open, so it starts from `initial` every time.
 */
function BundleForm({
  initial,
  variants,
  submitLabel,
  note,
  onSubmit,
  onCancel,
}: {
  initial: { variantId: string; qty: string };
  variants: VariantOption[];
  submitLabel: string;
  note?: string;
  onSubmit: (v: { variantId: string; qty: number }) => Promise<ActionResult<Saved>>;
  onCancel: () => void;
}) {
  const [variantId, setVariantId] = useState(initial.variantId);
  const [qty, setQty] = useState(initial.qty);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const n = Number(qty) || 0;
  const changed = variantId !== initial.variantId || qty !== initial.qty;
  const valid = variantId !== '' && n > 0 && changed;

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        start(async () => {
          setError(null);
          const res = await onSubmit({ variantId, qty: n });
          if (!res.ok) setError(res.message);
        });
      }}
    >
      <div>
        <Label htmlFor="bundle-variant">Variant</Label>
        <Combobox
          id="bundle-variant"
          value={variantId}
          onChange={setVariantId}
          searchable
          required
          placeholder="Pilih variant"
          options={variants.map((v) => ({ value: v.id, label: `${v.product_name} ${v.size} · ${v.color}`, hint: v.sku }))}
        />
      </div>
      <div className="w-40">
        <Label htmlFor="bundle-qty">Qty potong</Label>
        <Input
          id="bundle-qty"
          inputMode="numeric"
          value={qty}
          onChange={(e) => setQty(e.target.value.replace(/\D/g, ''))}
          className="num text-right"
        />
      </div>
      {note && <p className="text-small text-text-muted">{note}</p>}
      {error && <InlineAlert tone="danger">{error}</InlineAlert>}
      <div className="sticky bottom-0 -mx-5 mt-1 flex justify-end gap-2 border-t border-border bg-surface px-5 py-3">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
          Batal
        </Button>
        <Button type="submit" disabled={!valid || pending}>
          {pending ? 'Menyimpan...' : submitLabel}
        </Button>
      </div>
    </form>
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
  const [saved, setSaved] = useState<Saved | null>(null);

  return (
    <>
      {saved ? (
        <Reprint saved={saved} onClose={() => setSaved(null)} />
      ) : (
        <button type="button" onClick={() => setOpen(true)} className={ghost}>
          <Pencil size={16} strokeWidth={1.5} aria-hidden /> Ubah
        </button>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title={`Ubah bundle ${code}`} width={480}>
        {open && (
          <BundleForm
            initial={{ variantId, qty: String(qty) }}
            variants={variants}
            submitLabel="Simpan perubahan"
            note="Label lama tidak berlaku lagi untuk qty atau variant baru. Cetak ulang setelah disimpan."
            onCancel={() => setOpen(false)}
            onSubmit={async (v) => {
              const res = await editBundle({ code, qty: v.qty, variantId: v.variantId });
              if (res.ok) {
                setOpen(false);
                setSaved(res.data);
              }
              return res;
            }}
          />
        )}
      </Modal>
    </>
  );
}

/** FR-10: add a variant that was forgotten at cutting. */
export function AddBundleButton({ batchId, variants }: { batchId: string; variants: VariantOption[] }) {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState<Saved | null>(null);

  return (
    <div className="flex flex-col items-end">
      <button type="button" onClick={() => setOpen(true)} className={ghost}>
        <Plus size={16} strokeWidth={1.5} aria-hidden /> Tambah variant
      </button>
      {saved && <Reprint saved={saved} onClose={() => setSaved(null)} />}
      <Modal open={open} onClose={() => setOpen(false)} title="Tambah variant" width={480}>
        {open && (
          <BundleForm
            initial={{ variantId: '', qty: '' }}
            variants={variants}
            submitLabel="Tambah bundle"
            onCancel={() => setOpen(false)}
            onSubmit={async (v) => {
              const res = await addBundleToBatch({ batchId, variantId: v.variantId, qty: v.qty });
              if (res.ok) {
                setOpen(false);
                setSaved(res.data);
              }
              return res;
            }}
          />
        )}
      </Modal>
    </div>
  );
}

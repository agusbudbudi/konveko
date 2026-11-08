'use client';

import { useState, useTransition } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InlineAlert } from '@/components/ui/inline-alert';
import { Combobox } from '@/components/ui/combobox';
import { Input, Label } from '@/components/ui/input';
import { createBatch } from '../actions';

type Roll = { id: string; code: string; material: string; color: string };
type Variant = { id: string; sku: string; product_name: string; size: string; color: string };
type Row = { key: number; variantId: string; qty: string };

let nextKey = 1;
const emptyRow = (): Row => ({ key: nextKey++, variantId: '', qty: '' });

export function NewBatchForm({ rolls, variants }: { rolls: Roll[]; variants: Variant[] }) {
  const [rollId, setRollId] = useState('');
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const used = new Set(rows.map((r) => r.variantId).filter(Boolean));
  const total = rows.reduce((n, r) => n + (Number(r.qty) || 0), 0);
  const filled = rows.filter((r) => r.variantId && Number(r.qty) > 0);
  const canSubmit = !pending && rollId !== '' && filled.length > 0 && filled.length === rows.filter((r) => r.variantId || r.qty).length;

  const update = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const submit = () =>
    start(async () => {
      setError(null);
      const res = await createBatch({
        fabricRollId: rollId,
        items: filled.map((r) => ({ variantId: r.variantId, qty: Number(r.qty) })),
      });
      // success redirects; we only get here on failure
      if (res && !res.ok) setError(res.message);
    });

  return (
    <div className="mt-6 flex flex-col gap-6">
      <section className="rounded-lg border border-border bg-surface p-5">
        <Label htmlFor="roll">Rol kain</Label>
        <Combobox
          id="roll"
          value={rollId}
          onChange={setRollId}
          placeholder="Pilih rol"
          searchable
          options={rolls.map((r) => ({ value: r.id, label: r.code, hint: `${r.material} ${r.color}` }))}
        />
      </section>

      <section className="rounded-lg border border-border bg-surface">
        <div className="flex items-center justify-between px-5 pt-5">
          <h2 className="text-h2">Hasil potong</h2>
          <p className="text-small text-text-muted">
            Total <span className="num text-text">{total}</span> pcs
          </p>
        </div>
        <div className="mt-4 hidden grid-cols-[1fr_120px_40px] gap-3 bg-surface-muted px-5 py-2 text-caption tracking-[0.02em] text-text-muted sm:grid">
          <span>Variant</span>
          <span className="text-right">Qty</span>
          <span />
        </div>
        <ul className="divide-y divide-border">
          {rows.map((row, i) => (
            <li key={row.key} className="grid grid-cols-[1fr_96px_40px] items-center gap-3 px-5 py-3 sm:grid-cols-[1fr_120px_40px]">
              <Combobox
                aria-label={`Variant baris ${i + 1}`}
                value={row.variantId}
                onChange={(v) => update(row.key, { variantId: v })}
                placeholder="Pilih variant"
                searchable
                options={variants.map((v) => ({
                  value: v.id,
                  label: `${v.product_name} ${v.size} · ${v.color}`,
                  hint: v.sku,
                  disabled: used.has(v.id) && v.id !== row.variantId,
                }))}
              />
              <Input
                aria-label={`Qty baris ${i + 1}`}
                inputMode="numeric"
                value={row.qty}
                onChange={(e) => update(row.key, { qty: e.target.value.replace(/\D/g, '') })}
                placeholder="0"
                className="num h-10 text-right"
              />
              <button
                type="button"
                onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.key !== row.key) : [emptyRow()]))}
                className="flex size-10 items-center justify-center rounded-md text-text-muted hover:bg-surface-muted"
                aria-label={`Hapus baris ${i + 1}`}
              >
                <Trash2 size={16} strokeWidth={1.5} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
        <div className="border-t border-border px-5 py-3">
          <Button
            variant="ghost"
            onClick={() => setRows((rs) => [...rs, emptyRow()])}
            disabled={rows.length >= variants.length}
          >
            <Plus size={16} strokeWidth={1.5} aria-hidden /> Tambah variant
          </Button>
        </div>
      </section>

      {error && <InlineAlert tone="danger">{error}</InlineAlert>}

      <div className="flex justify-end">
        <Button onClick={submit} disabled={!canSubmit}>
          {pending ? 'Menyimpan...' : `Buat batch ${total > 0 ? `${total} pcs` : ''}`.trim()}
        </Button>
      </div>
    </div>
  );
}

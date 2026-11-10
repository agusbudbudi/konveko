'use client';

import { useActionState, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Combobox, type ComboOption } from '@/components/ui/combobox';
import { InlineAlert } from '@/components/ui/inline-alert';
import { Input, Label } from '@/components/ui/input';
import { initialForm } from '@/lib/master';
import { OUTBOUND_TYPE, type OutboundType } from '@/lib/outbound';
import { createOutbound } from '../actions';

type PlanRow = { key: number; variant: string; qty: string };

export function NewOutboundForm({
  isSupervisor,
  destinations,
  variants,
}: {
  isSupervisor: boolean;
  destinations: string[];
  variants: ComboOption[];
}) {
  const [state, action, pending] = useActionState(createOutbound, initialForm);
  const [type, setType] = useState<OutboundType>('jual');
  const [plan, setPlan] = useState<PlanRow[]>([]);
  const [nextKey, setNextKey] = useState(1);

  const types = (Object.keys(OUTBOUND_TYPE) as OutboundType[]).filter((t) => t !== 'penyesuaian' || isSupervisor);
  const adjustment = type === 'penyesuaian';
  const used = new Set(plan.map((p) => p.variant).filter(Boolean));

  return (
    <form action={action} className="mt-6 flex max-w-3xl flex-col gap-6">
      <section className="flex flex-col gap-5 rounded-lg border border-border bg-surface p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="ob-type">Jenis</Label>
            <Combobox
              id="ob-type"
              name="type"
              value={type}
              onChange={(v) => setType(v as OutboundType)}
              options={types.map((t) => ({ value: t, label: OUTBOUND_TYPE[t].label, hint: OUTBOUND_TYPE[t].hint }))}
              required
            />
          </div>
          <div>
            <Label htmlFor="ob-dest">{adjustment ? 'Keterangan singkat' : 'Tujuan'}</Label>
            <Input
              id="ob-dest"
              name="destination"
              required
              maxLength={120}
              defaultValue={adjustment ? 'Penyesuaian stok' : undefined}
              key={adjustment ? 'adj' : 'dest'}
              placeholder={adjustment ? 'Penyesuaian stok' : 'Nama toko atau pembeli'}
              list="ob-dest-list"
              autoComplete="off"
              className="h-10"
            />
            <datalist id="ob-dest-list">
              {destinations.map((d) => (
                <option key={d} value={d} />
              ))}
            </datalist>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="ob-ref">
              No. referensi <span className="font-normal text-text-muted">(opsional)</span>
            </Label>
            <Input id="ob-ref" name="ref_no" maxLength={60} placeholder="No. pesanan atau invoice" autoComplete="off" className="num h-10" />
          </div>
          <div>
            <Label htmlFor="ob-note">
              {adjustment ? 'Alasan' : 'Catatan'}
              {!adjustment && <span className="font-normal text-text-muted"> (opsional)</span>}
            </Label>
            <Input
              id="ob-note"
              name="note"
              required={adjustment}
              maxLength={500}
              placeholder={adjustment ? 'Misal: hilang saat stok opname' : ''}
              autoComplete="off"
              className="h-10"
            />
          </div>
        </div>
        {adjustment && (
          <InlineAlert tone="warning">Penyesuaian mengeluarkan barang dari stok tanpa penjualan, misalnya hilang atau rusak dibuang.</InlineAlert>
        )}
      </section>

      <section className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-5">
        <div>
          <h2 className="text-h3">
            Rencana <span className="text-small font-normal text-text-muted">(opsional)</span>
          </h2>
          <p className="text-small text-text-muted">Isi kalau ada pesanan per variant. Saat scan, progres dan kelebihannya terlihat.</p>
        </div>
        {plan.map((row, i) => (
          <div key={row.key} className="grid grid-cols-[minmax(0,1fr)_120px_auto] items-end gap-2">
            <div>
              {i === 0 && <Label htmlFor={`plan-v-${row.key}`}>Variant</Label>}
              <Combobox
                id={`plan-v-${row.key}`}
                name={`plan[${i}][variant]`}
                value={row.variant}
                onChange={(v) => setPlan((ps) => ps.map((p) => (p.key === row.key ? { ...p, variant: v } : p)))}
                options={variants.map((o) => ({ ...o, disabled: o.value !== row.variant && used.has(o.value) }))}
                placeholder="Pilih variant"
                searchable
              />
            </div>
            <div>
              {i === 0 && <Label htmlFor={`plan-q-${row.key}`}>Jumlah</Label>}
              <Input
                id={`plan-q-${row.key}`}
                name={`plan[${i}][qty]`}
                type="number"
                min={1}
                max={100000}
                inputMode="numeric"
                value={row.qty}
                onChange={(e) => setPlan((ps) => ps.map((p) => (p.key === row.key ? { ...p, qty: e.target.value } : p)))}
                className="num h-10 text-right"
              />
            </div>
            <Button type="button" variant="ghost" aria-label="Hapus baris" onClick={() => setPlan((ps) => ps.filter((p) => p.key !== row.key))}>
              <Trash2 size={16} strokeWidth={1.5} aria-hidden />
            </Button>
          </div>
        ))}
        <div>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setPlan((ps) => [...ps, { key: nextKey, variant: '', qty: '' }]);
              setNextKey((k) => k + 1);
            }}
          >
            <Plus size={16} strokeWidth={1.5} aria-hidden /> Tambah variant
          </Button>
        </div>
      </section>

      {state.error && <InlineAlert tone="danger">{state.error}</InlineAlert>}
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? 'Membuat...' : 'Buat dokumen'}
        </Button>
      </div>
    </form>
  );
}

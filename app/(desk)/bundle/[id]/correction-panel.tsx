'use client';

import { useState, useTransition } from 'react';
import { Pencil, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InlineAlert } from '@/components/ui/inline-alert';
import { Combobox } from '@/components/ui/combobox';
import { Label } from '@/components/ui/input';
import { QtyStepper } from '@/components/ui/qty-stepper';
import { MOVEMENT_LABEL, type MovementType } from '@/lib/movement';
import type { Reason } from '@/lib/types';
import { correctMovement } from '../actions';

type M = {
  id: string;
  type: MovementType;
  qty_sent: number | null;
  qty_received: number | null;
  qty_good: number | null;
  qty_reject: number | null;
  reason_id: string | null;
};

/** FR-24: supervisor corrects or undoes the latest scan of a bundle. */
export function CorrectionPanel({ movement: m, reasons }: { movement: M; reasons: Reason[] }) {
  const [mode, setMode] = useState<'closed' | 'koreksi' | 'batal'>('closed');
  const isReceive = m.type === 'receive_sew' || m.type === 'receive_finishing';
  const sent = m.qty_sent ?? 0;
  const received = m.qty_received ?? 0;

  const [qtyReceived, setQtyReceived] = useState(received);
  const [good, setGood] = useState(m.qty_good ?? 0);
  const [reject, setReject] = useState(m.qty_reject ?? 0);
  const [reasonId, setReasonId] = useState(m.reason_id ?? '');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const reasonType = isReceive ? 'selisih' : 'reject';
  const needsReason = isReceive ? qtyReceived < sent : reject > 0;
  const balanced = isReceive || good + reject === received;
  const changed = isReceive
    ? qtyReceived !== received
    : good !== (m.qty_good ?? 0) || reject !== (m.qty_reject ?? 0) || reasonId !== (m.reason_id ?? '');
  const canSubmit =
    !pending &&
    note.trim() !== '' &&
    (mode === 'batal' || (changed && balanced && (!needsReason || reasonId !== '')));

  const submit = () =>
    start(async () => {
      setError(null);
      const res = await correctMovement({
        movementId: m.id,
        note,
        isVoid: mode === 'batal',
        qtyReceived: isReceive ? qtyReceived : null,
        qtyGood: isReceive ? null : good,
        qtyReject: isReceive ? null : reject,
        reasonId: needsReason ? reasonId : null,
      });
      if (res.ok) {
        setMode('closed');
        setNote('');
      } else setError(res.message);
    });

  if (mode === 'closed') {
    return (
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => setMode('koreksi')}>
          <Pencil size={16} strokeWidth={1.5} aria-hidden /> Koreksi qty
        </Button>
        <Button variant="ghost" onClick={() => setMode('batal')}>
          <Undo2 size={16} strokeWidth={1.5} aria-hidden /> Batalkan scan
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-3 max-w-md rounded-md border border-border-strong bg-surface p-4">
      <p className="font-medium">
        {mode === 'batal' ? `Batalkan ${MOVEMENT_LABEL[m.type].toLowerCase()}` : `Koreksi ${MOVEMENT_LABEL[m.type].toLowerCase()}`}
      </p>

      {mode === 'batal' ? (
        <InlineAlert tone="warning" className="mt-3">
          Status bundle mundur satu langkah. Scan asli tetap tercatat di riwayat.
        </InlineAlert>
      ) : (
        <div className="mt-3 flex flex-col gap-4">
          {isReceive ? (
            <QtyStepper id="fix-received" label={`Qty diterima (kirim ${sent})`} value={qtyReceived} onChange={setQtyReceived} max={sent} />
          ) : (
            <>
              <QtyStepper id="fix-good" label={m.type === 'finish_sew' ? 'Jadi' : 'Lolos QC'} value={good} onChange={setGood} max={received} invalid={!balanced} />
              <QtyStepper id="fix-reject" label="Reject" value={reject} onChange={setReject} max={received} invalid={!balanced} />
              <p className={`num rounded-md px-4 py-2 text-right ${balanced ? 'bg-surface-muted' : 'bg-danger-soft text-danger'}`}>
                {good} + {reject} = {good + reject} dari {received}
              </p>
            </>
          )}
          {needsReason && (
            <div>
              <Label htmlFor="fix-reason">Alasan {reasonType}</Label>
              <Combobox
                id="fix-reason"
                value={reasonId}
                onChange={setReasonId}
                required
                options={reasons.filter((r) => r.type === reasonType).map((r) => ({ value: r.id, label: r.label }))}
              />
            </div>
          )}
        </div>
      )}

      <div className="mt-4">
        <Label htmlFor="fix-note">Alasan koreksi</Label>
        <textarea
          id="fix-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          maxLength={500}
          placeholder="Wajib diisi, tercatat di audit log"
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-text placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-soft"
        />
      </div>

      {error && <InlineAlert tone="danger" className="mt-3">{error}</InlineAlert>}

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={() => setMode('closed')} disabled={pending}>
          Batal
        </Button>
        <Button variant={mode === 'batal' ? 'danger' : 'primary'} onClick={submit} disabled={!canSubmit}>
          {pending ? 'Menyimpan...' : mode === 'batal' ? 'Batalkan scan' : 'Simpan koreksi'}
        </Button>
      </div>
    </div>
  );
}

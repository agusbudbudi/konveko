'use client';

import { useState, useTransition } from 'react';
import { Pencil, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InlineAlert } from '@/components/ui/inline-alert';
import { Combobox } from '@/components/ui/combobox';
import { Label } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
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

  const open = (next: 'koreksi' | 'batal') => {
    // Every open starts from the scan as recorded, not from a half-edited earlier attempt.
    setQtyReceived(received);
    setGood(m.qty_good ?? 0);
    setReject(m.qty_reject ?? 0);
    setReasonId(m.reason_id ?? '');
    setNote('');
    setError(null);
    setMode(next);
  };
  // Unconditional: Esc closes the native dialog even mid-save, state must follow it.
  const close = () => setMode('closed');
  const step = MOVEMENT_LABEL[m.type].toLowerCase();

  return (
    <>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => open('koreksi')}>
          <Pencil size={16} strokeWidth={1.5} aria-hidden /> Koreksi qty
        </Button>
        <Button variant="ghost" onClick={() => open('batal')}>
          <Undo2 size={16} strokeWidth={1.5} aria-hidden /> Batalkan scan
        </Button>
      </div>

      <Modal open={mode !== 'closed'} onClose={close} title={mode === 'batal' ? `Batalkan ${step}` : `Koreksi ${step}`} width={480}>
        {mode !== 'closed' && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (canSubmit) submit();
            }}
            className="flex flex-col gap-4"
          >
            {mode === 'batal' ? (
              <InlineAlert tone="warning">Status bundle mundur satu langkah. Scan asli tetap tercatat di riwayat.</InlineAlert>
            ) : isReceive ? (
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

            {mode === 'koreksi' && needsReason && (
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

            <div>
              <Label htmlFor="fix-note">{mode === 'batal' ? 'Alasan pembatalan' : 'Alasan koreksi'}</Label>
              <textarea
                id="fix-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder="Wajib diisi, tercatat di audit log"
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-text placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-soft"
              />
            </div>

            {error && <InlineAlert tone="danger">{error}</InlineAlert>}

            <div className="sticky bottom-0 -mx-5 mt-1 flex justify-end gap-2 border-t border-border bg-surface px-5 py-3">
              <Button type="button" variant="ghost" onClick={close} disabled={pending}>
                Batal
              </Button>
              <Button type="submit" variant={mode === 'batal' ? 'danger' : 'primary'} disabled={!canSubmit}>
                {pending ? 'Menyimpan...' : mode === 'batal' ? 'Batalkan scan' : 'Simpan koreksi'}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}

// Pure: unit-tested with plain node (tests/unit).

/**
 * Document history, newest first. Built from what is already recorded: the document's own
 * timestamps (created, shipped, cancelled) and the piece events linked to it.
 *
 * Piece events come one per pcs, so a run of the same action by the same person (a bundle
 * scan adds 18 pcs at once, a picker scans pcs one after another) is folded into one entry.
 * The per-pcs 'keluar' events repeat "Dikirim", and the releases written by a cancel repeat
 * "Dibatalkan", so both only add a count to the document entry.
 */

export type HistoryDoc = {
  created_at: string;
  created_by: string;
  shipped_at: string | null;
  shipped_by: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
};

export type HistoryEvent = {
  seq: number;
  type: string;
  note: string | null;
  created_at: string;
  created_by: string;
  piece: { code: string } | null;
};

export type HistoryEntry = { at: string; by: string | null; title: string; codes: string[]; note?: string | null };

/** Same action by the same person within this gap is one entry. */
const FOLD_MS = 5 * 60 * 1000;
const CANCEL_NOTE = 'Dokumen dibatalkan';

export function buildHistory(doc: HistoryDoc, events: HistoryEvent[]): HistoryEntry[] {
  const entries: HistoryEntry[] = [{ at: doc.created_at, by: doc.created_by, title: 'Dokumen dibuat', codes: [] }];
  let shipped = 0;
  let released = 0;
  let run: (HistoryEntry & { type: string; last: number }) | null = null;

  const flush = () => {
    if (!run) return;
    const n = run.codes.length;
    run.title = run.type === 'dipesan' ? `${n} pcs ditambahkan` : `${n} pcs dihapus dari dokumen`;
    entries.push(run);
    run = null;
  };

  for (const e of [...events].sort((a, b) => a.seq - b.seq)) {
    const code = e.piece?.code ?? '-';
    const t = new Date(e.created_at).getTime();
    if (e.type === 'keluar') {
      shipped++;
      continue;
    }
    if (e.type === 'lepas_pesan' && e.note === CANCEL_NOTE) {
      released++;
      continue;
    }
    if (e.type === 'dipesan' || e.type === 'lepas_pesan') {
      if (run && run.type === e.type && run.by === e.created_by && t - run.last <= FOLD_MS) {
        run.codes.push(code);
        run.last = t;
      } else {
        flush();
        run = { type: e.type, at: e.created_at, by: e.created_by, title: '', codes: [code], last: t };
      }
      continue;
    }
    flush();
    if (e.type === 'retur') entries.push({ at: e.created_at, by: e.created_by, title: `Retur ${code}`, codes: [], note: e.note });
  }
  flush();

  if (doc.shipped_at) {
    entries.push({ at: doc.shipped_at, by: doc.shipped_by, title: `Dikirim${shipped ? ` · ${shipped} pcs` : ''}`, codes: [] });
  }
  if (doc.cancelled_at) {
    entries.push({
      at: doc.cancelled_at,
      by: doc.cancelled_by,
      title: `Dokumen dibatalkan${released ? ` · ${released} pcs dilepas` : ''}`,
      codes: [],
    });
  }
  return entries.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

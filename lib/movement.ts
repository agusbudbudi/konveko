export type MovementType =
  | 'cut'
  | 'split'
  | 'rework'
  | 'receive_sew'
  | 'finish_sew'
  | 'receive_finishing'
  | 'finish_finishing'
  | 'correction';

export const MOVEMENT_LABEL: Record<MovementType, string> = {
  cut: 'Potong',
  split: 'Pecah',
  rework: 'Masuk rework',
  receive_sew: 'Terima jahit',
  finish_sew: 'Selesai jahit',
  receive_finishing: 'Terima finishing',
  finish_finishing: 'Selesai finishing',
  correction: 'Koreksi',
};

export type QtyFields = {
  qty_sent: number | null;
  qty_received: number | null;
  qty_good: number | null;
  qty_reject: number | null;
};

/** One-line quantity summary in the tone of DESIGN §9. */
export function qtySummary(type: MovementType, m: QtyFields): string {
  switch (type) {
    case 'cut':
    case 'split':
    case 'rework':
      return `${m.qty_sent} pcs`;
    case 'receive_sew':
    case 'receive_finishing': {
      const diff = (m.qty_sent ?? 0) - (m.qty_received ?? 0);
      return diff > 0 ? `${m.qty_received} dari ${m.qty_sent} pcs, selisih ${diff}` : `${m.qty_received} pcs`;
    }
    case 'finish_sew':
      return `${m.qty_good} jadi, ${m.qty_reject} reject`;
    case 'finish_finishing':
      return `${m.qty_good} lolos QC, ${m.qty_reject} reject`;
    default:
      return '';
  }
}

export const CORRECTABLE: MovementType[] = ['receive_sew', 'finish_sew', 'receive_finishing', 'finish_finishing'];

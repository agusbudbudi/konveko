export type BundleStatus =
  | 'siap_jahit'
  | 'proses_jahit'
  | 'siap_finishing'
  | 'proses_finishing'
  | 'ready_stock'
  | 'dipecah';

export type LookupResult = {
  bundle_id: string;
  code: string;
  batch_code: string;
  variant: { sku: string; product_name: string; size: string; color: string };
  status: BundleStatus;
  ref_qty: number;
  holder_name: string | null;
  last_movement_at: string;
  version: number;
  next_action: 'terima' | 'selesai' | null;
  allowed: boolean;
  message: string | null;
  children: string | null;
};

export type ScanResult = {
  movement_id: string;
  code: string;
  status: BundleStatus;
  message: string;
  /** scan_receive only: pcs short of what was sent. */
  selisih?: number;
};

export type Reason = { id: string; type: 'selisih' | 'reject'; label: string };

export type ActionResult<T> = { ok: true; data: T } | { ok: false; message: string; code: string | null };

export const STATUS_LABEL: Record<BundleStatus, string> = {
  siap_jahit: 'Siap jahit',
  proses_jahit: 'Proses jahit',
  siap_finishing: 'Siap finishing',
  proses_finishing: 'Proses finishing',
  ready_stock: 'Ready stock',
  dipecah: 'Dipecah',
};

export const BATCH_STATUS = {
  draft: { label: 'Draft', tone: 'neutral' },
  berjalan: { label: 'Berjalan', tone: 'info' },
  selesai: { label: 'Selesai', tone: 'success' },
} as const;

// ---- Fase 2a: warehouse --------------------------------------------------
type VariantInfo = { sku: string; product_name: string; size: string; color: string };

export type WarehouseLookup =
  | { kind: 'location'; id: string; code: string; location_kind: 'stok' | 'reject'; note: string | null; qty: number }
  | {
      kind: 'bundle';
      id: string;
      code: string;
      status: BundleStatus;
      variant: VariantInfo;
      unshelved_baik: number;
      unshelved_reject: number;
      unprinted: number;
      shelved: number;
    }
  | {
      kind: 'piece';
      id: string;
      code: string;
      grade: 'baik' | 'reject';
      status: 'aktif' | 'batal' | 'keluar';
      /** Fase 2b: condition after production (a damaged return is 'rusak'); sellable = baik + baik */
      condition: 'baik' | 'rusak';
      sellable: boolean;
      printed: boolean;
      location_code: string | null;
      /** the draft that reserves it, or the document that shipped it */
      outbound_code: string | null;
      bundle_code: string;
      variant: VariantInfo;
    };

export type PutawayResult = { moved: number; location_code: string; code: string; message: string };

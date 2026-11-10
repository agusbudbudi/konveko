// Fase 2b: outbound documents (surat jalan). Shared labels and types for desk, scan and print.

export type OutboundType = 'jual' | 'jual_bs' | 'kirim_toko' | 'sampel' | 'penyesuaian';
export type OutboundStatus = 'draft' | 'dikirim' | 'batal';

export const OUTBOUND_TYPE: Record<OutboundType, { label: string; hint: string }> = {
  jual: { label: 'Penjualan', hint: 'Pesanan toko atau pembeli' },
  jual_bs: { label: 'Jual BS', hint: 'Barang reject atau rusak yang dijual' },
  kirim_toko: { label: 'Kirim ke toko', hint: 'Ke toko atau cabang sendiri' },
  sampel: { label: 'Sampel', hint: 'Sampel atau promosi' },
  penyesuaian: { label: 'Penyesuaian', hint: 'Hilang atau rusak di gudang, khusus supervisor' },
};

export const OUTBOUND_STATUS: Record<OutboundStatus, { label: string; tone: 'neutral' | 'success' | 'info' }> = {
  draft: { label: 'Draft', tone: 'info' },
  dikirim: { label: 'Dikirim', tone: 'success' },
  batal: { label: 'Dibatalkan', tone: 'neutral' },
};

export const isOutboundType = (v: unknown): v is OutboundType => typeof v === 'string' && v in OUTBOUND_TYPE;

export type OutboundProgress = { variant_id: string; sku: string; label: string; planned: number; scanned: number }[];

export type OutboundAddResult = {
  added: number;
  skipped: Record<string, number>;
  skipped_count: number;
  message: string;
  warning: string | null;
  progress: OutboundProgress;
  total: number;
};

export type OutboundRemoveResult = { code: string; message: string; progress: OutboundProgress; total: number };
export type OutboundShipResult = { code: string; shipped: number; message: string };
export type PieceReturnResult = { code: string; from: string; condition: 'baik' | 'rusak'; message: string };

/** Why pieces of a bundle were skipped, in words (keys come from app.outbound_block). */
export const SKIP_LABEL: Record<string, string> = {
  batal: 'dibatalkan',
  sudah_keluar: 'sudah keluar',
  dipesan: 'sudah di dokumen',
  belum_cetak: 'label belum dicetak',
  bukan_bs: 'barang baik (bukan BS)',
  bs: 'barang reject atau rusak',
};

export const RETURN_REASONS = ['Salah ukuran', 'Salah warna', 'Cacat dari pabrik', 'Rusak di jalan', 'Tidak jadi dibeli'] as const;

'use client';

import { ScanApp, type ScanActions } from '@/app/scan/scan-app';
import type { LookupResult, Reason } from '@/lib/types';

const reasons: Reason[] = [
  { id: 's1', type: 'selisih', label: 'Potongan kurang saat diserahkan' },
  { id: 's2', type: 'selisih', label: 'Hilang saat dipindah' },
  { id: 'r1', type: 'reject', label: 'Jahitan rusak atau miring' },
  { id: 'r2', type: 'reject', label: 'Noda atau kotor' },
];

const variant = { sku: 'KMJ-PTH-M', product_name: 'Kemeja', size: 'M', color: 'Putih' };
const base = { batch_code: 'BT-0001', variant, last_movement_at: new Date().toISOString(), version: 1, children: null };

// B-00001 siap jahit, B-00002 sedang dijahit oleh user ini,
// B-00003 sudah stok, B-00004 menunggu finishing (role lain)
const fixtures: Record<string, LookupResult> = {
  'B-00001': { ...base, bundle_id: '1', code: 'B-00001', status: 'siap_jahit', ref_qty: 20, holder_name: 'Tim produksi', next_action: 'terima', allowed: true, message: null },
  'B-00002': { ...base, bundle_id: '2', code: 'B-00002', status: 'proses_jahit', ref_qty: 19, holder_name: 'Ani', next_action: 'selesai', allowed: true, message: null },
  'B-00003': { ...base, bundle_id: '3', code: 'B-00003', status: 'ready_stock', ref_qty: 17, holder_name: 'Tim finishing', next_action: null, allowed: false, message: 'Bundle B-00003 sudah selesai finishing (Ready stock), belum masuk rak. Langkah berikutnya: gudang cetak label pcs lalu simpan ke rak.' },
  'B-00004': { ...base, bundle_id: '4', code: 'B-00004', status: 'siap_finishing', ref_qty: 18, holder_name: 'Ani', next_action: 'terima', allowed: false, message: 'Bundle B-00004 berstatus siap finishing. Langkah berikutnya untuk finishing.' },
};

const wait = () => new Promise((r) => setTimeout(r, 400));

const mock: ScanActions = {
  async lookup(code) {
    await wait();
    const b = fixtures[code.trim().toUpperCase()];
    return b ? { ok: true, data: b } : { ok: false, message: 'Bundle tidak ditemukan. Cek lagi kodenya.', code: 'not_found' };
  },
  async receive({ code, qtyReceived }) {
    await wait();
    const b = fixtures[code];
    const diff = b.ref_qty - qtyReceived;
    return {
      ok: true,
      data: {
        movement_id: 'm', code, status: 'proses_jahit',
        message: diff > 0 ? `Bundle ${code} diterima. ${qtyReceived} dari ${b.ref_qty} pcs, selisih ${diff}.` : `Bundle ${code} diterima. ${qtyReceived} pcs.`,
      },
    };
  },
  async finish({ code, qtyGood, qtyReject }) {
    await wait();
    return { ok: true, data: { movement_id: 'm', code, status: 'siap_finishing', message: `Bundle ${code} selesai jahit. ${qtyGood} jadi, ${qtyReject} reject.` } };
  },
};

export function Preview() {
  return <ScanApp userId="preview" reasons={reasons} actions={mock} />;
}

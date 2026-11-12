// Fase 2c stok opname: labels shared by the desk pages.

export type CountStatus = 'menghitung' | 'review' | 'disetujui' | 'batal';

export const COUNT_STATUS: Record<CountStatus, { label: string; tone: 'info' | 'warning' | 'success' | 'neutral' }> = {
  menghitung: { label: 'Menghitung', tone: 'info' },
  review: { label: 'Menunggu review', tone: 'warning' },
  disetujui: { label: 'Disetujui', tone: 'success' },
  batal: { label: 'Batal', tone: 'neutral' },
};

export type LineKind =
  | 'cocok'
  | 'hilang'
  | 'pindah'
  | 'belum_di_rak'
  | 'ganda'
  | 'jenis_salah'
  | 'keluar'
  | 'tidak_berlaku';

/** Review tabs, in the order a supervisor should look at them. */
export const LINE_KIND: Record<LineKind, { label: string; hint: string; tone: 'success' | 'danger' | 'info' | 'warning' | 'neutral' }> = {
  ganda: { label: 'Ganda', hint: 'Discan di lebih dari satu rak. Hapus scan yang salah sebelum menyetujui.', tone: 'danger' },
  hilang: { label: 'Hilang', hint: 'Di sistem ada di rak ini, tidak ditemukan. Keluar lewat dokumen penyesuaian saat disetujui.', tone: 'danger' },
  pindah: { label: 'Salah rak', hint: 'Ditemukan di rak ini, di sistem di rak lain. Dipindah ke rak ini saat disetujui.', tone: 'info' },
  belum_di_rak: { label: 'Belum di rak', hint: 'Di sistem belum di rak mana pun. Dimasukkan ke rak ini saat disetujui.', tone: 'info' },
  jenis_salah: { label: 'Jenis rak salah', hint: 'Barang reject atau rusak di rak stok, atau sebaliknya. Dikeluarkan dari rak untuk putaway ulang.', tone: 'warning' },
  keluar: { label: 'Sudah keluar', hint: 'Tercatat sudah keluar gudang tapi ada di rak. Cek, lalu catat retur kalau memang kembali.', tone: 'warning' },
  tidak_berlaku: { label: 'Label tidak berlaku', hint: 'Label pcs yang sudah dibatalkan. Buang labelnya.', tone: 'neutral' },
  cocok: { label: 'Cocok', hint: 'Ada di rak ini, di sistem juga di rak ini.', tone: 'success' },
};
export const LINE_ORDER = Object.keys(LINE_KIND) as LineKind[];

export function accuracy(matched: number, expected: number) {
  if (expected === 0) return '100%';
  return `${Math.round((matched / expected) * 1000) / 10}%`.replace('.', ',');
}

import type { Role } from '@/lib/supabase/server';

/**
 * Which bottom tab bar the scan app shows.
 *   produksi  Scan, Riwayat, Akun                     (penjahit, finishing, produksi)
 *   gudang    Masuk rak, Keluar, Retur, Opname, Akun  (gudang only)
 *   campuran  Scan, Gudang, Riwayat, Akun             (supervisor, admin: both);
 *             inside /scan/gudang it switches to Produksi + the four warehouse modes
 */
export type ScanNavKind = 'produksi' | 'gudang' | 'campuran';

export function isWarehouseOnly(roles: Role[]) {
  return roles.includes('gudang') && !roles.some((r) => r === 'penjahit' || r === 'finishing');
}

export function canWarehouse(roles: Role[]) {
  return roles.some((r) => r === 'gudang' || r === 'supervisor');
}

export function scanNavKind(roles: Role[]): ScanNavKind {
  if (isWarehouseOnly(roles)) return 'gudang';
  return canWarehouse(roles) ? 'campuran' : 'produksi';
}

const ROLE_CHIP: Partial<Record<Role, string>> = {
  penjahit: 'Jahit',
  finishing: 'Finishing',
  gudang: 'Gudang',
  supervisor: 'Supervisor',
  produksi: 'Produksi',
  admin: 'Admin',
};

/** Short context for the header chip: the floor role, plus the team when there is one. */
export function roleChip(roles: Role[], holderName: string | null) {
  const order: Role[] = ['penjahit', 'finishing', 'gudang', 'supervisor', 'produksi', 'admin'];
  const role = order.find((r) => roles.includes(r));
  const label = role ? ROLE_CHIP[role] : null;
  return [label, holderName].filter(Boolean).join(' · ') || null;
}

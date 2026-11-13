const FLOOR_ROLES = ['penjahit', 'finishing', 'gudang'];

/** Where a signed-in user starts: floor staff on the scanner, everyone else at Lacak (search over production and stock). */
export function homePath(roles: string[]) {
  const floorOnly = roles.length > 0 && roles.every((r) => FLOOR_ROLES.includes(r));
  return floorOnly ? '/scan' : '/lacak';
}

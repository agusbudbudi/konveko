import { redirect } from 'next/navigation';

/** GET target of the "Lacak pcs" form: /pcs?code=P-0000123 -> /pcs/P-0000123 */
export default async function PieceSearch({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const code = ((await searchParams).code ?? '').trim().toUpperCase().slice(0, 64);
  redirect(code ? `/pcs/${encodeURIComponent(code)}` : '/stok');
}

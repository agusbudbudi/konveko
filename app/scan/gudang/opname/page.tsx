import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { UUID } from '@/lib/master';
import { createClient, getCurrentAppUser } from '@/lib/supabase/server';
import { ModeTabs } from '../mode-tabs';
import { CountScan, type OpenCount, type UnlabeledLine } from './count-scan';

export const metadata: Metadata = { title: 'Scan stok opname' };

/**
 * Fase 2c: count racks of an open stock count on the phone. Blind: only what was scanned
 * on the rack is shown, never what the system expects there.
 *   ?count=<id>            pick a rack of that count
 *   ?count=<id>&rak=<code> count that rack
 */
export default async function CountScanPage({ searchParams }: { searchParams: Promise<{ count?: string; rak?: string }> }) {
  const user = await getCurrentAppUser();
  if (!user) redirect('/login?next=/scan/gudang/opname');
  const canWork = user.roles.some((r) => r === 'gudang' || r === 'supervisor');
  const { count, rak } = await searchParams;

  const supabase = await createClient();
  const { data } = await supabase
    .from('stock_count')
    .select('id, code, note, created_at, racks:stock_count_location(status, location:location(code, kind, qr_token))')
    .eq('status', 'menghitung')
    .order('created_at', { ascending: false })
    .limit(20);
  const counts = ((data ?? []) as unknown as {
    id: string;
    code: string;
    note: string | null;
    created_at: string;
    racks: { status: 'menghitung' | 'ditutup'; location: { code: string; kind: 'stok' | 'reject'; qr_token: string } | null }[];
  }[]).map<OpenCount>((c) => ({
    id: c.id,
    code: c.code,
    note: c.note,
    racks: c.racks
      .filter((r) => r.location)
      .map((r) => ({ code: r.location!.code, kind: r.location!.kind, token: r.location!.qr_token, status: r.status }))
      .sort((a, b) => a.code.localeCompare(b.code)),
  }));

  const selected = count && UUID.test(count) ? counts.find((c) => c.id === count) ?? null : null;
  const rack = selected && rak ? selected.racks.find((r) => r.code === rak.toUpperCase()) ?? null : null;

  // what this rack has so far (the counter's own scans only)
  let tally = { pieces: 0, unlabeled: 0, last: [] as string[] };
  let lines: UnlabeledLine[] = [];
  let variants: { id: string; label: string; sku: string }[] = [];
  if (selected && rack) {
    const { data: loc } = await supabase.from('location').select('id').eq('code', rack.code).maybeSingle();
    const [{ data: scans }, { data: vs }] = await Promise.all([
      supabase
        .from('stock_count_scan')
        .select('qty, condition, variant_id, scanned_at, piece:piece(code)')
        .eq('count_id', selected.id)
        .eq('location_id', loc?.id ?? selected.id)
        .order('scanned_at', { ascending: false }),
      supabase.from('product_variant').select('id, sku, product_name, size, color').eq('is_active', true).order('sku'),
    ]);
    const rows = (scans ?? []) as unknown as {
      qty: number | null;
      condition: 'baik' | 'rusak' | null;
      variant_id: string | null;
      piece: { code: string } | null;
    }[];
    variants = (vs ?? []).map((v) => ({ id: v.id, sku: v.sku, label: `${v.product_name} ${v.size} · ${v.color}` }));
    const byId = new Map(variants.map((v) => [v.id, v]));
    const piecesScanned = rows.filter((r) => r.piece);
    tally = {
      pieces: piecesScanned.length,
      unlabeled: rows.reduce((n, r) => n + (r.qty ?? 0), 0),
      last: piecesScanned.slice(0, 5).map((r) => r.piece!.code),
    };
    lines = rows
      .filter((r) => !r.piece && r.variant_id)
      .map((r) => ({ variantId: r.variant_id!, label: byId.get(r.variant_id!)?.label ?? '-', qty: r.qty ?? 0 }));
  }

  return (
    <>
      <ModeTabs active="opname" roles={user.roles} />
      <CountScan
        key={`${selected?.id ?? 'pick'}:${rack?.code ?? ''}`}
        canWork={canWork}
        counts={counts}
        selected={selected}
        rack={rack}
        initialTally={tally}
        lines={lines}
        variants={variants}
      />
    </>
  );
}

import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import QRCode from 'qrcode';
import { LabelMark } from '@/components/brand/label-mark';
import { code128Svg } from '@/lib/code128';
import { UUID } from '@/lib/master';
import { createClient, getCurrentAppUser } from '@/lib/supabase/server';
import { PiecePrintBar } from './piece-print-bar';
import './pieces.css';

export const metadata: Metadata = { title: 'Cetak label pcs' };

type PieceRow = {
  id: string;
  code: string;
  qr_token: string;
  grade: 'baik' | 'reject';
  finish_movement_id: string;
  variant: { sku: string; product_name: string; size: string; color: string } | null;
};

const MAX = 500;

/**
 * Piece labels (Fase 2a). QR = piece.qr_token for tracking; Code128 = SKU for
 * any POS or marketplace. Reject pieces get a black REJECT band instead of
 * the SKU barcode so they cannot be sold by mistake.
 *
 *   ?pending=1               every label not printed yet
 *   ?bundle=<id>             not printed yet in one bundle
 *   ?bundle=<id>&all=1       reprint every active piece of a bundle
 *   ?piece=<id>              reprint one piece
 */
export default async function PrintPiecesPage({
  searchParams,
}: {
  searchParams: Promise<{ pending?: string; bundle?: string; all?: string; piece?: string }>;
}) {
  const user = await getCurrentAppUser();
  if (!user) redirect('/login');
  const { pending, bundle, all, piece } = await searchParams;

  const supabase = await createClient();
  let q = supabase
    .from('piece')
    .select('id, code, qr_token, grade, finish_movement_id, variant:product_variant(sku, product_name, size, color)')
    .eq('status', 'aktif')
    .order('code')
    .limit(MAX);
  if (piece && UUID.test(piece)) q = q.eq('id', piece);
  else if (bundle && UUID.test(bundle)) {
    q = q.eq('bundle_id', bundle);
    if (all !== '1') q = q.is('printed_at', null);
  } else if (pending === '1') q = q.is('printed_at', null);
  else notFound();

  const { data } = await q;
  const pieces = (data ?? []) as unknown as PieceRow[];

  // Reject reason comes from the (corrected) finishing or sewing scan.
  const rejectMovements = [...new Set(pieces.filter((p) => p.grade === 'reject').map((p) => p.finish_movement_id))];
  const reasonOf = new Map<string, string>();
  if (rejectMovements.length) {
    // reason_id in the view is computed (CASE), so PostgREST cannot embed it
    const { data: em } = await supabase.from('effective_movement').select('id, type, reason_id').in('id', rejectMovements);
    const reasonIds = [...new Set((em ?? []).map((m) => m.reason_id).filter(Boolean))];
    const { data: rs } = reasonIds.length
      ? await supabase.from('reason').select('id, label').in('id', reasonIds)
      : { data: [] as { id: string; label: string }[] };
    const label = new Map((rs ?? []).map((r) => [r.id, r.label]));
    for (const m of em ?? []) {
      const why = m.reason_id ? label.get(m.reason_id) : null;
      reasonOf.set(m.id, `${m.type === 'finish_sew' ? 'Jahit' : 'QC'}${why ? ` · ${why}` : ''}`);
    }
  }

  const labels = await Promise.all(
    pieces.map(async (p) => ({
      ...p,
      qrSvg: await QRCode.toString(p.qr_token, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } }),
      barSvg: p.grade === 'baik' && p.variant ? code128Svg(p.variant.sku) : null,
    })),
  );

  const canMark = user.roles.some((r) => r === 'finishing' || r === 'supervisor' || r === 'admin');

  return (
    <div className="print-root">
      {labels.length === 0 ? (
        <div className="print-bar">
          <p className="text-text-muted">Tidak ada label yang perlu dicetak.</p>
        </div>
      ) : (
        <PiecePrintBar ids={labels.map((l) => l.id)} canMark={canMark} />
      )}
      <div className="label-sheet">
        {labels.map((l) => (
          <article key={l.id} className="pl">
            <div className="pl-top">
              <div className="pl-qr" dangerouslySetInnerHTML={{ __html: l.qrSvg }} />
              <div className="pl-text">
                <p className="pl-brand">
                  <LabelMark /> konveko
                </p>
                <p className="pl-name">{l.variant?.product_name}</p>
                <p>
                  {l.variant?.size} · {l.variant?.color}
                </p>
                <p className="pl-serial">{l.code}</p>
              </div>
            </div>
            {l.barSvg ? (
              <div>
                <div className="pl-bar" dangerouslySetInnerHTML={{ __html: l.barSvg }} />
                <p className="pl-sku">{l.variant?.sku}</p>
              </div>
            ) : (
              // the reason can be long ("Jahit · Jahitan rusak atau longgar"): it gets its own
              // column and may wrap to two lines instead of being cut off
              <div className="pl-reject">
                <span className="pl-reject-tag">REJECT</span>
                <span className="pl-reject-why">{reasonOf.get(l.finish_movement_id) ?? '-'}</span>
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}

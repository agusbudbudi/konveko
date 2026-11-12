import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import QRCode from 'qrcode';
import { createClient, getCurrentAppUser } from '@/lib/supabase/server';
import { PrintBar } from './print-bar';
import './labels.css';

export const metadata: Metadata = { title: 'Cetak label' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type LabelBundle = {
  id: string;
  code: string;
  qr_token: string;
  target_qty: number;
  current_status: string;
  batch: { code: string } | null;
  /** Set on a rework bundle: the bundle its pcs came from. */
  origin: { code: string } | null;
  variant: { product_name: string; size: string; color: string } | null;
};

// DESIGN §7 / FR-08, FR-09: 50 × 30 mm, black only, QR holds qr_token.
// Reprinting uses the same token, so no new bundle is created.
export default async function PrintLabelsPage({
  searchParams,
}: {
  searchParams: Promise<{ batch?: string; bundle?: string }>;
}) {
  const user = await getCurrentAppUser();
  if (!user) redirect('/login');
  const { batch, bundle } = await searchParams;
  if (!(batch && UUID.test(batch)) && !(bundle && UUID.test(bundle))) notFound();

  const supabase = await createClient();
  let query = supabase
    .from('bundle')
    .select(
      'id, code, qr_token, target_qty, current_status, batch:production_batch(code), origin:bundle!rework_of_bundle_id(code), variant:product_variant(product_name, size, color)',
    )
    .not('current_status', 'in', '(dipecah,batal)')
    .order('code');
  query = batch ? query.eq('batch_id', batch) : query.eq('id', bundle!);
  const { data } = await query;
  const bundles = (data ?? []) as unknown as LabelBundle[];
  if (bundles.length === 0) notFound();

  const labels = await Promise.all(
    bundles.map(async (b) => ({
      ...b,
      qrSvg: await QRCode.toString(b.qr_token, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } }),
    })),
  );

  return (
    <div className="print-root">
      <PrintBar count={labels.length} />
      <div className="label-sheet">
        {labels.map((l) => (
          <article key={l.id} className="label">
            <div className="label-qr" dangerouslySetInnerHTML={{ __html: l.qrSvg }} />
            <div className="label-text">
              <p className="label-code">{l.code}</p>
              {l.origin ? (
                <p className="label-batch label-rework">REWORK · {l.origin.code}</p>
              ) : (
                <p className="label-batch">{l.batch?.code}</p>
              )}
              <p className="label-variant">
                {l.variant?.product_name} {l.variant?.size}
              </p>
              <p className="label-color">{l.variant?.color}</p>
              <p className="label-qty">{l.target_qty} pcs</p>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

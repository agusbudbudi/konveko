import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import QRCode from 'qrcode';
import { LabelMark } from '@/components/brand/label-mark';
import { createClient, getCurrentAppUser } from '@/lib/supabase/server';
import { PrintBar } from '../labels/print-bar';
import './racks.css';

export const metadata: Metadata = { title: 'Cetak label rak' };

// One label per active rack. The QR holds location.qr_token; the big code
// is what people read from a distance and what they type when the QR is damaged.
export default async function PrintRacksPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const user = await getCurrentAppUser();
  if (!user) redirect('/login');
  const { code } = await searchParams;

  const supabase = await createClient();
  let query = supabase.from('location').select('id, code, kind, note, qr_token').eq('is_active', true).order('code');
  if (code) query = query.eq('code', code.toUpperCase().slice(0, 8));
  const { data } = await query;

  const labels = await Promise.all(
    (data ?? []).map(async (l) => ({
      ...l,
      qrSvg: await QRCode.toString(l.qr_token, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } }),
    })),
  );

  return (
    <div className="print-root">
      <PrintBar
        count={labels.length}
        size="95 × 66 mm"
        hint="Cetak di printer biasa, kertas A4, skala 100%: 8 label per lembar (2 kolom). Gunting di garis putus-putus lalu tempel di tiang rak."
      />
      <div className="rack-sheet">
        {labels.map((l) => (
          <article key={l.id} className="rack-label">
            <div className="rack-qr" dangerouslySetInnerHTML={{ __html: l.qrSvg }} />
            <div>
              <p className="rack-brand">
                <LabelMark /> konveko
              </p>
              <p className="rack-caption">Rak</p>
              <p className="rack-code">{l.code}</p>
              <span className={l.kind === 'reject' ? 'rack-kind reject' : 'rack-kind'}>
                {l.kind === 'reject' ? 'Barang reject' : 'Barang jadi'}
              </span>
              {l.note && <p className="rack-note">{l.note}</p>}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

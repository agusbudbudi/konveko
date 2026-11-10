import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { loadBusinessProfile } from '@/lib/business';
import { UUID } from '@/lib/master';
import { OUTBOUND_TYPE, type OutboundType } from '@/lib/outbound';
import { createClient, getCurrentAppUser } from '@/lib/supabase/server';
import { PrintControls } from '../print-controls';
import '../surat-jalan.css';

export const metadata: Metadata = { title: 'Cetak surat jalan' };

const dateFmt = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' });

type Line = { piece: { code: string; variant: { sku: string; product_name: string; size: string; color: string } | null } | null };

/**
 * Surat jalan for a shipped outbound document. Header from the business profile
 * (falls back to Konveko); lines per variant; optional serial list.
 */
export default async function SuratJalanPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ serial?: string }>;
}) {
  const user = await getCurrentAppUser();
  if (!user) redirect('/login');
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const withSerials = (await searchParams).serial === '1';

  const supabase = await createClient();
  const { data: doc } = await supabase
    .from('outbound')
    .select('id, code, type, destination, ref_no, note, status, shipped_at, shipped_by')
    .eq('id', id)
    .maybeSingle();
  if (!doc || doc.status !== 'dikirim') notFound();

  const [profile, { data: itemData }, { data: names }] = await Promise.all([
    loadBusinessProfile(),
    // items as shipped, including pieces returned later: the paper matches what left
    supabase.from('outbound_item').select('piece:piece(code, variant:product_variant(sku, product_name, size, color))').eq('outbound_id', id),
    supabase.rpc('staff_names', { p_ids: [doc.shipped_by].filter(Boolean) }),
  ]);
  const items = (itemData ?? []) as unknown as Line[];
  const byVariant = new Map<string, { sku: string; label: string; qty: number; codes: string[] }>();
  for (const i of items) {
    const v = i.piece?.variant;
    if (!v || !i.piece) continue;
    const e = byVariant.get(v.sku) ?? { sku: v.sku, label: `${v.product_name} ${v.size} · ${v.color}`, qty: 0, codes: [] };
    e.qty += 1;
    e.codes.push(i.piece.code);
    byVariant.set(v.sku, e);
  }
  const lines = [...byVariant.values()].sort((a, b) => a.label.localeCompare(b.label, 'id'));
  const total = lines.reduce((n, l) => n + l.qty, 0);
  const shipper = ((names ?? []) as { name: string }[])[0]?.name ?? '';
  const profileMissing = !profile.name;
  const type = doc.type as OutboundType;

  return (
    <div className="print-root">
      <PrintControls profileMissing={profileMissing} />
      <div className="sj-sheet">
        <article className="sj">
          <header className="sj-head">
            {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URL or static logo */}
            <img className="sj-logo" src={profile.logoUrl ?? '/logo-konveko-mark.png'} alt="" />
            <div className="sj-company">
              <p className="sj-company-name">{profile.name ?? 'Konveko'}</p>
              {profile.address && <p className="sj-company-line">{profile.address}</p>}
              {(profile.phone || profile.email) && <p>{[profile.phone, profile.email].filter(Boolean).join(' · ')}</p>}
            </div>
            <div className="sj-title">
              <p className="sj-title-text">Surat jalan</p>
              <p className="sj-mono">{doc.code}</p>
              <p>{dateFmt.format(new Date(doc.shipped_at!))}</p>
            </div>
          </header>

          <section className="sj-meta">
            <div>
              <p className="sj-label">{type === 'penyesuaian' ? 'Keterangan' : 'Kepada'}</p>
              <p>
                <b>{doc.destination}</b>
              </p>
            </div>
            <div>
              <p className="sj-label">Jenis</p>
              <p>{OUTBOUND_TYPE[type].label}</p>
            </div>
            {doc.ref_no && (
              <div>
                <p className="sj-label">No. referensi</p>
                <p className="sj-mono">{doc.ref_no}</p>
              </div>
            )}
          </section>

          <table className="sj-table">
            <thead>
              <tr>
                <th style={{ width: '8mm' }}>No</th>
                <th>Barang</th>
                <th>SKU</th>
                <th className="num-col">Jumlah</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={l.sku}>
                  <td className="sj-mono">{i + 1}</td>
                  <td>{l.label}</td>
                  <td className="sj-mono">{l.sku}</td>
                  <td className="num-col sj-mono">{l.qty} pcs</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3}>Total</td>
                <td className="num-col sj-mono">{total} pcs</td>
              </tr>
            </tfoot>
          </table>

          {doc.note && (
            <p className="sj-note">
              {type === 'penyesuaian' ? 'Alasan' : 'Catatan'}: {doc.note}
            </p>
          )}

          <section className="sj-sign">
            <div>
              <p>Pengirim</p>
              <p className="sj-sign-line">{shipper}</p>
            </div>
            <div>
              <p>Penerima</p>
              <p className="sj-sign-line">&nbsp;</p>
            </div>
          </section>

          {withSerials && (
            <section className="sj-serials">
              {lines.flatMap((l) => l.codes.sort().map((c) => <p key={c} className="sj-mono">{c}</p>))}
            </section>
          )}

          <p className="sj-foot">Dicetak dari Konveko. Barang yang kembali dicatat sebagai retur.</p>
        </article>
      </div>
    </div>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { Printer } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/status-badge';
import { createClient } from '@/lib/supabase/server';
import { SetCrumb } from '@/components/nav/sidebar-nav';
import { PageHeader } from '@/components/ui/page-header';

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  return { title: `Pcs ${decodeURIComponent((await params).code).toUpperCase()}` };
}

type Piece = {
  id: string;
  code: string;
  grade: 'baik' | 'reject';
  status: 'aktif' | 'batal' | 'keluar';
  condition: 'baik' | 'rusak';
  outbound: { id: string; code: string; destination: string } | null;
  printed_at: string | null;
  print_count: number;
  created_at: string;
  bundle_id: string;
  finish_movement_id: string;
  variant: { sku: string; product_name: string; size: string; color: string } | null;
  bundle: { code: string } | null;
  batch: { id: string; code: string; roll: { code: string; material: string; color: string } | null } | null;
  location: { code: string } | null;
};

type Event = {
  id: string;
  type: 'dibuat' | 'cetak' | 'masuk_rak' | 'pindah_rak' | 'keluar_rak' | 'batal' | 'dipesan' | 'lepas_pesan' | 'keluar' | 'retur';
  doc: { id: string; code: string } | null;
  note: string | null;
  created_by: string;
  created_at: string;
  from: { code: string } | null;
  to: { code: string } | null;
};

const EVENT_LABEL: Record<Event['type'], string> = {
  dibuat: 'Dibuat dari scan selesai',
  cetak: 'Label dicetak',
  masuk_rak: 'Masuk rak',
  pindah_rak: 'Pindah rak',
  keluar_rak: 'Keluar dari rak',
  batal: 'Dibatalkan',
  dipesan: 'Masuk dokumen',
  lepas_pesan: 'Dilepas dari dokumen',
  keluar: 'Keluar gudang',
  retur: 'Retur',
};

const when = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' });

export default async function PiecePage({ params }: { params: Promise<{ code: string }> }) {
  const raw = decodeURIComponent((await params).code).trim().slice(0, 64);
  const supabase = await createClient();
  const select =
    'id, code, grade, status, condition, printed_at, print_count, created_at, bundle_id, finish_movement_id, ' +
    'outbound:outbound!piece_outbound_id_fkey(id, code, destination), ' +
    'variant:product_variant(sku, product_name, size, color), bundle:bundle(code), ' +
    'batch:production_batch(id, code, roll:fabric_roll(code, material, color)), location:location(code)';
  const byToken = /^[0-9a-f]{32}$/.test(raw);
  const { data } = await supabase
    .from('piece')
    .select(select)
    .eq(byToken ? 'qr_token' : 'code', byToken ? raw : raw.toUpperCase())
    .maybeSingle();
  if (!data) {
    return (
      <div className="mx-auto mt-16 max-w-3xl">
        <EmptyState
          variant="search"
          hint="Periksa kembali kodenya, atau cari lewat Lacak."
          action={
            <Link href="/stok/pcs" className="font-medium text-primary underline">
              Kembali ke stok per pcs
            </Link>
          }
        >
          Pcs <span className="num">{raw.toUpperCase()}</span> tidak ditemukan.
        </EmptyState>
      </div>
    );
  }
  const p = data as unknown as Piece;

  const [{ data: moves }, { data: evs }] = await Promise.all([
    supabase
      .from('effective_movement')
      .select('id, type, to_holder_id, reason_id, scanned_at')
      .eq('bundle_id', p.bundle_id)
      .in('type', ['receive_sew', 'receive_finishing', 'finish_sew', 'finish_finishing']),
    supabase
      .from('piece_event')
      .select('id, type, note, created_by, created_at, from:location!piece_event_from_location_id_fkey(code), to:location!piece_event_to_location_id_fkey(code), doc:outbound(id, code)')
      .eq('piece_id', p.id)
      .order('seq', { ascending: false }),
  ]);
  const events = (evs ?? []) as unknown as Event[];

  const holderIds = [...new Set((moves ?? []).map((m) => m.to_holder_id).filter(Boolean))];
  const reasonId = (moves ?? []).find((m) => m.id === p.finish_movement_id)?.reason_id;
  const staffIds = [...new Set(events.map((e) => e.created_by))];
  const [{ data: holders }, { data: reason }, { data: staff }] = await Promise.all([
    holderIds.length ? supabase.from('holder').select('id, name').in('id', holderIds) : Promise.resolve({ data: [] }),
    reasonId ? supabase.from('reason').select('label').eq('id', reasonId).maybeSingle() : Promise.resolve({ data: null }),
    supabase.rpc('staff_names', { p_ids: staffIds }),
  ]);
  const holderName = new Map((holders ?? []).map((h: { id: string; name: string }) => [h.id, h.name]));
  const staffName = new Map(((staff ?? []) as { id: string; name: string }[]).map((s) => [s.id, s.name]));
  const holderOf = (type: string) => {
    const m = (moves ?? []).find((x) => x.type === type);
    return m?.to_holder_id ? holderName.get(m.to_holder_id) ?? '-' : '-';
  };
  const v = p.variant;

  return (
    <>
      <SetCrumb
        root
        items={[{ label: 'Gudang' }, { label: 'Stok', href: '/stok' }, { label: 'Per pcs', href: '/stok/pcs' }, { label: p.code }]}
      />
      <Link href="/stok" className="text-small text-text-muted hover:text-text lg:hidden">
        Stok
      </Link>
      <PageHeader
        title={<span className="num">{p.code}</span>}
        badges={
          <>
            <Badge tone={p.grade === 'reject' ? 'danger' : 'success'}>{p.grade === 'reject' ? 'Reject' : 'Baik'}</Badge>
            {p.condition === 'rusak' && <Badge tone="danger">Rusak (retur)</Badge>}
            {p.status === 'batal' && <Badge tone="neutral">Dibatalkan</Badge>}
            {p.status === 'keluar' && <Badge tone="info">Keluar</Badge>}
          </>
        }
        description={
          <>
            {v?.product_name} {v?.size} · {v?.color} · <span className="num">{v?.sku}</span>
          </>
        }
        actions={
          p.status === 'aktif' && (
            <Link
              href={`/print/pieces?piece=${p.id}`}
              className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-surface px-4 font-medium hover:border-border-strong"
            >
              <Printer size={16} strokeWidth={1.5} aria-hidden /> Cetak ulang label
            </Link>
          )
        }
      />

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="rounded-lg border border-border bg-surface">
          <h2 className="px-5 py-3 text-h3">Asal</h2>
          <dl className="divide-y divide-border border-t border-border">
            <Row label="Lokasi sekarang">
              {p.location ? (
                <Link href={`/stok/rak/${p.location.code}`} className="num link-code">
                  Rak {p.location.code}
                </Link>
              ) : p.status === 'keluar' && p.outbound ? (
                <>
                  Keluar di{' '}
                  <Link href={`/barang-keluar/${p.outbound.id}`} className="num link-code">
                    {p.outbound.code}
                  </Link>{' '}
                  · {p.outbound.destination}
                </>
              ) : p.status === 'batal' ? (
                '-'
              ) : (
                <span className="text-warning">Belum di rak</span>
              )}
            </Row>
            <Row label="Rol kain">
              {p.batch?.roll ? (
                <>
                  <span className="num">{p.batch.roll.code}</span> · {p.batch.roll.material} {p.batch.roll.color}
                </>
              ) : (
                '-'
              )}
            </Row>
            <Row label="Batch">
              {p.batch ? (
                <Link href={`/batch/${p.batch.id}`} className="num link-code">
                  {p.batch.code}
                </Link>
              ) : (
                '-'
              )}
            </Row>
            <Row label="Bundle">
              <Link href={`/bundle/${p.bundle_id}`} className="num link-code">
                {p.bundle?.code}
              </Link>
            </Row>
            <Row label="Penjahit">{holderOf('receive_sew')}</Row>
            <Row label="Finishing">{holderOf('receive_finishing')}</Row>
            {p.grade === 'reject' && (
              <Row label="Reject di">
                {(moves ?? []).find((m) => m.id === p.finish_movement_id)?.type === 'finish_sew' ? 'Jahit' : 'QC finishing'}
                {reason ? ` · ${reason.label}` : ''}
              </Row>
            )}
            <Row label="Label">
              {p.printed_at ? `Dicetak ${p.print_count}×` : <span className="text-warning">Belum dicetak</span>}
            </Row>
          </dl>
        </section>

        <section className="rounded-lg border border-border bg-surface">
          <h2 className="px-5 py-3 text-h3">Riwayat</h2>
          <ol className="border-t border-border px-5 py-4">
            {events.map((e, i) => (
              <li key={e.id} className="relative flex gap-3 pb-4 last:pb-0">
                {i < events.length - 1 && <span aria-hidden className="absolute top-3 left-[5px] h-full w-px bg-border" />}
                <span aria-hidden className={`relative mt-1.5 size-[11px] shrink-0 rounded-full border-2 ${i === 0 ? 'border-primary bg-primary' : 'border-border-strong bg-surface'}`} />
                <div className="min-w-0">
                  <p className="font-medium">
                    {EVENT_LABEL[e.type]}
                    {e.type === 'masuk_rak' && e.to && <span className="num"> {e.to.code}</span>}
                    {e.type === 'pindah_rak' && (
                      <span className="num">
                        {' '}
                        {e.from?.code} → {e.to?.code}
                      </span>
                    )}
                    {e.type === 'keluar_rak' && e.from && <span className="num"> {e.from.code}</span>}
                    {e.doc && ['dipesan', 'lepas_pesan', 'keluar', 'retur'].includes(e.type) && (
                      <>
                        {' '}
                        <Link href={`/barang-keluar/${e.doc.id}`} className="num link-code">
                          {e.doc.code}
                        </Link>
                      </>
                    )}
                  </p>
                  <p className="text-small text-text-muted">
                    {when.format(new Date(e.created_at))} · {staffName.get(e.created_by) ?? '-'}
                    {e.note ? ` · ${e.note}` : ''}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[130px_1fr] gap-4 px-5 py-2.5">
      <dt className="text-small text-text-muted">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

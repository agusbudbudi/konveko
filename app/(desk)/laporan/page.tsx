import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AlertTriangle, ArrowDown, ArrowUp, CircleCheck, Download, Info, CircleX, Minus } from 'lucide-react';
import { InlineAlert } from '@/components/ui/inline-alert';
import { callRpc } from '@/lib/rpc';
import {
  buckets,
  buildInsights,
  change,
  duration,
  hours,
  finished,
  n1,
  pct,
  rejectRate,
  resolvePeriod,
  todayJakarta,
  type CsvTable,
  type Insight,
  type OutboundReport,
  type Period,
  type Report,
} from '@/lib/report';
import { getCurrentAppUser } from '@/lib/supabase/server';
import { PeriodPicker } from './period-picker';
import { TrendChart } from './trend-chart';
import { MeterBar } from '@/components/ui/meter-bar';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';

export const metadata: Metadata = { title: 'Laporan' };

type Params = { mode?: string; date?: string; from?: string; to?: string };

export default async function ReportPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await getCurrentAppUser();
  if (!user) redirect('/login');
  const period = resolvePeriod(await searchParams);

  const [cur, prev, out, outPrev] = await Promise.all([
    callRpc<Report>('production_report', { p_from: period.from, p_to: period.to }),
    callRpc<Report>('production_report', { p_from: period.prevFrom, p_to: period.prevTo }),
    callRpc<OutboundReport>('outbound_report', { p_from: period.from, p_to: period.to }),
    callRpc<OutboundReport>('outbound_report', { p_from: period.prevFrom, p_to: period.prevTo }),
  ]);

  return (
    <>
      <PageHeader
        title="Laporan"
        description={
          <>
            {period.label} <span className="text-text-subtle">· dibanding {period.prevLabel}</span>
          </>
        }
        actions={<PeriodPicker period={period} today={todayJakarta()} />}
      />

      {!cur.ok || !prev.ok ? (
        <InlineAlert tone="danger" className="mt-6">
          {!cur.ok ? cur.message : !prev.ok ? prev.message : ''}
        </InlineAlert>
      ) : (
        <ReportBody
          r={cur.data}
          prev={prev.data}
          period={period}
          out={out.ok ? out.data : null}
          outPrev={outPrev.ok ? outPrev.data : null}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------

function ReportBody({
  r,
  prev,
  period,
  out,
  outPrev,
}: {
  r: Report;
  prev: Report;
  period: Period;
  out: OutboundReport | null;
  outPrev: OutboundReport | null;
}) {
  const t = r.totals;
  const p = prev.totals;
  const reject = t.sew_reject + t.qc_reject;
  const insights = buildInsights(r, prev);
  const chart = buckets(r);
  const csv = (table: CsvTable) => `/laporan/export?from=${period.from}&to=${period.to}&table=${table}`;
  const maxReason = Math.max(1, ...r.reject_reasons.map((x) => x.qty), ...r.selisih_reasons.map((x) => x.qty));

  return (
    <>
      <section className="mt-6 rounded-lg border border-border bg-surface p-4 lg:p-5">
        <h2 className="text-h3">Ringkasan</h2>
        <ul className="mt-3 grid gap-x-8 gap-y-2.5 lg:grid-cols-2">
          {insights.map((i) => (
            <InsightRow key={i.text} insight={i} />
          ))}
        </ul>
      </section>

      <section className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Dipotong" value={t.cut} unit="pcs" context={`${t.batches} batch baru`} delta={change(t.cut, p.cut)} />
        <Stat label="Lolos QC" value={t.ready} unit="pcs" context={`dari ${t.qc_in} pcs masuk QC`} delta={change(t.ready, p.ready)} />
        <Stat
          label="Reject"
          value={`${n1(rejectRate(t))}%`}
          context={`${reject} pcs · jahit ${t.sew_reject}, QC ${t.qc_reject}`}
          delta={finished(p) > 0 && finished(t) > 0 ? rejectRate(t) - rejectRate(p) : null}
          deltaUnit="poin"
          higherIsWorse
        />
        <Stat
          label="Selisih"
          value={t.selisih}
          unit="pcs"
          warn={t.selisih > 0}
          context={t.flags_open > 0 ? `${t.flags_open} flag masih terbuka` : `${t.selisih_events} kejadian`}
          delta={change(t.selisih, p.selisih)}
          higherIsWorse
        />
        <Stat label="Masuk rak" value={t.shelved} unit="pcs" context="pcs baik discan gudang" delta={change(t.shelved, p.shelved)} />
        <Stat
          label="Waktu produksi"
          value={r.lead_time.median_days === null ? '-' : duration(r.lead_time.median_days).split(' ')[0]}
          unit={r.lead_time.median_days === null ? undefined : duration(r.lead_time.median_days).split(' ')[1]}
          context={r.lead_time.bundles > 0 ? `median, ${r.lead_time.bundles} bundle selesai` : 'belum ada bundle selesai'}
          delta={
            r.lead_time.median_days !== null && prev.lead_time.median_days !== null
              ? change(r.lead_time.median_days, prev.lead_time.median_days)
              : null
          }
          higherIsWorse
        />
      </section>

      <section className="mt-4 rounded-lg border border-border bg-surface p-4 lg:p-5">
        <SectionHead title="Tren lolos QC dan reject" csv={csv('harian')} />
        <div className="mt-4">
          <TrendChart data={chart} weekly={r.days > 62} />
        </div>
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section className="overflow-hidden rounded-lg border border-border bg-surface">
          <div className="p-4 lg:px-5">
            <SectionHead title="Per penjahit" csv={csv('penjahit')} />
          </div>
          {r.tailors.length === 0 ? (
            <div className="border-t border-border"><EmptyState variant="document" compact>Belum ada scan selesai jahit.</EmptyState></div>
          ) : (
            <div className="overflow-x-auto border-t border-border">
              <table className="w-full text-left">
                <thead className="bg-surface-muted text-caption tracking-[0.02em] text-text-muted">
                  <tr>
                    <th className="px-5 py-2 font-medium">Penjahit</th>
                    <th className="px-3 py-2 text-right font-medium">Bundle</th>
                    <th className="px-3 py-2 text-right font-medium">Diterima</th>
                    <th className="px-3 py-2 text-right font-medium">Jadi</th>
                    <th className="px-3 py-2 text-right font-medium">Reject</th>
                    <th className="px-5 py-2 text-right font-medium">Waktu per bundle</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {r.tailors.map((x) => {
                    const rate = pct(x.reject, x.received);
                    return (
                      <tr key={x.holder_id}>
                        <td className="px-5 py-2.5 font-medium">{x.name}</td>
                        <td className="num px-3 py-2.5 text-right">{x.bundles}</td>
                        <td className="num px-3 py-2.5 text-right">{x.received}</td>
                        <td className="num px-3 py-2.5 text-right">{x.good}</td>
                        <td className="num px-3 py-2.5 text-right">
                          {x.reject}{' '}
                          <span className={rate >= 5 ? 'text-warning' : 'text-text-muted'}>({n1(rate)}%)</span>
                        </td>
                        <td className="num px-5 py-2.5 text-right text-text-muted">{x.avg_hours === null ? '-' : hours(x.avg_hours)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="rounded-lg border border-border bg-surface p-4 lg:p-5">
          <SectionHead title="Alasan" csv={csv('alasan')} />
          <ReasonBars
            title="Reject"
            color="bg-chart-reject"
            rows={r.reject_reasons.map((x) => ({ label: x.label, sub: x.stage === 'jahit' ? 'jahit' : 'QC', qty: x.qty }))}
            max={maxReason}
            empty="Tidak ada reject."
          />
          <ReasonBars
            title="Selisih"
            color="bg-warning"
            rows={r.selisih_reasons.map((x) => ({ label: x.label, sub: x.step, qty: x.qty }))}
            max={maxReason}
            empty="Tidak ada selisih."
          />
        </section>
      </div>

      <section className="mt-4 overflow-hidden rounded-lg border border-border bg-surface">
        <div className="p-4 lg:px-5">
          <SectionHead title="Per variant" csv={csv('variant')} />
        </div>
        {r.variants.length === 0 ? (
          <div className="border-t border-border"><EmptyState variant="document" compact>Belum ada data.</EmptyState></div>
        ) : (
          <div className="overflow-x-auto border-t border-border">
            <table className="w-full text-left">
              <thead className="bg-surface-muted text-caption tracking-[0.02em] text-text-muted">
                <tr>
                  <th className="px-5 py-2 font-medium">Variant</th>
                  <th className="px-3 py-2 text-right font-medium">Dipotong</th>
                  <th className="px-3 py-2 text-right font-medium">Lolos QC</th>
                  <th className="px-5 py-2 text-right font-medium">Reject</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {r.variants.map((v) => (
                  <tr key={v.variant_id}>
                    <td className="px-5 py-2.5">
                      <span className="font-medium">
                        {v.product_name} {v.size} · {v.color}
                      </span>{' '}
                      <span className="num text-small text-text-muted">{v.sku}</span>
                    </td>
                    <td className="num px-3 py-2.5 text-right">{v.cut}</td>
                    <td className="num px-3 py-2.5 text-right">{v.ready}</td>
                    <td className="num px-5 py-2.5 text-right">{v.reject}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {out && <OutboundSection o={out} prev={outPrev} csv={csv} />}

      <p className="mt-4 text-small text-text-subtle">
        Angka dihitung dari scan di periode ini (WIB), setelah koreksi supervisor. Scan yang dikoreksi tetap masuk ke tanggal scan
        aslinya.
      </p>
    </>
  );
}

const insightIcon = { success: CircleCheck, warning: AlertTriangle, danger: CircleX, info: Info };
const insightColor = { success: 'text-success', warning: 'text-warning', danger: 'text-danger', info: 'text-info' };

function InsightRow({ insight }: { insight: Insight }) {
  const Icon = insightIcon[insight.tone];
  return (
    <li className="flex gap-2.5">
      <Icon size={18} strokeWidth={1.5} aria-hidden className={`mt-0.5 shrink-0 ${insightColor[insight.tone]}`} />
      <span>{insight.text}</span>
    </li>
  );
}

function SectionHead({ title, csv }: { title: string; csv: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-h3">{title}</h2>
      <a
        href={csv}
        className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-small text-text-muted hover:bg-surface-muted hover:text-text"
      >
        <Download size={16} strokeWidth={1.5} aria-hidden /> CSV
      </a>
    </div>
  );
}

/** DESIGN §5.6 tile plus a delta against the previous period. */
function Stat({
  label,
  value,
  unit,
  context,
  delta,
  deltaUnit = '%',
  higherIsWorse,
  warn,
}: {
  label: string;
  value: number | string;
  unit?: string;
  context?: string;
  delta: number | null;
  deltaUnit?: '%' | 'poin';
  higherIsWorse?: boolean;
  warn?: boolean;
}) {
  let chip: React.ReactNode;
  if (delta === null) chip = <span className="text-text-subtle">tanpa pembanding</span>;
  else if (Math.abs(delta) < (deltaUnit === 'poin' ? 0.1 : 1)) {
    chip = (
      <span className="inline-flex items-center gap-0.5 text-text-muted">
        <Minus size={14} strokeWidth={1.5} aria-hidden /> sama
      </span>
    );
  } else {
    const up = delta > 0;
    const good = up !== Boolean(higherIsWorse);
    const Icon = up ? ArrowUp : ArrowDown;
    chip = (
      <span className={`inline-flex items-center gap-0.5 ${good ? 'text-success' : 'text-danger'}`}>
        <Icon size={14} strokeWidth={1.5} aria-hidden />
        <span className="num">
          {n1(Math.abs(delta))}
          {deltaUnit === '%' ? '%' : ' poin'}
        </span>
        <span className="sr-only">{good ? ', membaik' : ', memburuk'}</span>
      </span>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="text-caption tracking-[0.02em] text-text-muted">{label}</p>
      <p className="mt-1 flex items-baseline gap-1">
        <span className={`num text-display ${warn ? 'text-warning' : ''}`}>{value}</span>
        {unit && <span className="text-small text-text-muted">{unit}</span>}
      </p>
      <p className="mt-1 text-small">{chip}</p>
      {context && <p className="mt-0.5 text-small text-text-muted">{context}</p>}
    </div>
  );
}

function ReasonBars({
  title,
  color,
  rows,
  max,
  empty,
}: {
  title: string;
  color: string;
  rows: { label: string; sub: string; qty: number }[];
  max: number;
  empty: string;
}) {
  return (
    <div className="mt-4">
      <p className="text-caption tracking-[0.02em] text-text-muted">{title}</p>
      {rows.length === 0 ? (
        <EmptyState variant="check" compact>{empty}</EmptyState>
      ) : (
        <ul className="mt-2 flex flex-col gap-2.5">
          {rows.map((x) => (
            <li key={`${x.label}-${x.sub}`}>
              <div className="flex items-baseline justify-between gap-3 text-small">
                <span className="min-w-0 truncate">
                  {x.label} <span className="text-text-subtle">· {x.sub}</span>
                </span>
                <span className="num font-medium">{x.qty}</span>
              </div>
              <MeterBar
                share={x.qty / max}
                color={color}
                className="mt-1 h-1.5"
                tip={
                  <>
                    {x.label} · {x.sub} <span className="num font-medium">{x.qty}</span> pcs
                  </>
                }
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Fase 2b: goods that left the warehouse in the period.
function OutboundSection({ o, prev, csv }: { o: OutboundReport; prev: OutboundReport | null; csv: (t: CsvTable) => string }) {
  const t = o.totals;
  const p = prev?.totals;
  const empty = t.pcs === 0 && t.returned === 0 && t.adjusted === 0;
  return (
    <>
      <h2 className="mt-8 text-h2">Barang keluar</h2>
      <p className="text-small text-text-muted">Barang yang meninggalkan gudang lewat surat jalan, dihitung dari tanggal kirim.</p>
      {empty ? (
        <p className="mt-4 rounded-lg border border-border bg-surface px-5 py-4 text-text-muted">Belum ada barang keluar di periode ini.</p>
      ) : (
        <>
          <section className="mt-4 grid grid-cols-2 gap-4 xl:grid-cols-4">
            <Stat label="Dikirim" value={t.pcs} unit="pcs" context={`${t.docs} surat jalan`} delta={p ? change(t.pcs, p.pcs) : null} />
            <Stat label="Jual BS" value={t.bs} unit="pcs" context="reject atau rusak yang dijual" delta={p ? change(t.bs, p.bs) : null} />
            <Stat
              label="Retur"
              value={t.returned}
              unit="pcs"
              warn={t.returned > 0}
              context={t.returned > 0 ? `${n1(pct(t.returned, t.pcs))}% dari dikirim · ${t.returned_rusak} rusak` : 'tidak ada retur'}
              delta={p ? change(t.returned, p.returned) : null}
              higherIsWorse
            />
            <Stat
              label="Penyesuaian"
              value={t.adjusted}
              unit="pcs"
              warn={t.adjusted > 0}
              context={t.adjusted > 0 ? `${t.adjust_docs} dokumen, hilang atau rusak` : 'tidak ada'}
              delta={p ? change(t.adjusted, p.adjusted) : null}
              higherIsWorse
            />
          </section>

          <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
            <section className="overflow-hidden rounded-lg border border-border bg-surface">
              <div className="p-4 lg:px-5">
                <SectionHead title="Per tujuan" csv={csv('keluar_tujuan')} />
              </div>
              {o.destinations.length === 0 ? (
                <p className="border-t border-border px-5 py-4 text-text-muted">Belum ada pengiriman.</p>
              ) : (
                <table className="w-full border-t border-border text-left">
                  <thead className="bg-surface-muted text-caption tracking-[0.02em] text-text-muted">
                    <tr>
                      <th className="px-5 py-2 font-medium">Tujuan</th>
                      <th className="px-3 py-2 text-right font-medium">Dikirim</th>
                      <th className="px-5 py-2 text-right font-medium">Retur</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {o.destinations.map((d) => (
                      <tr key={d.destination}>
                        <td className="px-5 py-2.5">
                          <span className="font-medium">{d.destination}</span>{' '}
                          <span className="num text-small text-text-muted">{d.docs} SJ</span>
                        </td>
                        <td className="num px-3 py-2.5 text-right">{d.pcs}</td>
                        <td className={`num px-5 py-2.5 text-right ${d.returned > 0 ? 'text-warning' : 'text-text-muted'}`}>{d.returned}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <section className="overflow-hidden rounded-lg border border-border bg-surface">
              <div className="p-4 lg:px-5">
                <SectionHead title="Per variant" csv={csv('keluar_variant')} />
              </div>
              <div className="overflow-x-auto border-t border-border">
                <table className="w-full text-left">
                  <thead className="bg-surface-muted text-caption tracking-[0.02em] text-text-muted">
                    <tr>
                      <th className="px-5 py-2 font-medium">Variant</th>
                      <th className="px-3 py-2 text-right font-medium">Dikirim</th>
                      <th className="px-3 py-2 text-right font-medium">Jual BS</th>
                      <th className="px-3 py-2 text-right font-medium">Retur</th>
                      <th className="px-5 py-2 text-right font-medium">Penyesuaian</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {o.variants.map((v) => (
                      <tr key={v.variant_id}>
                        <td className="px-5 py-2.5">
                          <span className="font-medium">
                            {v.product_name} {v.size} · {v.color}
                          </span>{' '}
                          <span className="num text-small text-text-muted">{v.sku}</span>
                        </td>
                        <td className="num px-3 py-2.5 text-right">{v.pcs}</td>
                        <td className="num px-3 py-2.5 text-right text-text-muted">{v.bs}</td>
                        <td className={`num px-3 py-2.5 text-right ${v.returned > 0 ? 'text-warning' : 'text-text-muted'}`}>{v.returned}</td>
                        <td className={`num px-5 py-2.5 text-right ${v.adjusted > 0 ? 'text-warning' : 'text-text-muted'}`}>{v.adjusted}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </>
      )}
    </>
  );
}

/**
 * Laporan as one A4 PDF: every section of /laporan for the applied period,
 * Konveko header on every page, "Powered by konveko" + environment link and
 * print time in the footer. Rendered on the server with @react-pdf/renderer
 * (vector text, no browser). Numbers and sentences come from lib/report, the
 * same helpers the page uses, so the two never disagree.
 */
import 'server-only';
import path from 'node:path';
import { Document, Font, G, Image, Line, Link, Page, Rect, StyleSheet, Svg, Text, View, renderToBuffer } from '@react-pdf/renderer';
import {
  buckets,
  change,
  deltaChip,
  duration,
  finished,
  hours,
  n1,
  niceMax,
  pct,
  rejectRate,
  type OutboundReport,
  type Period,
  type Report,
} from '@/lib/report';

// ---------------------------------------------------------------------------
// Assets (listed in next.config.ts outputFileTracingIncludes for /laporan/pdf)
// ---------------------------------------------------------------------------
const FONT_DIR = path.join(process.cwd(), 'node_modules/@fontsource/plus-jakarta-sans/files');
const LOGO = path.join(process.cwd(), 'public/logo-konveko-mark.png');

let fontsReady = false;
function registerFonts() {
  if (fontsReady) return;
  Font.register({
    family: 'Jakarta',
    fonts: [400, 500, 600, 700].map((w) => ({
      src: path.join(FONT_DIR, `plus-jakarta-sans-latin-${w}-normal.woff`),
      fontWeight: w,
    })),
  });
  // Long SKUs and names wrap at character boundaries instead of hyphenating.
  Font.registerHyphenationCallback((word) => [word]);
  fontsReady = true;
}

// ---------------------------------------------------------------------------
// Tokens (app/globals.css, light theme)
// ---------------------------------------------------------------------------
const C = {
  text: '#1C1B19',
  muted: '#6B6760',
  subtle: '#9A958D',
  border: '#EEEBE6',
  borderStrong: '#E0DCD5',
  surfaceMuted: '#F3F1EE',
  primary: '#0E5A4F',
  primarySoft: '#E4F1EE',
  success: '#1F6B3A',
  warning: '#8A5A0B',
  warningSoft: '#FBF0DC',
  danger: '#A1271C',
  info: '#1F4F82',
  ready: '#23947F',
  reject: '#C9483A',
  selisih: '#C99A3A',
};
const TONE = { success: C.success, warning: C.warning, danger: C.danger, info: C.info, neutral: C.muted };

const s = StyleSheet.create({
  page: { fontFamily: 'Jakarta', fontSize: 9, color: C.text, paddingTop: 76, paddingBottom: 58, paddingHorizontal: 40, lineHeight: 1.4 },
  header: {
    position: 'absolute', top: 24, left: 40, right: 40, height: 32,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderBottomWidth: 1, borderBottomColor: C.border, paddingBottom: 8,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  brandText: { fontSize: 14, fontWeight: 600, letterSpacing: -0.15, lineHeight: 1.2 },
  headerRight: { alignItems: 'flex-end' },
  headerTitle: { fontSize: 9, fontWeight: 600 },
  headerSub: { fontSize: 8, color: C.muted },
  footer: {
    position: 'absolute', bottom: 20, left: 40, right: 40, height: 26,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderTopWidth: 1, borderTopColor: C.border, paddingTop: 8, fontSize: 7.5, color: C.muted,
  },
  footerLink: { color: C.primary, textDecoration: 'none', fontWeight: 600 },
  h1: { fontSize: 20, fontWeight: 700, letterSpacing: -0.2, lineHeight: 1.25 },
  h2: { fontSize: 13, fontWeight: 700, marginTop: 18, marginBottom: 2, lineHeight: 1.3 },
  h3: { fontSize: 10.5, fontWeight: 600, lineHeight: 1.3 },
  muted: { color: C.muted },
  card: { borderWidth: 1, borderColor: C.border, borderRadius: 6, padding: 12, marginTop: 10 },
  caption: { fontSize: 7.5, color: C.muted, letterSpacing: 0.2 },
  th: { fontSize: 7.5, fontWeight: 600, color: C.muted, paddingVertical: 5, paddingHorizontal: 6 },
  td: { paddingVertical: 5, paddingHorizontal: 6 },
});

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------
function Header({ business }: { business: string | null }) {
  return (
    <View style={s.header} fixed>
      <View style={s.brand}>
        <Image src={LOGO} style={{ width: 18, height: 18 }} />
        <Text style={s.brandText}>konveko</Text>
      </View>
      <View style={s.headerRight}>
        <Text style={s.headerTitle}>Laporan produksi</Text>
        {business && <Text style={s.headerSub}>{business}</Text>}
      </View>
    </View>
  );
}

function Footer({ appUrl, printedAt }: { appUrl: string; printedAt: string }) {
  const host = appUrl.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  return (
    <View style={s.footer} fixed>
      <Text>
        Powered by <Text style={{ fontWeight: 600, color: C.text }}>konveko</Text>
        {' · '}
        <Link src={appUrl} style={s.footerLink}>
          {host}
        </Link>
      </Text>
      <Text>Dicetak {printedAt}</Text>
    </View>
  );
}

function Delta({ delta, unit = '%', higherIsWorse = false }: { delta: number | null; unit?: '%' | 'poin'; higherIsWorse?: boolean }) {
  const d = deltaChip(delta, unit, higherIsWorse);
  const arrow = d.dir === 'up' ? '▲ ' : d.dir === 'down' ? '▼ ' : '';
  return <Text style={{ fontSize: 7.5, color: TONE[d.tone], marginTop: 3 }}>{arrow}{d.text}</Text>;
}

function Stat({
  label, value, unit, context, delta, deltaUnit, higherIsWorse, warn, width = '16.666%',
}: {
  label: string; value: string | number; unit?: string; context?: string;
  delta: number | null; deltaUnit?: '%' | 'poin'; higherIsWorse?: boolean; warn?: boolean;
  /** share of the row: 6 tiles (production) or 4 (barang keluar) side by side in landscape */
  width?: string;
}) {
  return (
    <View style={{ width, padding: 4 }}>
      <View style={{ borderWidth: 1, borderColor: C.border, borderRadius: 6, padding: 10, height: 78 }}>
        <Text style={s.caption}>{label}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3, marginTop: 3 }}>
          <Text style={{ fontSize: 17, fontWeight: 700, color: warn ? C.warning : C.text, lineHeight: 1.15 }}>{value}</Text>
          {unit && <Text style={{ fontSize: 8, color: C.muted, marginBottom: 2.5, lineHeight: 1.2 }}>{unit}</Text>}
        </View>
        <Delta delta={delta} unit={deltaUnit} higherIsWorse={higherIsWorse} />
        {context && <Text style={{ fontSize: 7.5, color: C.muted, marginTop: 1 }}>{context}</Text>}
      </View>
    </View>
  );
}

type Col = { label: string; flex?: number; width?: number; align?: 'left' | 'right' };
/** A cell is a value, or a main line with a small muted second line (e.g. variant + SKU). */
type Cell = string | number | { text: string; sub: string };

/** Short tables (and their title) move to the next page whole instead of splitting off one row. */
const KEEP_TOGETHER = 15;

/** Section title + table. A long table breaks over pages with its header row repeated. */
function Table({
  title,
  cols,
  rows,
  empty,
}: {
  title?: string;
  cols: Col[];
  rows: { cells: Cell[]; tones?: (string | undefined)[] }[];
  empty: string;
}) {
  return (
    <View wrap={rows.length > KEEP_TOGETHER}>
      {title && <SectionTitle title={title} />}
      <TableBody cols={cols} rows={rows} empty={empty} />
    </View>
  );
}

function TableBody({ cols, rows, empty }: { cols: Col[]; rows: { cells: Cell[]; tones?: (string | undefined)[] }[]; empty: string }) {
  const cellStyle = (c: Col) => ({
    ...(c.width ? { width: c.width } : { flex: c.flex ?? 1 }),
    textAlign: c.align ?? ('left' as const),
  });
  if (rows.length === 0) return <Text style={[s.muted, { marginTop: 8 }]}>{empty}</Text>;
  return (
    <View style={{ marginTop: 8, borderWidth: 1, borderColor: C.border, borderRadius: 6 }}>
      <View style={{ flexDirection: 'row', backgroundColor: C.surfaceMuted, borderTopLeftRadius: 6, borderTopRightRadius: 6 }} fixed>
        {cols.map((c) => (
          <Text key={c.label} style={[s.th, cellStyle(c)]}>
            {c.label}
          </Text>
        ))}
      </View>
      {rows.map((r, i) => (
        <View key={i} style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: C.border }} wrap={false}>
          {r.cells.map((v, j) =>
            typeof v === 'object' ? (
              <View key={j} style={[s.td, cellStyle(cols[j])]}>
                <Text style={{ fontWeight: 500 }}>{v.text}</Text>
                <Text style={{ fontSize: 7.5, color: C.muted }}>{v.sub}</Text>
              </View>
            ) : (
              <Text key={j} style={[s.td, cellStyle(cols[j]), { color: r.tones?.[j] ?? C.text }, j === 0 ? { fontWeight: 500 } : {}]}>
                {v}
              </Text>
            ),
          )}
        </View>
      ))}
    </View>
  );
}

function SectionTitle({ title, sub }: { title: string; sub?: string }) {
  // minPresenceAhead keeps a heading from being the last line of a page
  return (
    <View minPresenceAhead={60}>
      <Text style={s.h2}>{title}</Text>
      {sub && <Text style={[s.muted, { fontSize: 8 }]}>{sub}</Text>}
    </View>
  );
}

/** Stacked columns: lolos QC + reject per day (or week), like the page chart. */
function TrendChart({ r }: { r: Report }) {
  const data = buckets(r);
  const W = 736; // card inner width: A4 landscape 842 - 2 x 40 margin - 2 x 12 padding - 2 x 1 border
  const H = 150;
  const left = 28;
  const bottom = 18;
  const plotW = W - left;
  const plotH = H - bottom - 6;
  const max = niceMax(Math.max(0, ...data.map((d) => d.ready + d.reject)));
  const slot = plotW / Math.max(1, data.length);
  const bw = Math.min(16, Math.max(2, slot * 0.62));
  const y = (v: number) => 6 + plotH - (v / max) * plotH;
  const every = Math.ceil(data.length / 12);
  const ticks = [0, max / 2, max];

  return (
    <View style={s.card} wrap={false}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={s.h3}>Tren lolos QC dan reject {r.days > 62 ? '(per minggu)' : '(per hari)'}</Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Legend color={C.ready} label="Lolos QC" />
          <Legend color={C.reject} label="Reject" />
        </View>
      </View>
      <View style={{ position: 'relative', width: W, height: H, marginTop: 8 }}>
        <Svg width={W} height={H} style={{ position: 'absolute', top: 0, left: 0 }}>
          {ticks.map((t) => (
            <Line key={t} x1={left} x2={W} y1={y(t)} y2={y(t)} stroke={t === 0 ? C.borderStrong : C.border} strokeWidth={t === 0 ? 1 : 0.6} />
          ))}
          {data.map((d, i) => {
            const x = left + i * slot + (slot - bw) / 2;
            const readyTop = y(d.ready);
            const rejectTop = y(d.ready + d.reject);
            // 1pt surface gap between the two segments, like the page chart
            const gap = d.ready > 0 && d.reject > 0 ? 1 : 0;
            return (
              <G key={d.key}>
                {d.ready > 0 && <Rect x={x} y={readyTop} width={bw} height={y(0) - readyTop} fill={C.ready} />}
                {d.reject > 0 && <Rect x={x} y={rejectTop} width={bw} height={Math.max(0.8, readyTop - rejectTop - gap)} fill={C.reject} />}
              </G>
            );
          })}
        </Svg>
        {/* Axis labels as Text: Svg text would not use the embedded font */}
        {ticks.map((t) => (
          <Text key={t} style={{ position: 'absolute', left: 0, width: left - 5, top: y(t) - 4.5, fontSize: 6.5, color: C.subtle, textAlign: 'right' }}>
            {n1(t)}
          </Text>
        ))}
        {data.map((d, i) =>
          i % every === 0 ? (
            <Text
              key={d.key}
              style={{ position: 'absolute', left: left + i * slot + slot / 2 - 20, width: 40, top: H - bottom + 5, fontSize: 6.5, color: C.subtle, textAlign: 'center' }}
            >
              {d.label}
            </Text>
          ) : null,
        )}
      </View>
      {data.every((d) => d.ready + d.reject === 0) && (
        <Text style={[s.muted, { marginTop: 6 }]}>Belum ada pcs selesai di periode ini.</Text>
      )}
    </View>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <View style={{ width: 7, height: 7, borderRadius: 1.5, backgroundColor: color }} />
      <Text style={{ fontSize: 7.5, color: C.muted }}>{label}</Text>
    </View>
  );
}

function ReasonBars({ title, color, rows, max, empty }: { title: string; color: string; rows: { label: string; sub: string; qty: number }[]; max: number; empty: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={s.caption}>{title}</Text>
      {rows.length === 0 ? (
        <Text style={[s.muted, { marginTop: 6 }]}>{empty}</Text>
      ) : (
        rows.map((x) => (
          <View key={`${x.label}-${x.sub}`} style={{ marginTop: 6 }} wrap={false}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 6 }}>
              <Text style={{ flex: 1 }}>
                {x.label} <Text style={{ color: C.subtle }}>· {x.sub}</Text>
              </Text>
              <Text style={{ fontWeight: 600 }}>{x.qty}</Text>
            </View>
            <View style={{ height: 4, borderRadius: 2, backgroundColor: C.surfaceMuted, marginTop: 2 }}>
              <View style={{ height: 4, borderRadius: 2, backgroundColor: color, width: `${Math.max(2, (x.qty / max) * 100)}%` }} />
            </View>
          </View>
        ))
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Document
// ---------------------------------------------------------------------------
export type ReportPdfInput = {
  period: Period;
  r: Report;
  prev: Report;
  out: OutboundReport | null;
  outPrev: OutboundReport | null;
  business: string | null;
  appUrl: string;
  now?: Date;
};

const printedFmt = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta',
});

function ReportDocument({ period, r, prev, out, outPrev, business, appUrl, now = new Date() }: ReportPdfInput) {
  const t = r.totals;
  const p = prev.totals;
  const reject = t.sew_reject + t.qc_reject;
  const maxReason = Math.max(1, ...r.reject_reasons.map((x) => x.qty), ...r.selisih_reasons.map((x) => x.qty));
  const lead = r.lead_time.median_days === null ? null : duration(r.lead_time.median_days).split(' ');
  const printedAt = `${printedFmt.format(now)} WIB`;
  const variantName = (v: { product_name: string; size: string; color: string; sku: string }) => ({ text: `${v.product_name} ${v.size} · ${v.color}`, sub: v.sku });

  return (
    <Document title={`Laporan produksi ${period.label}`} author="konveko" creator="konveko" producer="konveko" language="id">
      <Page size="A4" orientation="landscape" style={s.page}>
        <Header business={business} />

        <Text style={s.h1}>Laporan produksi</Text>
        <Text style={{ fontSize: 11, marginTop: 4, fontWeight: 500 }}>{period.label}</Text>
        <Text style={[s.muted, { marginTop: 1 }]}>Dibanding {period.prevLabel}</Text>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8, marginHorizontal: -4 }} wrap={false}>
          <Stat label="DIPOTONG" value={t.cut} unit="pcs" context={`${t.batches} batch baru`} delta={change(t.cut, p.cut)} />
          <Stat label="LOLOS QC" value={t.ready} unit="pcs" context={`dari ${t.qc_in} pcs masuk QC`} delta={change(t.ready, p.ready)} />
          <Stat
            label="REJECT"
            value={`${n1(rejectRate(t))}%`}
            context={`${reject} pcs · jahit ${t.sew_reject}, QC ${t.qc_reject}`}
            delta={finished(p) > 0 && finished(t) > 0 ? rejectRate(t) - rejectRate(p) : null}
            deltaUnit="poin"
            higherIsWorse
          />
          <Stat
            label="SELISIH"
            value={t.selisih}
            unit="pcs"
            warn={t.selisih > 0}
            context={t.flags_open > 0 ? `${t.flags_open} flag masih terbuka` : `${t.selisih_events} kejadian`}
            delta={change(t.selisih, p.selisih)}
            higherIsWorse
          />
          <Stat label="MASUK RAK" value={t.shelved} unit="pcs" context="pcs baik discan gudang" delta={change(t.shelved, p.shelved)} />
          <Stat
            label="WAKTU PRODUKSI"
            value={lead ? lead[0] : '-'}
            unit={lead ? lead[1] : undefined}
            context={r.lead_time.bundles > 0 ? `median, ${r.lead_time.bundles} bundle selesai` : 'belum ada bundle selesai'}
            delta={
              r.lead_time.median_days !== null && prev.lead_time.median_days !== null
                ? change(r.lead_time.median_days, prev.lead_time.median_days)
                : null
            }
            higherIsWorse
          />
        </View>

        <TrendChart r={r} />

        <Table
          title="Per penjahit"
          cols={[
            { label: 'Penjahit', flex: 2.2 },
            { label: 'Bundle', align: 'right' },
            { label: 'Diterima', align: 'right' },
            { label: 'Jadi', align: 'right' },
            { label: 'Reject', flex: 1.3, align: 'right' },
            { label: 'Waktu per bundle', flex: 1.5, align: 'right' },
          ]}
          rows={r.tailors.map((x) => {
            const rate = pct(x.reject, x.received);
            return {
              cells: [x.name, x.bundles, x.received, x.good, `${x.reject} (${n1(rate)}%)`, x.avg_hours === null ? '-' : hours(x.avg_hours)],
              tones: [undefined, undefined, undefined, undefined, rate >= 5 ? C.warning : undefined, C.muted],
            };
          })}
          empty="Belum ada scan selesai jahit."
        />

        <View wrap={false}>
        <SectionTitle title="Alasan" />
        <View style={[s.card, { flexDirection: 'row', gap: 20 }]}>
          <ReasonBars
            title="REJECT"
            color={C.reject}
            rows={r.reject_reasons.map((x) => ({ label: x.label, sub: x.stage === 'jahit' ? 'jahit' : 'QC', qty: x.qty }))}
            max={maxReason}
            empty="Tidak ada reject."
          />
          <ReasonBars
            title="SELISIH"
            color={C.selisih}
            rows={r.selisih_reasons.map((x) => ({ label: x.label, sub: x.step, qty: x.qty }))}
            max={maxReason}
            empty="Tidak ada selisih."
          />
        </View>
        </View>

        <Table
          title="Per variant"
          cols={[
            { label: 'Variant', flex: 3 },
            { label: 'Dipotong', align: 'right' },
            { label: 'Lolos QC', align: 'right' },
            { label: 'Reject', align: 'right' },
          ]}
          rows={r.variants.map((v) => ({ cells: [variantName(v), v.cut, v.ready, v.reject] }))}
          empty="Belum ada data."
        />

        {out && <Outbound o={out} prev={outPrev} variantName={variantName} />}

        <Text style={{ marginTop: 16, fontSize: 7.5, color: C.subtle }}>
          Angka dihitung dari scan di periode ini (WIB), setelah koreksi supervisor. Scan yang dikoreksi tetap masuk ke tanggal scan aslinya.
        </Text>
        <Footer appUrl={appUrl} printedAt={printedAt} />
      </Page>
    </Document>
  );
}

function Outbound({
  o,
  prev,
  variantName,
}: {
  o: OutboundReport;
  prev: OutboundReport | null;
  variantName: (v: { product_name: string; size: string; color: string; sku: string }) => Cell;
}) {
  const t = o.totals;
  const p = prev?.totals;
  const empty = t.pcs === 0 && t.returned === 0 && t.adjusted === 0;
  return (
    <>
      {empty ? (
        <View wrap={false}>
          <SectionTitle title="Barang keluar" sub="Barang yang meninggalkan gudang lewat surat jalan, dihitung dari tanggal kirim." />
          <Text style={[s.muted, { marginTop: 8 }]}>Belum ada barang keluar di periode ini.</Text>
        </View>
      ) : (
        <>
          {/* heading and tiles move to the next page together */}
          <View wrap={false}>
          <SectionTitle title="Barang keluar" sub="Barang yang meninggalkan gudang lewat surat jalan, dihitung dari tanggal kirim." />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 6, marginHorizontal: -4 }}>
            <Stat width="25%" label="DIKIRIM" value={t.pcs} unit="pcs" context={`${t.docs} surat jalan`} delta={p ? change(t.pcs, p.pcs) : null} />
            <Stat width="25%" label="JUAL BS" value={t.bs} unit="pcs" context="reject atau rusak yang dijual" delta={p ? change(t.bs, p.bs) : null} />
            <Stat
              width="25%"
              label="RETUR"
              value={t.returned}
              unit="pcs"
              warn={t.returned > 0}
              context={t.returned > 0 ? `${n1(pct(t.returned, t.pcs))}% dari dikirim · ${t.returned_rusak} rusak` : 'tidak ada retur'}
              delta={p ? change(t.returned, p.returned) : null}
              higherIsWorse
            />
            <Stat
              width="25%"
              label="PENYESUAIAN"
              value={t.adjusted}
              unit="pcs"
              warn={t.adjusted > 0}
              context={t.adjusted > 0 ? `${t.adjust_docs} dokumen, hilang atau rusak` : 'tidak ada'}
              delta={p ? change(t.adjusted, p.adjusted) : null}
              higherIsWorse
            />
          </View>
          </View>

          <Table
            title="Barang keluar per tujuan"
            cols={[
              { label: 'Tujuan', flex: 3 },
              { label: 'Surat jalan', align: 'right' },
              { label: 'Dikirim', align: 'right' },
              { label: 'Retur', align: 'right' },
            ]}
            rows={o.destinations.map((d) => ({
              cells: [d.destination, d.docs, d.pcs, d.returned],
              tones: [undefined, C.muted, undefined, d.returned > 0 ? C.warning : C.muted],
            }))}
            empty="Belum ada pengiriman."
          />

          <Table
            title="Barang keluar per variant"
            cols={[
              { label: 'Variant', flex: 3 },
              { label: 'Dikirim', align: 'right' },
              { label: 'Jual BS', align: 'right' },
              { label: 'Retur', align: 'right' },
              { label: 'Penyesuaian', flex: 1.2, align: 'right' },
            ]}
            rows={o.variants.map((v) => ({
              cells: [variantName(v), v.pcs, v.bs, v.returned, v.adjusted],
              tones: [undefined, undefined, C.muted, v.returned > 0 ? C.warning : C.muted, v.adjusted > 0 ? C.warning : C.muted],
            }))}
            empty="Belum ada data."
          />
        </>
      )}
    </>
  );
}

export async function renderReportPdf(input: ReportPdfInput): Promise<Buffer> {
  registerFonts();
  return renderToBuffer(<ReportDocument {...input} />);
}

// Reporting helpers: period math (Asia/Jakarta calendar), rule-based insights, CSV.
// Pure functions so the page, the CSV route, and tests share them.

export type ReportTotals = {
  cut: number;
  batches: number;
  sew_in: number;
  sew_good: number;
  sew_reject: number;
  qc_in: number;
  ready: number;
  qc_reject: number;
  selisih: number;
  selisih_events: number;
  shelved: number;
  flags_open: number;
};

export type Report = {
  from: string;
  to: string;
  days: number;
  totals: ReportTotals;
  lead_time: { bundles: number; median_days: number | null; p90_days: number | null };
  daily: { day: string; cut: number; ready: number; reject: number; selisih: number }[];
  tailors: { holder_id: string; name: string; bundles: number; received: number; good: number; reject: number; avg_hours: number | null }[];
  variants: { variant_id: string; sku: string; product_name: string; size: string; color: string; cut: number; ready: number; reject: number }[];
  reject_reasons: { label: string; stage: 'jahit' | 'qc'; qty: number }[];
  selisih_reasons: { label: string; step: string; qty: number }[];
};

export type Mode = 'week' | 'month' | 'custom';
export type Period = {
  mode: Mode;
  from: string;
  to: string;
  prevFrom: string;
  prevTo: string;
  label: string;
  prevLabel: string;
  /** anchors for the previous / next arrows (null = no next, it would be in the future) */
  prevAnchor: string | null;
  nextAnchor: string | null;
};

const TZ = 'Asia/Jakarta';
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const DAY = 86_400_000;

export function todayJakarta(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

const toMs = (d: string) => Date.parse(`${d}T00:00:00Z`);
const toIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (d: string, n: number) => toIso(toMs(d) + n * DAY);
export const daysBetween = (a: string, b: string) => Math.round((toMs(b) - toMs(a)) / DAY);
const minIso = (a: string, b: string) => (a < b ? a : b);

const fmtDay = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const fmtDayYear = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const fmtMonth = new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const fmtWeekday = new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' });

export const dayLabel = (d: string) => fmtDay.format(new Date(toMs(d)));
export const weekdayLabel = (d: string) => fmtWeekday.format(new Date(toMs(d)));
export function rangeLabel(from: string, to: string) {
  if (from === to) return fmtDayYear.format(new Date(toMs(from)));
  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  return `${sameYear ? fmtDay.format(new Date(toMs(from))) : fmtDayYear.format(new Date(toMs(from)))} – ${fmtDayYear.format(new Date(toMs(to)))}`;
}

/**
 * Resolve URL params into a period. The current week / month runs up to
 * today and is compared with the same number of days of the period before
 * (1–9 Nov vs 1–9 Oct), so a half-finished month is not judged against a
 * full one.
 */
export function resolvePeriod(params: { mode?: string; date?: string; from?: string; to?: string }, today = todayJakarta()): Period {
  const mode: Mode = params.mode === 'month' || params.mode === 'custom' ? params.mode : 'week';

  if (mode === 'custom') {
    let from = ISO.test(params.from ?? '') ? params.from! : addDays(today, -29);
    let to = ISO.test(params.to ?? '') ? params.to! : today;
    if (from > to) [from, to] = [to, from];
    if (to > today) to = today;
    if (from > to) from = to;
    if (daysBetween(from, to) > 366) from = addDays(to, -366);
    const len = daysBetween(from, to) + 1;
    const prevTo = addDays(from, -1);
    const prevFrom = addDays(prevTo, -(len - 1));
    return { mode, from, to, prevFrom, prevTo, label: rangeLabel(from, to), prevLabel: rangeLabel(prevFrom, prevTo), prevAnchor: null, nextAnchor: null };
  }

  if (mode === 'month') {
    const ym = /^\d{4}-\d{2}$/.test(params.date ?? '') ? params.date! : today.slice(0, 7);
    const from = `${ym}-01`;
    const [y, m] = ym.split('-').map(Number);
    const monthEnd = toIso(Date.UTC(y, m, 0)); // day 0 of next month
    const to = minIso(monthEnd, today);
    const len = daysBetween(from, to) + 1;
    const prevYm = toIso(Date.UTC(y, m - 2, 1)).slice(0, 7);
    const prevFrom = `${prevYm}-01`;
    const prevMonthEnd = toIso(Date.UTC(y, m - 1, 0));
    const prevTo = minIso(addDays(prevFrom, len - 1), prevMonthEnd);
    const nextYm = toIso(Date.UTC(y, m, 1)).slice(0, 7);
    return {
      mode,
      from,
      to,
      prevFrom,
      prevTo,
      label: fmtMonth.format(new Date(toMs(from))) + (to < monthEnd ? ` (s.d. ${dayLabel(to)})` : ''),
      prevLabel: rangeLabel(prevFrom, prevTo),
      prevAnchor: prevYm,
      nextAnchor: `${nextYm}-01` <= today ? nextYm : null,
    };
  }

  // week: Monday to Sunday containing the anchor date
  const anchor = ISO.test(params.date ?? '') && params.date! <= today ? params.date! : today;
  const dow = (new Date(toMs(anchor)).getUTCDay() + 6) % 7; // 0 = Monday
  const from = addDays(anchor, -dow);
  const weekEnd = addDays(from, 6);
  const to = minIso(weekEnd, today);
  const len = daysBetween(from, to) + 1;
  const prevFrom = addDays(from, -7);
  const prevTo = addDays(prevFrom, len - 1);
  const next = addDays(from, 7);
  return {
    mode,
    from,
    to,
    prevFrom,
    prevTo,
    label: `Minggu ${rangeLabel(from, weekEnd)}`,
    prevLabel: rangeLabel(prevFrom, prevTo),
    prevAnchor: prevFrom,
    nextAnchor: next <= today ? next : null,
  };
}

// ---------------------------------------------------------------------------
// Numbers
// ---------------------------------------------------------------------------
const nf1 = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 });
export const n1 = (x: number) => nf1.format(x);
export const pct = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 0);

/** Hours as "5,5 jam", or minutes below one hour ("40 menit"). */
export function hours(h: number) {
  return h < 1 ? `${Math.round(h * 60)} menit` : `${n1(h)} jam`;
}

/** Days as "2,3 hari", or hours / minutes below one day. */
export function duration(days: number) {
  return days < 1 ? hours(days * 24) : `${n1(days)} hari`;
}

/** Pieces that finished a step (lolos QC + reject); 0 means no basis for a reject rate. */
export const finished = (t: ReportTotals) => t.ready + t.sew_reject + t.qc_reject;

/** Reject share of pieces that finished a step in the period. */
export function rejectRate(t: ReportTotals) {
  const reject = t.sew_reject + t.qc_reject;
  return pct(reject, t.ready + reject);
}

/** Relative change in %, or null when there is nothing to compare with. */
export function change(now: number, before: number): number | null {
  if (before === 0) return now === 0 ? 0 : null;
  return ((now - before) / before) * 100;
}

// ---------------------------------------------------------------------------
// Insights: short Indonesian sentences, most important first
// ---------------------------------------------------------------------------
export type Insight = { tone: 'success' | 'warning' | 'danger' | 'info'; text: string };

const MIN_TAILOR_PCS = 10;

export function buildInsights(r: Report, prev: Report): Insight[] {
  const out: Insight[] = [];
  const t = r.totals;
  const p = prev.totals;
  const reject = t.sew_reject + t.qc_reject;

  if (t.cut === 0 && t.ready === 0 && t.sew_in === 0) {
    return [{ tone: 'info', text: 'Belum ada scan di periode ini.' }];
  }

  // output vs previous period
  const ch = change(t.ready, p.ready);
  if (t.ready === 0 && p.ready === 0) out.push({ tone: 'info', text: 'Belum ada pcs yang lolos QC di periode ini.' });
  else if (ch === null) out.push({ tone: 'info', text: `${t.ready} pcs lolos QC. Periode sebelumnya belum ada yang lolos QC, jadi belum ada pembanding.` });
  else if (Math.abs(ch) < 5) out.push({ tone: 'info', text: `${t.ready} pcs lolos QC, hampir sama dengan periode sebelumnya (${p.ready}).` });
  else
    out.push({
      tone: ch > 0 ? 'success' : 'warning',
      text: `${t.ready} pcs lolos QC, ${ch > 0 ? 'naik' : 'turun'} ${n1(Math.abs(ch))}% dari periode sebelumnya (${p.ready}).`,
    });

  if (t.cut > 0) {
    const cc = change(t.cut, p.cut);
    const cmp = cc === null || Math.abs(cc) < 5 ? '' : `, ${cc > 0 ? 'naik' : 'turun'} ${n1(Math.abs(cc))}% dari ${p.cut}`;
    out.push({ tone: 'info', text: `${t.cut} pcs dipotong dari ${t.batches} batch baru${cmp}.` });
  }

  // reject rate
  if (reject > 0) {
    const rate = rejectRate(t);
    const prevRate = rejectRate(p);
    const diff = rate - prevRate;
    const cmp = finished(p) > 0 && Math.abs(diff) >= 0.5
      ? `, ${diff > 0 ? 'naik' : 'turun'} ${n1(Math.abs(diff))} poin dari ${n1(prevRate)}%`
      : '';
    out.push({
      tone: rate >= 5 || diff >= 1 ? 'warning' : 'info',
      text: `Reject ${n1(rate)}% (${reject} pcs: ${t.sew_reject} di jahit, ${t.qc_reject} di QC)${cmp}.`,
    });
    const top = [...r.reject_reasons].sort((a, b) => b.qty - a.qty)[0];
    if (top) out.push({ tone: 'info', text: `Alasan reject terbanyak: ${top.label.toLowerCase()} (${top.qty} pcs, ${n1(pct(top.qty, reject))}% dari reject).` });
  } else if (t.ready > 0) {
    out.push({ tone: 'success', text: 'Tidak ada reject di periode ini.' });
  }

  // tailors: highest reject rate with enough volume, and the fastest
  const eligible = r.tailors.filter((x) => x.received >= MIN_TAILOR_PCS);
  const worst = [...eligible].sort((a, b) => pct(b.reject, b.received) - pct(a.reject, a.received))[0];
  if (worst && worst.reject > 0 && eligible.length > 1) {
    const rate = pct(worst.reject, worst.received);
    out.push({
      tone: rate >= 5 ? 'warning' : 'info',
      text: `Reject jahit tertinggi di ${worst.name}: ${n1(rate)}% (${worst.reject} dari ${worst.received} pcs).`,
    });
  }
  const fastest = r.tailors.filter((x) => x.avg_hours !== null && x.bundles >= 2).sort((a, b) => a.avg_hours! - b.avg_hours!)[0];
  if (fastest && r.tailors.length > 1) {
    out.push({ tone: 'info', text: `Rata-rata jahit tercepat: ${fastest.name}, ${hours(fastest.avg_hours!)} per bundle.` });
  }

  // selisih
  if (t.selisih > 0) {
    out.push({
      tone: 'danger',
      text: `Selisih ${t.selisih} pcs dari ${t.selisih_events} serah-terima${t.flags_open > 0 ? `, ${t.flags_open} flag masih terbuka` : ', semua flag sudah selesai'}.`,
    });
  } else if (t.sew_in + t.qc_in > 0) {
    out.push({ tone: 'success', text: 'Tidak ada selisih di serah-terima periode ini.' });
  }

  // lead time
  if (r.lead_time.bundles > 0 && r.lead_time.median_days !== null) {
    const prevMed = prev.lead_time.median_days;
    const cmp = prevMed !== null && prev.lead_time.bundles > 0 && Math.abs(r.lead_time.median_days - prevMed) >= 0.5
      ? ` (${r.lead_time.median_days < prevMed ? 'lebih cepat' : 'lebih lambat'} dari ${duration(prevMed)})`
      : '';
    out.push({
      tone: 'info',
      text: `Dari batch dibuat sampai lolos QC: median ${duration(r.lead_time.median_days)}${cmp}, 9 dari 10 bundle selesai dalam ${duration(r.lead_time.p90_days ?? 0)}.`,
    });
  }

  // busiest day and top variant
  const busiest = [...r.daily].sort((a, b) => b.ready - a.ready)[0];
  if (busiest && busiest.ready > 0 && r.days > 1) {
    out.push({ tone: 'info', text: `Hari paling produktif: ${weekdayLabel(busiest.day)}, ${busiest.ready} pcs lolos QC.` });
  }
  const topVariant = r.variants[0];
  if (topVariant && topVariant.ready > 0 && r.variants.length > 1) {
    out.push({
      tone: 'info',
      text: `Variant terbanyak: ${topVariant.product_name} ${topVariant.size} ${topVariant.color} (${topVariant.ready} pcs, ${n1(pct(topVariant.ready, t.ready))}% dari output).`,
    });
  }

  // unshelved finished goods
  if (t.ready > 0 && t.shelved < t.ready) {
    out.push({ tone: 'info', text: `${t.shelved} pcs masuk rak di periode ini, dari ${t.ready} pcs yang lolos QC.` });
  }

  return out;
}

// ---------------------------------------------------------------------------
// Chart buckets: one column per day, per week when the range is long
// ---------------------------------------------------------------------------
export type Bucket = { key: string; label: string; from: string; to: string; ready: number; reject: number; cut: number };

export function buckets(r: Report): Bucket[] {
  if (r.days <= 62) {
    return r.daily.map((d) => ({ key: d.day, label: dayLabel(d.day), from: d.day, to: d.day, ready: d.ready, reject: d.reject, cut: d.cut }));
  }
  const out: Bucket[] = [];
  for (let i = 0; i < r.daily.length; i += 7) {
    const chunk = r.daily.slice(i, i + 7);
    out.push({
      key: chunk[0].day,
      label: dayLabel(chunk[0].day),
      from: chunk[0].day,
      to: chunk[chunk.length - 1].day,
      ready: chunk.reduce((s, d) => s + d.ready, 0),
      reject: chunk.reduce((s, d) => s + d.reject, 0),
      cut: chunk.reduce((s, d) => s + d.cut, 0),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// CSV (semicolon-separated with BOM, so Excel in an Indonesian locale opens it)
// ---------------------------------------------------------------------------
function cell(v: unknown) {
  const s = v === null || v === undefined ? '' : String(v);
  // keep formulas from executing when opened in a spreadsheet
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[";\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(rows: (string | number | null)[][]) {
  return '﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n') + '\r\n';
}

export const CSV_TABLES = ['harian', 'penjahit', 'variant', 'alasan'] as const;
export type CsvTable = (typeof CSV_TABLES)[number];

export function reportCsv(r: Report, table: CsvTable): string {
  switch (table) {
    case 'harian':
      return toCsv([
        ['Tanggal', 'Dipotong', 'Lolos QC', 'Reject', 'Selisih'],
        ...r.daily.map((d) => [d.day, d.cut, d.ready, d.reject, d.selisih]),
      ]);
    case 'penjahit':
      return toCsv([
        ['Penjahit', 'Bundle', 'Diterima', 'Jadi', 'Reject', 'Reject %', 'Rata-rata jam per bundle'],
        ...r.tailors.map((x) => [x.name, x.bundles, x.received, x.good, x.reject, n1(pct(x.reject, x.received)), x.avg_hours === null ? '' : n1(x.avg_hours)]),
      ]);
    case 'variant':
      return toCsv([
        ['SKU', 'Produk', 'Ukuran', 'Warna', 'Dipotong', 'Lolos QC', 'Reject'],
        ...r.variants.map((v) => [v.sku, v.product_name, v.size, v.color, v.cut, v.ready, v.reject]),
      ]);
    case 'alasan':
      return toCsv([
        ['Jenis', 'Tahap', 'Alasan', 'Qty'],
        ...r.reject_reasons.map((x) => ['Reject', x.stage === 'jahit' ? 'Jahit' : 'QC', x.label, x.qty]),
        ...r.selisih_reasons.map((x) => ['Selisih', x.step, x.label, x.qty]),
      ]);
  }
}

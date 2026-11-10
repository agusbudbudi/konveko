import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Boxes, ChevronRight, CircleAlert, Layers, Package, Scroll, Shirt, Tag, Truck, Users, Warehouse, Zap, type LucideIcon } from 'lucide-react';
import { Badge, StatusBadge } from '@/components/ui/status-badge';
import { cn } from '@/lib/cn';
import { OUTBOUND_STATUS, OUTBOUND_TYPE, type OutboundStatus, type OutboundType } from '@/lib/outbound';
import { productHref } from '@/lib/stock';
import { createClient } from '@/lib/supabase/server';
import { BATCH_STATUS, type BundleStatus } from '@/lib/types';
import { LacakBox } from './lacak-box';

export const metadata: Metadata = { title: 'Lacak' };

const LIMIT = 5;
/** Rows fetched per code search before ranking; the best LIMIT are shown. */
const FETCH = 30;
const MIN_LENGTH = 2;
const QR_TOKEN = /^[0-9a-f]{32}$/;

const dateFmt = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta' });

type Variant = { id: string; sku: string; product_name: string; size: string; color: string };
type Hit = { key: string; href: string; title: string; sub?: string; meta?: React.ReactNode };
type Group = { key: string; label: string; icon: LucideIcon; hits: Hit[]; total: number; more?: string };

/**
 * One search over production and stock: pcs, bundles, batches, racks, products and variants,
 * plus what a tailor holds, what a fabric roll became, reject/selisih reasons, and shortcuts
 * for status words. Master data itself (users, settings) is not searched. A 32-character QR
 * token (handheld scanner) jumps to the exact bundle, pcs or rack.
 */
export default async function LacakPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const raw = ((await searchParams).q ?? '').trim().slice(0, 64);
  // ilike wildcards and filter syntax are stripped; codes only use letters, digits and '-'
  const q = raw.replace(/[%_\\,()"']/g, '').replace(/\s+/g, ' ');
  const ready = q.length >= MIN_LENGTH;
  const [codeGroups, extra] = ready ? await Promise.all([search(q), searchMore(q)]) : [[], { shortcuts: [], groups: [] }];
  const groups = [...codeGroups, ...extra.groups];
  const shortcuts = extra.shortcuts;
  const found = groups.reduce((n, g) => n + g.total, 0) + shortcuts.length;

  // A scanned label (camera or handheld scanner) is a QR token: open its page straight away.
  // Typed text never redirects, so the page does not jump away mid-typing.
  const scanned = QR_TOKEN.test(q.toLowerCase());
  if (scanned && found === 1) {
    const hit = groups.find((g) => g.total === 1)?.hits[0];
    if (hit) redirect(hit.href);
  }

  return (
    <>
      {/* Hero with a soft brand-teal wash (the one gradient in the app, DESIGN §11): bleeds to the
          content edges and fades into the page background before the results start. */}
      <div className="relative isolate -mx-4 -mt-4 px-4 pt-8 pb-10 lg:-mx-6 lg:-mt-6 lg:px-6 lg:pt-12 lg:pb-14">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background:
              'radial-gradient(60% 100% at 10% 0%, color-mix(in srgb, var(--primary) 12%, transparent) 0%, transparent 75%),' +
              'radial-gradient(50% 90% at 90% 0%, color-mix(in srgb, var(--info) 10%, transparent) 0%, transparent 75%),' +
              'radial-gradient(40% 60% at 55% 10%, color-mix(in srgb, var(--highlight) 4%, transparent) 0%, transparent 75%),' +
              'linear-gradient(to bottom, color-mix(in srgb, var(--primary-soft) 55%, var(--background)) 0%, var(--background) 100%)',
          }}
        />
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-[28px] leading-9 font-semibold tracking-[-0.01em]">Lacak apa saja</h1>
          <p className="mt-2 text-text-muted">Batch, bundle, pcs, rak, produk, penjahit, rol kain, atau alasan. Ketik sebagian kode atau scan label.</p>
          <div className="mt-6 text-left">
            <LacakBox />
          </div>
        </div>
      </div>

      {q.length < MIN_LENGTH ? (
        <Hints short={q.length > 0} />
      ) : found === 0 && scanned ? (
        <p className="mx-auto mt-2 max-w-3xl rounded-lg border border-border bg-surface px-5 py-4 text-text-muted">
          Label ini tidak dikenal. Pastikan yang di-scan label pcs, bundle, atau rak dari Konveko.
        </p>
      ) : found === 0 ? (
        <p className="mt-6 rounded-lg border border-border bg-surface px-5 py-4 text-text-muted">
          Tidak ada yang cocok dengan <span className="num font-medium text-text">{q}</span>. Coba kode lain atau sebagian saja, misal{' '}
          <span className="num">00012</span>.
        </p>
      ) : (
        <>
          <p className="mt-4 text-small text-text-muted">
            <span className="num text-text">{found}</span> hasil untuk <span className="num font-medium text-text">{q}</span>
          </p>
          {shortcuts.length > 0 && <Shortcuts items={shortcuts} />}
          <div className="mt-3 grid gap-4 lg:grid-cols-2">
            {groups
              .filter((g) => g.total > 0)
              .map((g) => (
                <ResultGroup key={g.key} group={g} />
              ))}
          </div>
        </>
      )}
    </>
  );
}

async function search(q: string): Promise<Group[]> {
  const supabase = await createClient();
  const like = `%${q}%`;
  const token = QR_TOKEN.test(q.toLowerCase()) ? q.toLowerCase() : null;

  const [pieces, bundles, batches, racks, variantsRes, stockRes] = await Promise.all([
    // codes: by QR token when one is scanned, otherwise a partial match
    token
      ? supabase.from('piece').select(PIECE, { count: 'exact' }).eq('qr_token', token)
      : supabase.from('piece').select(PIECE, { count: 'exact' }).ilike('code', like).order('code', { ascending: false }).limit(FETCH),
    token
      ? supabase.from('bundle').select(BUNDLE, { count: 'exact' }).eq('qr_token', token)
      : supabase.from('bundle').select(BUNDLE, { count: 'exact' }).ilike('code', like).order('code').limit(FETCH),
    token
      ? Promise.resolve({ data: [], count: 0 })
      : supabase.from('production_batch').select('id, code, status, created_at', { count: 'exact' }).ilike('code', like).order('created_at', { ascending: false }).limit(FETCH),
    token
      ? supabase.from('location').select('id, code, kind, is_active', { count: 'exact' }).eq('qr_token', token)
      : supabase.from('location').select('id, code, kind, is_active', { count: 'exact' }).ilike('code', like).order('code').limit(FETCH),
    // variants are a bounded catalogue: match every word against SKU, name, size and color in memory
    token ? Promise.resolve({ data: [] }) : supabase.from('product_variant').select('id, sku, product_name, size, color').eq('is_active', true),
    supabase.from('stock_location').select('variant_id, product_name, grade, location_id, qty'),
  ]);

  const stock = (stockRes.data ?? []) as { variant_id: string; product_name: string; grade: 'baik' | 'reject'; location_id: string | null; qty: number }[];
  const sum = (rows: typeof stock) => {
    let baik = 0;
    let reject = 0;
    let belum = 0;
    for (const r of rows) {
      if (r.grade === 'reject') reject += r.qty;
      else {
        baik += r.qty;
        if (!r.location_id) belum += r.qty;
      }
    }
    return { baik, reject, belum };
  };

  const words = q.toLowerCase().split(' ').filter(Boolean);
  const variants = ((variantsRes.data ?? []) as Variant[]).filter((v) => matches(`${v.sku} ${v.product_name} ${v.size} ${v.color}`, words));
  const productNames = [...new Set(((variantsRes.data ?? []) as Variant[]).map((v) => v.product_name))].filter((n) => matches(n, words));

  const pieceRows = best((pieces.data ?? []) as unknown as PieceRow[], q);
  const bundleRows = best((bundles.data ?? []) as unknown as BundleRow[], q);
  const batchRows = best((batches.data ?? []) as { id: string; code: string; status: keyof typeof BATCH_STATUS; created_at: string }[], q);
  const rackRows = best((racks.data ?? []) as { id: string; code: string; kind: 'stok' | 'reject'; is_active: boolean }[], q);

  const variantLabel = (v: { product_name: string; size: string; color: string } | null) => (v ? `${v.product_name} ${v.size} · ${v.color}` : '-');

  return [
    {
      key: 'pcs',
      label: 'Pcs',
      icon: Tag,
      total: pieces.count ?? pieceRows.length,
      more: `/stok/pcs?q=${encodeURIComponent(q)}`,
      hits: pieceRows.map((p) => ({
        key: p.code,
        href: `/pcs/${p.code}`,
        title: p.code,
        sub: variantLabel(p.variant),
        meta: (
          <>
            {p.status === 'batal' ? (
              <Badge tone="neutral">Dibatalkan</Badge>
            ) : (
              <Badge tone={p.grade === 'reject' ? 'danger' : 'success'}>{p.grade === 'reject' ? 'Reject' : 'Baik'}</Badge>
            )}
            <span className={cn('text-small', p.location ? 'text-text-muted' : 'text-warning')}>
              {p.location ? `Rak ${p.location.code}` : p.status === 'aktif' ? 'Belum di rak' : ''}
            </span>
          </>
        ),
      })),
    },
    {
      key: 'bundle',
      label: 'Bundle',
      icon: Boxes,
      total: bundles.count ?? bundleRows.length,
      hits: bundleRows.map((b) => ({
        key: b.id,
        href: `/bundle/${b.id}`,
        title: b.code,
        sub: `${variantLabel(b.variant)} · Batch ${b.batch?.code ?? '-'}`,
        meta: (
          <>
            <StatusBadge status={b.current_status} />
            <span className="num text-small text-text-muted">{b.current_qty} pcs</span>
          </>
        ),
      })),
    },
    {
      key: 'batch',
      label: 'Batch',
      icon: Layers,
      total: batches.count ?? batchRows.length,
      hits: batchRows.map((b) => ({
        key: b.id,
        href: `/batch/${b.id}`,
        title: b.code,
        sub: `Dibuat ${dateFmt.format(new Date(b.created_at))}`,
        meta: <Badge tone={BATCH_STATUS[b.status].tone}>{BATCH_STATUS[b.status].label}</Badge>,
      })),
    },
    {
      key: 'rak',
      label: 'Rak',
      icon: Warehouse,
      total: racks.count ?? rackRows.length,
      hits: rackRows.map((r) => {
        const qty = stock.filter((s) => s.location_id === r.id).reduce((n, s) => n + s.qty, 0);
        return {
          key: r.id,
          href: `/stok/rak/${r.code}`,
          title: `Rak ${r.code}`,
          sub: r.kind === 'reject' ? 'Rak reject' : 'Rak stok',
          meta: (
            <>
              {!r.is_active && <Badge tone="neutral">Nonaktif</Badge>}
              <span className="num text-small text-text-muted">{qty} pcs</span>
            </>
          ),
        };
      }),
    },
    {
      key: 'produk',
      label: 'Produk',
      icon: Shirt,
      total: productNames.length,
      hits: productNames.slice(0, LIMIT).map((name) => {
        const t = sum(stock.filter((s) => s.product_name === name));
        return { key: name, href: productHref(name), title: name, meta: <StockMeta {...t} /> };
      }),
    },
    {
      key: 'variant',
      label: 'Variant',
      icon: Package,
      total: variants.length,
      hits: variants.slice(0, LIMIT).map((v) => {
        const t = sum(stock.filter((s) => s.variant_id === v.id));
        return { key: v.id, href: productHref(v.product_name), title: v.sku, sub: variantLabel(v), meta: <StockMeta {...t} /> };
      }),
    },
  ];
}

/**
 * Every query word must match. Short words (1-2 letters, like a size "M") must start a word of
 * the text, so "kemeja m" finds size M and not every Kemeja; longer words may match anywhere
 * ("pth-m" inside a SKU).
 */
function matches(text: string, words: string[]) {
  const hay = text.toLowerCase();
  const tokens = hay.split(/[\s\-·/]+/);
  return words.every((w) => tokens.some((t) => t.startsWith(w)) || (w.length >= 3 && hay.includes(w)));
}

/**
 * Closest codes first: exact, then ending with the query (typing the tail of a number, "0001"
 * -> P-0000001), then starting with it, then anywhere. Ties keep the database order.
 */
function best<T extends { code: string }>(rows: T[], q: string): T[] {
  const n = q.toUpperCase();
  const rank = (code: string) => (code === n ? 0 : code.endsWith(n) ? 1 : code.startsWith(n) ? 2 : 3);
  return rows
    .map((r, i) => ({ r, i, k: rank(r.code.toUpperCase()) }))
    .sort((a, b) => a.k - b.k || a.i - b.i)
    .slice(0, LIMIT)
    .map((x) => x.r);
}

/* ---------- shortcuts, holders, rolls, reasons ---------- */

type Shortcut = { label: string; href: string; words: string[] };

/** Status words people type, mapped to the list that already filters for them. */
const SHORTCUTS: Shortcut[] = [
  { label: 'Flag selisih terbuka', href: '/selisih', words: ['selisih', 'kurang', 'hilang'] },
  { label: 'Pcs belum masuk rak', href: '/stok/pcs?tab=belum', words: ['belum di rak', 'belum rak', 'belum masuk rak'] },
  { label: 'Pcs reject', href: '/stok/pcs?tab=reject', words: ['reject', 'rusak', 'cacat'] },
  { label: 'Pcs dibatalkan', href: '/stok/pcs?tab=batal', words: ['dibatalkan', 'batal'] },
  { label: 'Label belum dicetak', href: '/label', words: ['belum dicetak', 'label', 'cetak'] },
  { label: 'WIP siap jahit', href: '/wip?status=siap_jahit', words: ['siap jahit'] },
  { label: 'WIP proses jahit', href: '/wip?status=proses_jahit', words: ['proses jahit', 'sedang jahit'] },
  { label: 'WIP siap finishing', href: '/wip?status=siap_finishing', words: ['siap finishing'] },
  { label: 'WIP proses finishing', href: '/wip?status=proses_finishing', words: ['proses finishing', 'sedang finishing', 'qc'] },
  { label: 'Semua WIP', href: '/wip', words: ['wip', 'dalam proses', 'belum jadi'] },
  { label: 'Stok barang jadi', href: '/stok', words: ['stok', 'ready stock', 'gudang'] },
  { label: 'Barang keluar', href: '/barang-keluar', words: ['barang keluar', 'surat jalan', 'kirim', 'retur'] },
];

/** A shortcut fits when every query word starts a word of one of its phrases ("jahit" -> siap/proses jahit). */
function shortcutFits(sc: Shortcut, words: string[]) {
  if (words.join(' ').length < 3) return false;
  return sc.words.some((phrase) => {
    const tokens = phrase.split(' ');
    return words.every((w) => tokens.some((t) => t.startsWith(w)));
  });
}

const HOLDER_TYPE: Record<string, string> = { penjahit: 'Penjahit', finishing: 'Finishing', produksi: 'Produksi', gudang: 'Gudang' };

async function searchMore(q: string): Promise<{ shortcuts: Shortcut[]; groups: Group[] }> {
  const words = q.toLowerCase().split(' ').filter(Boolean);
  const shortcuts = SHORTCUTS.filter((sc) => shortcutFits(sc, words));
  if (QR_TOKEN.test(q.toLowerCase())) return { shortcuts: [], groups: [] };

  const supabase = await createClient();
  // holders, rolls and reasons are short lists: match words in memory like variants
  const [holdersRes, rollsRes, reasonsRes, docsRes] = await Promise.all([
    supabase.from('holder').select('id, name, type').eq('is_active', true),
    supabase.from('fabric_roll').select('id, code, material, color, supplier').order('created_at', { ascending: false }).limit(1000),
    supabase.from('reason').select('id, type, code, label'),
    // Fase 2b: outbound documents by SJ code or destination (q has no commas or parens)
    supabase
      .from('outbound')
      .select('id, code, type, destination, status, created_at, shipped_at', { count: 'exact' })
      .or(`code.ilike.%${q}%,destination.ilike.%${q}%`)
      .order('created_at', { ascending: false })
      .limit(LIMIT),
  ]);
  const docs = (docsRes.data ?? []) as {
    id: string;
    code: string;
    type: OutboundType;
    destination: string;
    status: OutboundStatus;
    created_at: string;
    shipped_at: string | null;
  }[];
  const holders = ((holdersRes.data ?? []) as { id: string; name: string; type: string }[]).filter((h) => matches(h.name, words));
  const rolls = ((rollsRes.data ?? []) as { id: string; code: string; material: string; color: string; supplier: string | null }[]).filter((r) =>
    matches(`${r.code} ${r.material} ${r.color} ${r.supplier ?? ''}`, words),
  );
  const reasons = ((reasonsRes.data ?? []) as { id: string; type: 'reject' | 'selisih'; code: string; label: string }[]).filter((r) =>
    matches(`${r.label} ${r.code.replace(/_/g, ' ')}`, words),
  );

  const [held, rollBatches, reasonMoves] = await Promise.all([
    holders.length
      ? supabase.from('wip_list').select('current_holder_id, current_qty').in('current_holder_id', holders.map((h) => h.id))
      : Promise.resolve({ data: [] }),
    rolls.length
      ? supabase.from('production_batch').select('id, fabric_roll_id').in('fabric_roll_id', rolls.map((r) => r.id))
      : Promise.resolve({ data: [] }),
    reasons.length
      ? // effective_movement: the reason after any supervisor correction, keyed by the original scan id
        supabase.from('effective_movement').select('id, reason_id').in('reason_id', reasons.map((r) => r.id))
      : Promise.resolve({ data: [] }),
  ]);

  // reason impact: reject pieces made by those scans, open selisih flags raised by them
  const moves = (reasonMoves.data ?? []) as { id: string; reason_id: string }[];
  const reasonOf = new Map(moves.map((m) => [m.id, m.reason_id]));
  const moveIds = moves.map((m) => m.id);
  const [rejects, flags] = await Promise.all([
    moveIds.length
      ? supabase.from('piece').select('finish_movement_id').eq('grade', 'reject').eq('status', 'aktif').in('finish_movement_id', moveIds)
      : Promise.resolve({ data: [] }),
    moveIds.length
      ? supabase.from('discrepancy').select('movement_id, qty').eq('status', 'terbuka').in('movement_id', moveIds)
      : Promise.resolve({ data: [] }),
  ]);
  const rejectCount = new Map<string, number>();
  for (const p of (rejects.data ?? []) as { finish_movement_id: string }[]) {
    const rid = reasonOf.get(p.finish_movement_id)!;
    rejectCount.set(rid, (rejectCount.get(rid) ?? 0) + 1);
  }
  const flagStat = new Map<string, { n: number; qty: number }>();
  for (const f of (flags.data ?? []) as { movement_id: string; qty: number }[]) {
    const rid = reasonOf.get(f.movement_id)!;
    const e = flagStat.get(rid) ?? { n: 0, qty: 0 };
    flagStat.set(rid, { n: e.n + 1, qty: e.qty + f.qty });
  }

  const heldRows = (held.data ?? []) as { current_holder_id: string; current_qty: number }[];
  const batchesOf = new Map<string, string[]>();
  for (const b of (rollBatches.data ?? []) as { id: string; fabric_roll_id: string }[]) {
    batchesOf.set(b.fabric_roll_id, [...(batchesOf.get(b.fabric_roll_id) ?? []), b.id]);
  }

  const groups: Group[] = [
    {
      key: 'keluar',
      label: 'Barang keluar',
      icon: Truck,
      total: docsRes.count ?? docs.length,
      more: '/barang-keluar',
      hits: docs.map((d) => ({
        key: d.id,
        href: `/barang-keluar/${d.id}`,
        title: d.code,
        sub: `${OUTBOUND_TYPE[d.type].label} · ${d.destination}`,
        meta: (
          <>
            <Badge tone={OUTBOUND_STATUS[d.status].tone}>{OUTBOUND_STATUS[d.status].label}</Badge>
            <span className="num text-small text-text-muted">{dateFmt.format(new Date(d.shipped_at ?? d.created_at))}</span>
          </>
        ),
      })),
    },
    {
      key: 'pemegang',
      label: 'Penjahit / tim',
      icon: Users,
      total: holders.length,
      hits: holders.slice(0, LIMIT).map((h) => {
        const mine = heldRows.filter((x) => x.current_holder_id === h.id);
        const pcs = mine.reduce((n, x) => n + x.current_qty, 0);
        return {
          key: h.id,
          href: `/wip?pemegang=${h.id}`,
          title: h.name,
          sub: HOLDER_TYPE[h.type] ?? h.type,
          meta: (
            <span className="num text-small text-text-muted">
              {mine.length === 0 ? 'Tidak memegang bundle' : `${mine.length} bundle · ${pcs} pcs dipegang`}
            </span>
          ),
        };
      }),
    },
    {
      key: 'rol',
      label: 'Rol kain',
      icon: Scroll,
      total: rolls.length,
      hits: rolls.slice(0, LIMIT).map((r) => {
        const ids = batchesOf.get(r.id) ?? [];
        return {
          key: r.id,
          // one batch: open it; several: the batch list filtered to this roll
          href: ids.length === 1 ? `/batch/${ids[0]}` : `/batch?rol=${r.id}`,
          title: r.code,
          sub: `${r.material} ${r.color}${r.supplier ? ` · ${r.supplier}` : ''}`,
          meta: <span className="num text-small text-text-muted">{ids.length === 0 ? 'Belum dipotong' : `${ids.length} batch`}</span>,
        };
      }),
    },
    {
      key: 'alasan',
      label: 'Alasan',
      icon: CircleAlert,
      total: reasons.length,
      hits: reasons.slice(0, LIMIT).map((r) => {
        const flag = flagStat.get(r.id);
        const rej = rejectCount.get(r.id) ?? 0;
        return {
          key: r.id,
          href: r.type === 'reject' ? `/stok/pcs?tab=reject&alasan=${r.id}` : `/selisih?alasan=${r.id}`,
          title: r.label,
          sub: r.type === 'reject' ? 'Alasan reject' : 'Alasan selisih',
          meta: (
            <span className="num text-small text-text-muted">
              {r.type === 'reject'
                ? `${rej} pcs reject`
                : flag
                  ? `${flag.n} flag terbuka · ${flag.qty} pcs`
                  : 'Tidak ada flag terbuka'}
            </span>
          ),
        };
      }),
    },
  ];
  return { shortcuts, groups };
}

function Shortcuts({ items }: { items: Shortcut[] }) {
  return (
    <section className="mt-3 rounded-lg border border-border bg-surface px-5 py-4">
      <h2 className="flex items-center gap-2 text-h3">
        <Zap size={20} strokeWidth={1.5} aria-hidden className="text-text-muted" /> Jalan pintas
      </h2>
      <ul className="mt-3 flex flex-wrap gap-2">
        {items.map((s) => (
          <li key={s.href}>
            <Link
              href={s.href}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-small font-medium text-primary hover:border-primary hover:bg-primary-soft"
            >
              {s.label}
              <ChevronRight size={14} strokeWidth={1.5} aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

const PIECE = 'code, grade, status, location:location(code), variant:product_variant(product_name, size, color)';
const BUNDLE = 'id, code, current_status, current_qty, variant:product_variant(product_name, size, color), batch:production_batch(code)';

type PieceRow = {
  code: string;
  grade: 'baik' | 'reject';
  status: 'aktif' | 'batal';
  location: { code: string } | null;
  variant: { product_name: string; size: string; color: string } | null;
};
type BundleRow = {
  id: string;
  code: string;
  current_status: BundleStatus;
  current_qty: number;
  variant: { product_name: string; size: string; color: string } | null;
  batch: { code: string } | null;
};

function StockMeta({ baik, reject, belum }: { baik: number; reject: number; belum: number }) {
  return (
    <span className="num text-small text-text-muted">
      <span className="text-text">{baik}</span> stok
      {belum > 0 && <span className="text-warning"> · {belum} belum di rak</span>}
      {reject > 0 && <> · {reject} reject</>}
    </span>
  );
}

function ResultGroup({ group: g }: { group: Group }) {
  const Icon = g.icon;
  return (
    <section className="overflow-hidden rounded-lg border border-border bg-surface">
      <h2 className="flex items-center gap-2 px-5 pt-4 pb-3 text-h3">
        <Icon size={20} strokeWidth={1.5} aria-hidden className="text-text-muted" />
        {g.label}
        <span className="num rounded-sm bg-surface-muted px-1.5 text-caption text-text-muted">{g.total}</span>
      </h2>
      <ul className="divide-y divide-border border-t border-border">
        {g.hits.map((h) => (
          <li key={h.key}>
            <Link href={h.href} className="group flex items-center gap-3 px-5 py-3 hover:bg-surface-muted">
              <div className="min-w-0 flex-1">
                <p className="num link-code inline">{h.title}</p>
                {h.sub && <p className="truncate text-small text-text-muted">{h.sub}</p>}
                {/* phones: status and numbers go under the text so the text is not cut off */}
                {h.meta && <div className="mt-1 flex flex-wrap items-center gap-2 sm:hidden">{h.meta}</div>}
              </div>
              {h.meta && <div className="flex shrink-0 items-center gap-2 max-sm:hidden">{h.meta}</div>}
              <ChevronRight size={16} strokeWidth={1.5} aria-hidden className="shrink-0 text-text-subtle group-hover:text-text-muted" />
            </Link>
          </li>
        ))}
      </ul>
      {g.total > g.hits.length && (
        <p className="border-t border-border px-5 py-2.5 text-small text-text-muted">
          {g.more ? (
            <Link href={g.more} className="font-medium text-primary hover:underline">
              Lihat semua {g.total} {g.label.toLowerCase()}
            </Link>
          ) : (
            <>
              +<span className="num">{g.total - g.hits.length}</span> lagi. Ketik lebih lengkap untuk mempersempit.
            </>
          )}
        </p>
      )}
    </section>
  );
}

function Hints({ short }: { short: boolean }) {
  const examples = [
    { q: 'P-0000123', what: 'pcs' },
    { q: 'B-00001', what: 'bundle' },
    { q: 'BT-0001', what: 'batch' },
    { q: 'A1', what: 'rak' },
    { q: 'Kemeja', what: 'produk' },
    { q: 'KMJ-PTH-M', what: 'variant (SKU)' },
    { q: 'Ani', what: 'yang dipegang penjahit' },
    { q: 'R-DEV-001', what: 'rol kain' },
    { q: 'jahitan', what: 'alasan reject' },
    { q: 'belum di rak', what: 'jalan pintas' },
  ];
  return (
    <div className="mx-auto max-w-3xl rounded-lg border border-border bg-surface p-5">
      <p className="text-text-muted">{short ? `Ketik minimal ${MIN_LENGTH} karakter.` : 'Contoh yang bisa dicari:'}</p>
      <ul className="mt-3 flex flex-wrap gap-2">
        {examples.map((e) => (
          <li key={e.q}>
            <Link
              href={`/lacak?q=${encodeURIComponent(e.q)}`}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-small hover:border-border-strong"
            >
              <span className="num font-medium">{e.q}</span>
              <span className="text-text-muted">{e.what}</span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-small text-text-muted">Untuk mengubah data master (user, rak, variant, alasan), buka menu Master data.</p>
    </div>
  );
}

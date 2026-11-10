import type { Metadata } from 'next';
import Link from 'next/link';
import { Boxes, ChevronRight, Layers, Package, Shirt, Tag, Warehouse, type LucideIcon } from 'lucide-react';
import { Badge, StatusBadge } from '@/components/ui/status-badge';
import { cn } from '@/lib/cn';
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
 * One search over production and stock: pcs, bundles, batches, racks, products and variants.
 * Master data (rolls, users, holders, reasons) is not searched here. A 32-character QR token
 * (handheld scanner) jumps to the exact bundle, pcs or rack.
 */
export default async function LacakPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const raw = ((await searchParams).q ?? '').trim().slice(0, 64);
  // ilike wildcards and filter syntax are stripped; codes only use letters, digits and '-'
  const q = raw.replace(/[%_\\,()"']/g, '').replace(/\s+/g, ' ');
  const groups = q.length >= MIN_LENGTH ? await search(q) : [];
  const found = groups.reduce((n, g) => n + g.total, 0);

  return (
    <>
      <h1 className="text-h1">Lacak</h1>
      <p className="mt-1 text-text-muted">Cari apa saja di produksi dan stok. Ketik kode, SKU, atau nama produk, atau scan label.</p>

      <div className="mt-6">
        <LacakBox />
      </div>

      {q.length < MIN_LENGTH ? (
        <Hints short={q.length > 0} />
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
              </div>
              <div className="flex shrink-0 items-center gap-2">{h.meta}</div>
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
  ];
  return (
    <div className="mt-6 rounded-lg border border-border bg-surface p-5">
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
      <p className="mt-4 text-small text-text-muted">Master data (rol kain, user, penjahit, alasan) diatur di menu Master data.</p>
    </div>
  );
}

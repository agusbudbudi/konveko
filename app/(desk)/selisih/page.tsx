import type { Metadata } from 'next';
import Link from 'next/link';
import { InlineAlert } from '@/components/ui/inline-alert';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Selisih' };

type Row = {
  id: string;
  qty: number;
  from_step: string;
  to_step: string;
  created_at: string;
  bundle: { id: string; code: string; batch: { code: string } | null } | null;
  movement: { reason_id: string | null; scanned_by: string } | null;
};

const timeFmt = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });

// FR-22: supervisor work list of open selisih flags. Resolving happens on the bundle page.
export default async function SelisihPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('discrepancy')
    .select('id, qty, from_step, to_step, created_at, bundle:bundle(id, code, batch:production_batch(code)), movement:movement(reason_id, scanned_by)')
    .eq('status', 'terbuka')
    .order('created_at', { ascending: false })
    .limit(200);
  const rows = (data ?? []) as unknown as Row[];

  const { data: reasons } = await supabase.from('reason').select('id, label');
  const reasonLabel = new Map((reasons ?? []).map((r) => [r.id, r.label]));
  const scannerIds = [...new Set(rows.map((r) => r.movement?.scanned_by).filter(Boolean))] as string[];
  const { data: names } = scannerIds.length ? await supabase.rpc('staff_names', { p_ids: scannerIds }) : { data: [] };
  const nameOf = new Map(((names ?? []) as { id: string; name: string }[]).map((n) => [n.id, n.name]));
  const total = rows.reduce((n, r) => n + r.qty, 0);

  return (
    <>
      <h1 className="text-h1">Selisih</h1>
      <p className="mt-1 text-text-muted">
        <span className="num text-text">{rows.length}</span> flag terbuka, total <span className="num text-warning">{total}</span> pcs
      </p>

      {error && <InlineAlert tone="danger" className="mt-6">Data gagal dimuat. Muat ulang halaman.</InlineAlert>}

      <div className="mt-6 overflow-hidden rounded-lg border border-border bg-surface">
        {rows.length === 0 ? (
          <p className="p-5 text-text-muted">Tidak ada flag selisih terbuka.</p>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((r) => (
              <li key={r.id} className="border-l-[3px] border-l-warning hover:bg-surface-muted">
                <Link href={r.bundle ? `/bundle/${r.bundle.id}` : '#'} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                  <div>
                    <p>
                      <span className="num font-medium text-primary">{r.bundle?.code}</span>
                      <span className="num ml-2 text-small text-text-muted">{r.bundle?.batch?.code}</span>
                    </p>
                    <p className="text-small text-text-muted">
                      {r.from_step} → {r.to_step} · {timeFmt.format(new Date(r.created_at))}
                      {r.movement?.scanned_by && <> · diterima {nameOf.get(r.movement.scanned_by) ?? '-'}</>}
                      {r.movement?.reason_id && <> · {reasonLabel.get(r.movement.reason_id)}</>}
                    </p>
                  </div>
                  <p className="num text-h3 text-warning">−{r.qty} pcs</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

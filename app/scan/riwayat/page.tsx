import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { History } from 'lucide-react';
import { cn } from '@/lib/cn';
import { addDays, todayJakarta } from '@/lib/report';
import { isWarehouseOnly } from '@/lib/scan/nav';
import { createClient, getCurrentAppUser } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Riwayat scan' };

type Row = {
  id: string;
  type: 'receive_sew' | 'receive_finishing' | 'finish_sew' | 'finish_finishing';
  qty_sent: number | null;
  qty_received: number | null;
  qty_good: number | null;
  qty_reject: number | null;
  scanned_at: string;
  bundle: { id: string; code: string; variant: { product_name: string; size: string; color: string } | null } | null;
};

const TIME = new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
const HOUR = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Jakarta' });

function describe(r: Row): { text: string; tone: 'muted' | 'warning' | 'danger' } {
  if (r.type === 'receive_sew' || r.type === 'receive_finishing') {
    const short = (r.qty_sent ?? 0) - (r.qty_received ?? 0);
    return short > 0
      ? { text: `Diterima ${r.qty_received} dari ${r.qty_sent} · selisih ${short}`, tone: 'warning' }
      : { text: `Diterima ${r.qty_received} pcs`, tone: 'muted' };
  }
  const good = r.type === 'finish_finishing' ? 'lolos QC' : 'jadi';
  return {
    text: `Selesai ${r.qty_good} ${good}${r.qty_reject ? `, ${r.qty_reject} reject` : ''}`,
    tone: r.qty_reject ? 'danger' : 'muted',
  };
}

/**
 * Riwayat tab: the signed-in person's own scans today or yesterday, newest first,
 * grouped by hour, with totals on top. Read only (corrections stay on the desk).
 */
export default async function ScanHistoryPage({ searchParams }: { searchParams: Promise<{ hari?: string }> }) {
  const user = await getCurrentAppUser();
  if (!user) redirect('/login?next=/scan/riwayat');
  if (isWarehouseOnly(user.roles)) redirect('/scan/gudang');

  const { hari } = await searchParams;
  const yesterday = hari === 'kemarin';
  const day = yesterday ? addDays(todayJakarta(), -1) : todayJakarta();
  const from = new Date(`${day}T00:00:00+07:00`).toISOString();
  const to = new Date(`${addDays(day, 1)}T00:00:00+07:00`).toISOString();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('movement')
    .select('id, type, qty_sent, qty_received, qty_good, qty_reject, scanned_at, bundle:bundle(id, code, variant:product_variant(product_name, size, color))')
    .eq('scanned_by', user.id)
    .eq('is_void', false)
    .in('type', ['receive_sew', 'receive_finishing', 'finish_sew', 'finish_finishing'])
    .gte('scanned_at', from)
    .lt('scanned_at', to)
    .order('scanned_at', { ascending: false })
    .limit(300);
  const rows = (data ?? []) as unknown as Row[];

  const totals = { received: 0, good: 0, reject: 0 };
  for (const r of rows) {
    if (r.type.startsWith('receive')) totals.received += r.qty_received ?? 0;
    else {
      totals.good += r.qty_good ?? 0;
      totals.reject += r.qty_reject ?? 0;
    }
  }

  const groups: { hour: string; rows: Row[] }[] = [];
  for (const r of rows) {
    const hour = HOUR.format(new Date(r.scanned_at));
    const g = groups[groups.length - 1];
    if (g && g.hour === hour) g.rows.push(r);
    else groups.push({ hour, rows: [r] });
  }

  return (
    <main className="flex flex-1 flex-col gap-4 px-4 pt-4 pb-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-h2">Riwayat scan</h1>
      </div>

      <nav aria-label="Hari" className="grid grid-cols-2 gap-1 rounded-md bg-surface-muted p-1">
        {[
          { href: '/scan/riwayat', label: 'Hari ini', on: !yesterday },
          { href: '/scan/riwayat?hari=kemarin', label: 'Kemarin', on: yesterday },
        ].map((t) => (
          <Link
            key={t.label}
            href={t.href}
            aria-current={t.on ? 'page' : undefined}
            className={cn(
              'flex h-10 items-center justify-center rounded-sm text-small',
              t.on ? 'border border-border-strong bg-surface font-semibold' : 'font-medium text-text-muted',
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      <section aria-label="Ringkasan" className="grid grid-cols-3 rounded-lg border border-border bg-surface">
        {[
          { label: 'Diterima', value: totals.received },
          { label: 'Jadi', value: totals.good },
          { label: 'Reject', value: totals.reject, danger: true },
        ].map((k, i) => (
          <div key={k.label} className={cn('px-3 py-2.5', i > 0 && 'border-l border-border')}>
            <p className="text-caption text-text-muted">{k.label}</p>
            <p className={cn('num text-h1', k.danger && k.value > 0 && 'text-danger')}>{k.value}</p>
          </div>
        ))}
      </section>

      {error ? (
        <p className="rounded-md bg-danger-soft px-3 py-2.5 text-small text-danger">Riwayat gagal dimuat. Muat ulang halaman ini.</p>
      ) : groups.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border-strong bg-surface px-6 py-10 text-center text-text-muted">
          <History size={28} strokeWidth={1.5} aria-hidden />
          <p className="text-small">{yesterday ? 'Tidak ada scan kemarin.' : 'Belum ada scan hari ini.'}</p>
        </div>
      ) : (
        groups.map((g) => (
          <section key={g.hour} className="flex flex-col gap-1.5">
            <h2 className="num text-caption text-text-muted">
              {g.hour}.00 – {String((Number(g.hour) + 1) % 24).padStart(2, '0')}.00
            </h2>
            <ul className="rounded-lg border border-border bg-surface">
              {g.rows.map((r, i) => {
                const d = describe(r);
                const v = r.bundle?.variant;
                return (
                  <li key={r.id} className={cn('flex items-center gap-3 px-3 py-2.5', i > 0 && 'border-t border-border')}>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-small">
                        <span className="num font-semibold">{r.bundle?.code}</span>
                        {v && (
                          <>
                            {' '}
                            · {v.product_name} {v.size}
                          </>
                        )}
                      </p>
                      <p
                        className={cn(
                          'num truncate text-small',
                          d.tone === 'warning' ? 'text-warning' : d.tone === 'danger' ? 'text-danger' : 'text-text-muted',
                        )}
                      >
                        {d.text}
                      </p>
                    </div>
                    <span className="num shrink-0 text-caption text-text-muted">{TIME.format(new Date(r.scanned_at))}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </main>
  );
}

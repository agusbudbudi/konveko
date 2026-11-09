import type { Metadata } from 'next';
import Link from 'next/link';
import { Printer } from 'lucide-react';
import { MasterList } from '@/components/master/master-list';
import { Badge } from '@/components/ui/status-badge';
import { createClient, getCurrentAppUser } from '@/lib/supabase/server';
import { saveLocation, setActive } from '../actions';

export const metadata: Metadata = { title: 'Rak' };

const KIND_LABEL: Record<string, string> = { stok: 'Stok', reject: 'Reject' };

export default async function RackPage() {
  const supabase = await createClient();
  const user = await getCurrentAppUser();
  const [{ data }, { data: counts }] = await Promise.all([
    supabase.from('location').select('*').order('code'),
    supabase.from('stock_location').select('location_id, qty').not('location_id', 'is', null),
  ]);
  const qty = new Map<string, number>();
  for (const c of counts ?? []) qty.set(c.location_id, (qty.get(c.location_id) ?? 0) + c.qty);
  const activeCount = (data ?? []).filter((l) => l.is_active).length;

  return (
    <MasterList
      title="Rak"
      description="Tempat barang jadi di gudang. Rak reject hanya menerima barang reject."
      addLabel="Tambah rak"
      noun="rak"
      canEdit={user?.roles.includes('admin') ?? false}
      headerExtra={
        activeCount > 0 && (
          <Link
            href="/print/racks"
            className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-surface px-4 font-medium text-text hover:border-border-strong"
          >
            <Printer size={16} strokeWidth={1.5} aria-hidden /> Cetak label rak
          </Link>
        )
      }
      columns={['Kode', 'Jenis', 'Isi', 'Catatan']}
      fields={[
        { name: 'code', label: 'Kode rak', required: true, mono: true, placeholder: 'A1', hint: 'Huruf dan angka, tanpa spasi.' },
        {
          name: 'kind',
          label: 'Jenis',
          type: 'select',
          required: true,
          options: Object.entries(KIND_LABEL).map(([value, label]) => ({ value, label })),
        },
        { name: 'note', label: 'Catatan', placeholder: 'Dekat pintu', span: 2 },
      ]}
      action={saveLocation}
      onToggleActive={setActive.bind(null, 'location')}
      empty="Belum ada rak. Tambah rak dulu sebelum gudang mulai scan."
      rows={(data ?? []).map((l) => ({
        id: l.id,
        active: l.is_active,
        values: { code: l.code, kind: l.kind, note: l.note },
        cells: [
          <Link key="c" href={`/stok/rak/${l.code}`} className="num font-medium text-primary hover:underline">
            {l.code}
          </Link>,
          <Badge key="k" tone={l.kind === 'reject' ? 'danger' : 'neutral'}>
            {KIND_LABEL[l.kind]}
          </Badge>,
          <span key="q" className="num">{qty.get(l.id) ?? 0} pcs</span>,
          l.note ?? '-',
        ],
      }))}
    />
  );
}

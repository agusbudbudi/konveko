import type { Metadata } from 'next';
import { MasterList } from '@/components/master/master-list';
import { createClient, getCurrentAppUser } from '@/lib/supabase/server';
import { saveRoll } from '../actions';

export const metadata: Metadata = { title: 'Rol kain' };

export default async function RollPage() {
  const supabase = await createClient();
  const user = await getCurrentAppUser();
  const { data } = await supabase.from('fabric_roll').select('*').order('created_at', { ascending: false });

  return (
    <MasterList
      title="Rol kain"
      description="Satu rol menjadi satu batch produksi."
      addLabel="Tambah rol"
      canEdit={user?.roles.includes('admin') ?? false}
      columns={['Kode', 'Bahan', 'Warna', 'Ukuran', 'Supplier']}
      fields={[
        { name: 'code', label: 'Kode rol', required: true, mono: true, placeholder: 'R-001' },
        { name: 'material', label: 'Bahan', required: true, placeholder: 'Katun' },
        { name: 'color', label: 'Warna', required: true, placeholder: 'Putih' },
        { name: 'supplier', label: 'Supplier' },
        { name: 'length_or_weight', label: 'Panjang atau berat', type: 'decimal', placeholder: '50' },
        { name: 'unit', label: 'Satuan', type: 'select', options: [{ value: 'm', label: 'meter' }, { value: 'kg', label: 'kg' }] },
      ]}
      action={saveRoll}
      rows={(data ?? []).map((r) => ({
        id: r.id,
        values: {
          code: r.code,
          material: r.material,
          color: r.color,
          supplier: r.supplier,
          length_or_weight: r.length_or_weight,
          unit: r.unit,
        },
        cells: [
          <span key="c" className="num">{r.code}</span>,
          r.material,
          r.color,
          r.length_or_weight ? <span key="l" className="num">{Number(r.length_or_weight)} {r.unit}</span> : '-',
          r.supplier ?? '-',
        ],
      }))}
    />
  );
}

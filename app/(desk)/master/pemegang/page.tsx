import type { Metadata } from 'next';
import { MasterList } from '@/components/master/master-list';
import { createClient, getCurrentAppUser } from '@/lib/supabase/server';
import { saveHolder, setActive } from '../actions';

export const metadata: Metadata = { title: 'Penjahit dan tim' };

const TYPE_LABEL: Record<string, string> = { penjahit: 'Penjahit', finishing: 'Tim finishing', produksi: 'Produksi', gudang: 'Gudang' };

export default async function HolderPage() {
  const supabase = await createClient();
  const user = await getCurrentAppUser();
  const { data } = await supabase.from('holder').select('*').order('type').order('name');

  return (
    <MasterList
      title="Penjahit dan tim"
      addLabel="Tambah"
      canEdit={user?.roles.includes('admin') ?? false}
      columns={['Nama', 'Jenis', 'Nomor HP']}
      fields={[
        { name: 'name', label: 'Nama', required: true },
        {
          name: 'type',
          label: 'Jenis',
          type: 'select',
          required: true,
          options: Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label })),
        },
        { name: 'phone', label: 'Nomor HP', mono: true, placeholder: '0812 3456 7890' },
      ]}
      action={saveHolder}
      onToggleActive={setActive.bind(null, 'holder')}
      rows={(data ?? []).map((h) => ({
        id: h.id,
        active: h.is_active,
        values: { name: h.name, type: h.type, phone: h.phone },
        cells: [h.name, TYPE_LABEL[h.type] ?? h.type, h.phone ? <span key="p" className="num">{h.phone}</span> : '-'],
      }))}
    />
  );
}

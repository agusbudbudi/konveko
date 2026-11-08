import type { Metadata } from 'next';
import { MasterList } from '@/components/master/master-list';
import { createClient, getCurrentAppUser } from '@/lib/supabase/server';
import { saveReason, setActive } from '../actions';

export const metadata: Metadata = { title: 'Alasan' };

export default async function ReasonPage() {
  const supabase = await createClient();
  const user = await getCurrentAppUser();
  const { data } = await supabase.from('reason').select('*').order('type').order('label');

  return (
    <MasterList
      title="Alasan"
      description="Pilihan alasan saat scan terima (selisih) dan scan selesai (reject)."
      addLabel="Tambah alasan"
      canEdit={user?.roles.includes('admin') ?? false}
      columns={['Label', 'Jenis', 'Kode']}
      fields={[
        { name: 'label', label: 'Label', required: true, span: 2, placeholder: 'Jahitan rusak atau miring', hint: 'Teks yang muncul di pilihan alasan saat scan.' },
        {
          name: 'type',
          label: 'Jenis',
          type: 'select',
          required: true,
          options: [
            { value: 'selisih', label: 'Selisih (scan terima)' },
            { value: 'reject', label: 'Reject (scan selesai)' },
          ],
        },
        { name: 'code', label: 'Kode', required: true, mono: true, placeholder: 'JAHITAN' },
      ]}
      action={saveReason}
      onToggleActive={setActive.bind(null, 'reason')}
      rows={(data ?? []).map((r) => ({
        id: r.id,
        active: r.is_active,
        values: { label: r.label, type: r.type, code: r.code },
        cells: [r.label, r.type === 'selisih' ? 'Selisih' : 'Reject', <span key="c" className="num">{r.code}</span>],
      }))}
    />
  );
}

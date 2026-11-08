import type { Metadata } from 'next';
import { MasterList } from '@/components/master/master-list';
import { createClient, getCurrentAppUser } from '@/lib/supabase/server';
import { saveVariant, setActive } from '../actions';

export const metadata: Metadata = { title: 'Variant' };

export default async function VariantPage() {
  const supabase = await createClient();
  const user = await getCurrentAppUser();
  const { data } = await supabase.from('product_variant').select('*').order('product_name').order('sku');

  return (
    <MasterList
      title="Variant"
      addLabel="Tambah variant"
      canEdit={user?.roles.includes('admin') ?? false}
      columns={['SKU', 'Produk', 'Ukuran', 'Warna']}
      fields={[
        { name: 'sku', label: 'SKU', required: true, mono: true, placeholder: 'KMJ-PTH-M', hint: 'Unik per variant. Huruf, angka, dan tanda minus.' },
        { name: 'product_name', label: 'Nama produk', required: true, placeholder: 'Kemeja' },
        { name: 'size', label: 'Ukuran', required: true, placeholder: 'M' },
        { name: 'color', label: 'Warna', required: true, placeholder: 'Putih' },
      ]}
      action={saveVariant}
      onToggleActive={setActive.bind(null, 'product_variant')}
      rows={(data ?? []).map((v) => ({
        id: v.id,
        active: v.is_active,
        values: { sku: v.sku, product_name: v.product_name, size: v.size, color: v.color },
        cells: [<span key="s" className="num">{v.sku}</span>, v.product_name, v.size, v.color],
      }))}
    />
  );
}

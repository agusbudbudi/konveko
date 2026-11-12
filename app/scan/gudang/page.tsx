import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentAppUser } from '@/lib/supabase/server';
import { ModeTabs } from './mode-tabs';
import { WarehouseScan } from './warehouse-scan';

export const metadata: Metadata = { title: 'Scan gudang' };

export default async function WarehouseScanPage() {
  const user = await getCurrentAppUser();
  if (!user) redirect('/login?next=/scan/gudang');
  return (
    <>
      <ModeTabs active="masuk" roles={user.roles} />
      <WarehouseScan canShelve={user.roles.some((r) => r === 'gudang' || r === 'supervisor')} />
    </>
  );
}

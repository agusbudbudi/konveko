import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentAppUser } from '@/lib/supabase/server';
import { ModeTabs } from '../mode-tabs';
import { ReturnScan } from './return-scan';

export const metadata: Metadata = { title: 'Scan retur' };

export default async function ReturnScanPage() {
  const user = await getCurrentAppUser();
  if (!user) redirect('/login?next=/scan/gudang/retur');
  return (
    <>
      <ModeTabs active="retur" roles={user.roles} />
      <ReturnScan canWork={user.roles.some((r) => r === 'gudang' || r === 'supervisor')} />
    </>
  );
}

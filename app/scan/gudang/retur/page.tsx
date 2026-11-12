import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentAppUser } from '@/lib/supabase/server';
import { ReturnScan } from './return-scan';

export const metadata: Metadata = { title: 'Scan retur' };

export default async function ReturnScanPage() {
  const user = await getCurrentAppUser();
  if (!user) redirect('/login?next=/scan/gudang/retur');
  return (
    <>
      <ReturnScan canWork={user.roles.some((r) => r === 'gudang' || r === 'supervisor')} />
    </>
  );
}

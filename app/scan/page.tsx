import { redirect } from 'next/navigation';
import { isWarehouseOnly } from '@/lib/scan/nav';
import { createClient, getCurrentAppUser } from '@/lib/supabase/server';
import type { Reason } from '@/lib/types';
import { ScanApp } from './scan-app';

export default async function ScanPage() {
  const user = await getCurrentAppUser();
  if (!user) redirect('/login?next=/scan');
  // warehouse staff only scan racks, bundles, and pieces
  if (isWarehouseOnly(user.roles)) redirect('/scan/gudang');

  const supabase = await createClient();
  const { data: reasons } = await supabase
    .from('reason')
    .select('id, type, label')
    .eq('is_active', true)
    .order('label');

  return <ScanApp userId={user.id} reasons={(reasons ?? []) as Reason[]} />;
}

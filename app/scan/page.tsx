import { redirect } from 'next/navigation';
import { createClient, getCurrentAppUser } from '@/lib/supabase/server';
import type { Reason } from '@/lib/types';
import { ScanApp } from './scan-app';

export default async function ScanPage() {
  const user = await getCurrentAppUser();
  if (!user) redirect('/login?next=/scan');
  // warehouse staff only scan racks, bundles, and pieces
  if (user.roles.includes('gudang') && !user.roles.some((r) => r === 'penjahit' || r === 'finishing')) {
    redirect('/scan/gudang');
  }

  const supabase = await createClient();
  const { data: reasons } = await supabase
    .from('reason')
    .select('id, type, label')
    .eq('is_active', true)
    .order('label');

  return <ScanApp userId={user.id} reasons={(reasons ?? []) as Reason[]} />;
}

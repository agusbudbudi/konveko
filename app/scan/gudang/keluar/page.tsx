import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { UUID } from '@/lib/master';
import { NONE } from '@/lib/paging';
import type { OutboundProgress, OutboundType } from '@/lib/outbound';
import { createClient, getCurrentAppUser } from '@/lib/supabase/server';
import { ModeTabs } from '../mode-tabs';
import { OutboundScan, type DraftDoc } from './outbound-scan';

export const metadata: Metadata = { title: 'Scan barang keluar' };

export default async function OutboundScanPage({ searchParams }: { searchParams: Promise<{ doc?: string }> }) {
  const user = await getCurrentAppUser();
  if (!user) redirect('/login?next=/scan/gudang/keluar');
  const canWork = user.roles.some((r) => r === 'gudang' || r === 'supervisor');
  const isSupervisor = user.roles.includes('supervisor');
  const { doc } = await searchParams;

  const supabase = await createClient();
  const { data } = await supabase
    .from('outbound')
    .select('id, code, type, destination, ref_no')
    .eq('status', 'draft')
    .order('created_at', { ascending: false })
    .limit(30);
  const drafts = ((data ?? []) as Omit<DraftDoc, 'total'>[]).filter((d) => d.type !== 'penyesuaian' || isSupervisor);
  const { data: items } = await supabase
    .from('outbound_item')
    .select('outbound_id')
    .is('returned_at', null)
    .in('outbound_id', drafts.length ? drafts.map((d) => d.id) : [NONE]);
  const totals = new Map<string, number>();
  for (const i of (items ?? []) as { outbound_id: string }[]) totals.set(i.outbound_id, (totals.get(i.outbound_id) ?? 0) + 1);
  const docs: DraftDoc[] = drafts.map((d) => ({ ...d, type: d.type as OutboundType, total: totals.get(d.id) ?? 0 }));

  const selected = doc && UUID.test(doc) ? docs.find((d) => d.id === doc) ?? null : null;
  const { data: progress } = selected ? await supabase.rpc('outbound_progress', { p_outbound_id: selected.id }) : { data: null };

  return (
    <>
      <ModeTabs active="keluar" />
      <OutboundScan
        key={selected?.id ?? 'pick'}
        canWork={canWork}
        drafts={docs}
        selected={selected}
        initialProgress={(progress ?? []) as OutboundProgress}
      />
    </>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { SetCrumb } from '@/components/nav/sidebar-nav';
import { InlineAlert } from '@/components/ui/inline-alert';
import { createClient, getCurrentAppUser } from '@/lib/supabase/server';
import { NewOutboundForm } from './new-outbound-form';

export const metadata: Metadata = { title: 'Dokumen baru' };

export default async function NewOutboundPage() {
  const me = await getCurrentAppUser();
  const roles = me?.roles ?? [];
  const canCreate = roles.some((r) => r === 'gudang' || r === 'supervisor');
  const isSupervisor = roles.includes('supervisor');

  const supabase = await createClient();
  const [{ data: variants }, { data: past }] = await Promise.all([
    supabase.from('product_variant').select('id, sku, product_name, size, color').eq('is_active', true).order('product_name').order('sku'),
    supabase.from('outbound').select('destination').order('created_at', { ascending: false }).limit(200),
  ]);
  const destinations = [...new Set(((past ?? []) as { destination: string }[]).map((d) => d.destination))].slice(0, 50);

  return (
    <>
      <SetCrumb items={[{ label: 'Dokumen baru' }]} />
      <Link href="/barang-keluar" className="inline-flex h-10 items-center gap-2 text-small text-text-muted hover:text-text lg:hidden">
        <ArrowLeft size={16} strokeWidth={1.5} aria-hidden /> Barang keluar
      </Link>
      <h1 className="text-h1">Dokumen baru</h1>
      <p className="mt-1 text-text-muted">Buat surat jalan, lalu scan barangnya di gudang.</p>
      {canCreate ? (
        <NewOutboundForm
          isSupervisor={isSupervisor}
          destinations={destinations}
          variants={(variants ?? []).map((v) => ({ value: v.id, label: `${v.product_name} ${v.size} · ${v.color}`, hint: v.sku }))}
        />
      ) : (
        <InlineAlert tone="info" className="mt-6">
          Hanya akun gudang atau supervisor yang bisa membuat dokumen barang keluar.
        </InlineAlert>
      )}
    </>
  );
}

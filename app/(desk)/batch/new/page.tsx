import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { InlineAlert } from '@/components/ui/inline-alert';
import { createClient, getCurrentAppUser } from '@/lib/supabase/server';
import { NewBatchForm } from './new-batch-form';

export const metadata: Metadata = { title: 'Batch baru' };

export default async function NewBatchPage() {
  const user = await getCurrentAppUser();
  const supabase = await createClient();
  const [rolls, variants] = await Promise.all([
    supabase.from('fabric_roll').select('id, code, material, color').order('created_at', { ascending: false }),
    supabase.from('product_variant').select('id, sku, product_name, size, color').eq('is_active', true).order('sku'),
  ]);

  return (
    <div className="max-w-3xl">
      <Link href="/batch" className="inline-flex h-10 items-center gap-2 text-small text-text-muted hover:text-text">
        <ArrowLeft size={16} strokeWidth={1.5} aria-hidden /> Batch
      </Link>
      <h1 className="mt-2 text-h1">Batch baru</h1>
      <p className="mt-1 text-text-muted">Satu rol kain, hasil potong per variant. Sistem membuat satu bundle per variant.</p>

      {!user?.roles.includes('produksi') ? (
        <InlineAlert tone="warning" className="mt-6">Hanya role produksi yang bisa membuat batch.</InlineAlert>
      ) : (rolls.data ?? []).length === 0 || (variants.data ?? []).length === 0 ? (
        <InlineAlert tone="warning" className="mt-6">Belum ada data rol kain atau variant. Minta admin mengisi master data dulu.</InlineAlert>
      ) : (
        <NewBatchForm rolls={rolls.data ?? []} variants={variants.data ?? []} />
      )}
    </div>
  );
}

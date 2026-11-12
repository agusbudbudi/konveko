import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, Printer } from 'lucide-react';
import { InlineAlert } from '@/components/ui/inline-alert';
import { Badge, StatusBadge } from '@/components/ui/status-badge';
import { ReconciliationBar, ReconciliationLegend, type Recon } from '@/components/recon/reconciliation-bar';
import { createClient, getCurrentAppUser } from '@/lib/supabase/server';
import { BATCH_STATUS, type BundleStatus } from '@/lib/types';
import { SplitButton } from './split-button';
import { AddBundleButton, EditBundleButton, type VariantOption } from './edit-bundle';
import { SetCrumb } from '@/components/nav/sidebar-nav';
import { PageHeader } from '@/components/ui/page-header';
import { UrlPagination } from '@/components/ui/pagination';
import { slicePage, withQuery, type PageQuery } from '@/lib/paging';

export const metadata: Metadata = { title: 'Detail batch' };

type BundleRow = {
  bundle_id: string;
  code: string;
  status: BundleStatus;
  is_active: boolean;
  target_qty: number;
  ready: number;
  reject: number;
  selisih: number;
  wip_menunggu: number;
  wip_dikerjakan: number;
  ref_qty: number;
  variant_id: string;
  rework_of_bundle_id: string | null;
};

export default async function BatchDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<PageQuery>;
}) {
  const { id } = await params;
  // ?baru=1 is a one-off notice after creating the batch; page links must not carry it
  const { baru, ...query } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const supabase = await createClient();
  const user = await getCurrentAppUser();
  const [batchRes, bundleRes, parentRes] = await Promise.all([
    supabase
      .from('batch_reconciliation')
      .select('*')
      .eq('batch_id', id)
      .maybeSingle(),
    supabase.from('bundle_reconciliation').select('*').eq('batch_id', id).order('code'),
    supabase
      .from('bundle')
      .select('id, parent_bundle_id, holder:holder!bundle_current_holder_id_fkey(name), batch:production_batch(fabric_roll(code, material, color))')
      .eq('batch_id', id),
  ]);
  const batch = batchRes.data as
    | (Recon & { code: string; status: keyof typeof BATCH_STATUS; open_discrepancies: number; reject_awal: number; reworked: number })
    | null;
  if (!batch) notFound();

  const bundles = (bundleRes.data ?? []) as BundleRow[];
  const variantIds = [...new Set(bundles.map((b) => b.variant_id))];
  const { data: variantData } = await supabase.from('product_variant').select('id, sku, product_name, size, color').in('id', variantIds);
  const variants = new Map((variantData ?? []).map((v) => [v.id, v]));

  type Extra = { id: string; parent_bundle_id: string | null; holder: { name: string } | null; batch: { fabric_roll: { code: string; material: string; color: string } | null } | null };
  const extras = new Map(((parentRes.data ?? []) as unknown as Extra[]).map((e) => [e.id, e]));
  const roll = [...extras.values()][0]?.batch?.fabric_roll;
  const codeById = new Map(bundles.map((b) => [b.bundle_id, b.code]));
  const canProduce = user?.roles.includes('produksi') ?? false;
  const active = bundles.filter((b) => b.is_active);
  // all bundles stay loaded (parent codes, label count); only the table is paged
  const path = `/batch/${id}`;
  const paged = slicePage(bundles, query);
  if (paged.outOfRange) redirect(withQuery(path, query, { page: String(paged.pages) }));
  // FR-10: the cut can be fixed until the first bundle is received
  const canEdit = canProduce && batch.status === 'draft';
  const activeVariants: VariantOption[] = canEdit
    ? ((await supabase.from('product_variant').select('id, sku, product_name, size, color').eq('is_active', true).order('sku')).data ?? [])
    : [];
  // keep the batch's own variants selectable even if one was deactivated since
  const allVariants = [...activeVariants, ...[...variants.values()].filter((v) => !activeVariants.some((a) => a.id === v.id))];

  return (
    <>
      <SetCrumb items={[{ label: batch.code }]} />
      <Link href="/batch" className="inline-flex h-10 items-center gap-2 text-small text-text-muted hover:text-text lg:hidden">
        <ArrowLeft size={16} strokeWidth={1.5} aria-hidden /> Batch
      </Link>
      <PageHeader
        className="mt-2"
        title={<span className="num">{batch.code}</span>}
        badges={<Badge tone={BATCH_STATUS[batch.status].tone}>{BATCH_STATUS[batch.status].label}</Badge>}
        description={
          roll && (
            <>
              Rol <span className="num">{roll.code}</span> · {roll.material} {roll.color}
            </>
          )
        }
        actions={
          <Link
            href={`/print/labels?batch=${id}`}
            className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 font-medium text-primary-foreground hover:bg-primary-hover"
          >
            <Printer size={16} strokeWidth={1.5} aria-hidden /> Cetak semua label ({active.length})
          </Link>
        }
      />

      {baru && (
        <InlineAlert tone="success" className="mt-6">
          Batch dibuat. Pecah bundle dulu jika perlu, lalu cetak label. Salah qty atau variant? Ubah selama batch masih draft.
        </InlineAlert>
      )}

      <section className="mt-6 rounded-lg border border-border bg-surface p-5">
        <h2 className="text-h2">Rekonsiliasi</h2>
        <div className="mt-4 flex flex-col gap-3">
          <ReconciliationBar r={batch} />
          <ReconciliationLegend r={batch} />
          {batch.reworked > 0 && (
            <p className="text-small text-text-muted">
              Reject tercatat <span className="num text-text">{batch.reject_awal}</span> pcs,{' '}
              <span className="num text-info">{batch.reworked}</span> dikirim ke rework. Hasil rework sudah ikut di angka di atas.
            </p>
          )}
        </div>
      </section>

      <section className="mt-6 overflow-hidden rounded-lg border border-border bg-surface">
        <div className="flex flex-wrap items-start justify-between gap-2 px-5 py-4">
          <div>
            <h2 className="text-h2">Bundle</h2>
            {canEdit && (
              <p className="text-small text-text-muted">Qty dan variant masih bisa diubah sampai ada bundle yang diterima jahit.</p>
            )}
          </div>
          {canEdit && <AddBundleButton batchId={id} variants={allVariants} />}
        </div>
        <table className="w-full border-t border-border">
          <thead className="bg-surface-muted text-left text-caption tracking-[0.02em] text-text-muted max-md:hidden">
            <tr className="h-10">
              <th className="px-5 font-medium">Bundle</th>
              <th className="px-5 font-medium">Variant</th>
              <th className="px-5 font-medium">Status</th>
              <th className="px-5 text-right font-medium">Target</th>
              <th className="px-5 text-right font-medium">Qty acuan</th>
              <th className="px-5 text-right font-medium">Selisih</th>
              <th className="px-5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {paged.rows.map((b) => {
              const v = variants.get(b.variant_id);
              const extra = extras.get(b.bundle_id);
              const parentCode = extra?.parent_bundle_id ? codeById.get(extra.parent_bundle_id) : null;
              return (
                <tr
                  key={b.bundle_id}
                  className={`max-md:grid max-md:grid-cols-2 max-md:gap-1 max-md:px-5 max-md:py-3 ${!b.is_active ? 'text-text-muted' : ''} ${b.selisih > 0 ? 'border-l-[3px] border-l-warning' : ''}`}
                >
                  <td className="px-5 py-3 max-md:p-0">
                    <Link href={`/bundle/${b.bundle_id}`} className="num link-code">{b.code}</Link>
                    {parentCode && <p className="text-small text-text-muted">dari {parentCode}</p>}
                    {b.rework_of_bundle_id && (
                      <p className="text-small text-info">rework dari {codeById.get(b.rework_of_bundle_id) ?? '-'}</p>
                    )}
                  </td>
                  <td className="px-5 py-3 max-md:col-span-2 max-md:row-start-2 max-md:p-0">
                    {v ? `${v.product_name} ${v.size} · ${v.color}` : '-'}
                    {extra?.holder && b.is_active && <p className="text-small text-text-muted">{extra.holder.name}</p>}
                  </td>
                  <td className="px-5 py-3 max-md:justify-self-end max-md:p-0">
                    <StatusBadge status={b.status} />
                  </td>
                  <td className="num px-5 py-3 text-right max-md:hidden">{b.target_qty}</td>
                  <td className="num px-5 py-3 text-right max-md:hidden">{b.is_active ? b.ref_qty : '-'}</td>
                  <td className={`num px-5 py-3 text-right max-md:hidden ${b.selisih > 0 ? 'text-warning' : ''}`}>{b.is_active ? b.selisih : '-'}</td>
                  <td className="px-5 py-3 text-right max-md:col-span-2 max-md:p-0 max-md:pt-2 max-md:text-left">
                    {b.is_active && (
                      <div className="flex flex-wrap items-center justify-end gap-1 max-md:justify-start">
                        {canEdit && b.status === 'siap_jahit' && !extra?.parent_bundle_id && (
                          <EditBundleButton code={b.code} qty={b.target_qty} variantId={b.variant_id} variants={allVariants} />
                        )}
                        {canProduce && b.status === 'siap_jahit' && b.target_qty >= 2 && !b.rework_of_bundle_id && (
                          <SplitButton code={b.code} qty={b.target_qty} />
                        )}
                        <Link
                          href={`/print/labels?bundle=${b.bundle_id}`}
                          className="inline-flex h-10 items-center gap-1.5 rounded-md px-3 text-small text-text-muted hover:bg-surface-muted hover:text-text"
                        >
                          <Printer size={16} strokeWidth={1.5} aria-hidden /> Label
                        </Link>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <UrlPagination path={path} query={query} total={bundles.length} unit="bundle" className="border-t border-border px-5 pb-4" />
      </section>
    </>
  );
}

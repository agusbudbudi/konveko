import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { SetCrumb } from '@/components/nav/sidebar-nav';
import { UrlPagination } from '@/components/ui/pagination';
import { TabLink, TabList } from '@/components/ui/tab-link';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadError } from '@/components/ui/load-error';
import { PageHeader } from '@/components/ui/page-header';
import { pageCount, readPaging, withQuery, type PageQuery } from '@/lib/paging';
import { createClient } from '@/lib/supabase/server';
import { NotificationList, type NotificationRow } from './notification-list';

export const metadata: Metadata = { title: 'Notifikasi' };

/** Every notification of the signed-in user (RLS keeps it to their own). */
export default async function NotifikasiPage({ searchParams }: { searchParams: Promise<PageQuery> }) {
  const query = await searchParams;
  const tab = query.tab === 'semua' ? 'semua' : 'belum';
  const { from, to, page, per } = readPaging(query);
  const supabase = await createClient();

  let list = supabase
    .from('notification')
    .select('id, type, entity_type, entity_id, data, read_at, created_at')
    .order('created_at', { ascending: false })
    .range(from, to);
  if (tab === 'belum') list = list.is('read_at', null);

  const [{ data, error }, unreadRes, allRes] = await Promise.all([
    list,
    supabase.from('notification').select('id', { count: 'exact', head: true }).is('read_at', null),
    supabase.from('notification').select('id', { count: 'exact', head: true }),
  ]);
  const unread = unreadRes.count ?? 0;
  const total = tab === 'belum' ? unread : (allRes.count ?? 0);
  if (page > pageCount(total, per)) redirect(withQuery('/notifikasi', query, { page: String(pageCount(total, per)) }));
  const rows = (data ?? []) as NotificationRow[];

  return (
    <>
      <SetCrumb root items={[{ label: 'Notifikasi' }]} />
      <PageHeader
        title="Notifikasi"
        description={
          <>
            <span className="num text-text">{unread}</span> belum dibaca
          </>
        }
      />

      {error && <LoadError className="mt-6" />}

      <TabList label="Filter notifikasi" className="mt-6">
        <TabLink href={withQuery('/notifikasi', {}, {})} active={tab === 'belum'} label="Belum dibaca" count={unread} />
        <TabLink href={withQuery('/notifikasi', {}, { tab: 'semua' })} active={tab === 'semua'} label="Semua" count={allRes.count ?? 0} />
      </TabList>

      <div className="mt-6 overflow-hidden rounded-lg border border-border bg-surface">
        {rows.length === 0 ? (
          <EmptyState variant="check">{tab === 'belum' ? 'Semua notifikasi sudah dibaca.' : 'Belum ada notifikasi.'}</EmptyState>
        ) : (
          <NotificationList rows={rows} canMarkAll={unread > 0} />
        )}
      </div>

      <UrlPagination path="/notifikasi" query={query} total={total} unit="notifikasi" className="mt-4" />
    </>
  );
}

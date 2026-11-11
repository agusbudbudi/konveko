'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCheck } from 'lucide-react';
import { getBrowserClient } from '@/lib/supabase/client';
import { renderNotification, timeAgo, type NotificationData } from '@/lib/notifications/registry';
import { cn } from '@/lib/cn';

export type NotificationRow = {
  id: string;
  type: string;
  entity_type: string;
  entity_id: string;
  data: NotificationData;
  read_at: string | null;
  created_at: string;
};

const timeFmt = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Jakarta',
});

export function NotificationList({ rows, canMarkAll }: { rows: NotificationRow[]; canMarkAll: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);

  async function markRead(ids: string[] | null) {
    const { error } = await getBrowserClient().rpc('mark_notifications_read', { p_ids: ids });
    setFailed(Boolean(error));
    return !error;
  }

  function open(row: NotificationRow, href: string | null) {
    startTransition(async () => {
      if (!row.read_at) await markRead([row.id]);
      if (href) router.push(href);
      else router.refresh();
    });
  }

  return (
    <>
      {(canMarkAll || failed) && (
        <div className="flex items-center justify-between gap-2 border-b border-border px-5 py-2">
          <p className="text-small text-danger">{failed ? 'Gagal menandai dibaca. Coba lagi.' : ''}</p>
          {canMarkAll && (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  if (await markRead(null)) router.refresh();
                })
              }
              className="inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-small text-text-muted hover:bg-surface-muted hover:text-text disabled:opacity-50"
            >
              <CheckCheck size={16} strokeWidth={1.5} aria-hidden /> Tandai semua dibaca
            </button>
          )}
        </div>
      )}
      <ul className="divide-y divide-border">
        {rows.map((row) => {
          const r = renderNotification(row);
          const unread = !row.read_at;
          return (
            <li key={row.id}>
              <button
                type="button"
                disabled={pending}
                onClick={() => open(row, r.href)}
                className={cn(
                  'flex w-full items-start gap-3 px-5 py-3 text-left hover:bg-surface-muted disabled:cursor-wait',
                  unread && r.tone === 'warning' && 'border-l-[3px] border-l-warning pl-[17px]',
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className={cn('block', unread ? 'font-medium text-text' : 'text-text-muted')}>
                    {r.title}
                    {unread && <span className="sr-only"> (belum dibaca)</span>}
                  </span>
                  <span className="mt-0.5 block text-small text-text-muted">{r.body}</span>
                </span>
                <span className="shrink-0 text-right text-caption text-text-subtle">
                  <span className="block">{timeAgo(row.created_at)}</span>
                  <span className="num block max-sm:hidden">{timeFmt.format(new Date(row.created_at))}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

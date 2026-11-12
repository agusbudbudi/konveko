'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bell, CheckCheck } from 'lucide-react';
import { getBrowserClient } from '@/lib/supabase/client';
import { renderNotification, timeAgo, type NotificationData } from '@/lib/notifications/registry';
import { NotificationIcon } from '@/components/notifications/notification-icon';
import { EmptyState } from '@/components/ui/empty-state';
import { Scrim, useScrollLock } from '@/components/ui/scrim';
import { cn } from '@/lib/cn';

type Item = {
  id: string;
  type: string;
  entity_type: string;
  entity_id: string;
  data: NotificationData;
  read_at: string | null;
  created_at: string;
};

const LATEST = 10;
const TONE_DOT = { danger: 'bg-danger', warning: 'bg-warning', info: 'bg-info' } as const;

/**
 * Top-bar bell: unread count, the latest notifications, mark read.
 * Live via Supabase Realtime on the user's own rows (RLS), and refetched when
 * the tab becomes visible again in case the realtime socket dropped.
 */
export function NotificationBell({ userId }: { userId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [unread, setUnread] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const db = getBrowserClient();
    const [list, count] = await Promise.all([
      db
        .from('notification')
        .select('id, type, entity_type, entity_id, data, read_at, created_at')
        .order('created_at', { ascending: false })
        .limit(LATEST),
      db.from('notification').select('id', { count: 'exact', head: true }).is('read_at', null),
    ]);
    if (list.error || count.error) {
      setFailed(true);
    } else {
      setFailed(false);
      setItems(list.data as Item[]);
      setUnread(count.count ?? 0);
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    // Initial fetch; setState happens after the await, not synchronously in the effect.
    void Promise.resolve().then(load);
    const db = getBrowserClient();
    const channel = db
      .channel(`notification:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notification', filter: `user_id=eq.${userId}` }, () => {
        void load();
      })
      .subscribe();
    const onVisible = () => document.visibilityState === 'visible' && void load();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      void db.removeChannel(channel);
    };
  }, [userId, load]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // On phones the tray is a full-width sheet: dim and lock the page behind it.
  useScrollLock(open);

  async function markRead(ids: string[] | null) {
    const now = new Date().toISOString();
    // Optimistic; realtime/refetch brings the server truth.
    setItems((xs) => xs.map((x) => (ids === null || ids.includes(x.id) ? { ...x, read_at: x.read_at ?? now } : x)));
    setUnread((n) => (ids === null ? 0 : Math.max(0, n - items.filter((x) => ids.includes(x.id) && !x.read_at).length)));
    const { error } = await getBrowserClient().rpc('mark_notifications_read', { p_ids: ids });
    if (error) void load();
  }

  function openItem(item: Item, href: string | null) {
    setOpen(false);
    if (!item.read_at) void markRead([item.id]);
    if (href) router.push(href);
  }

  const badge = unread > 9 ? '9+' : String(unread);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={unread ? `Notifikasi, ${unread} belum dibaca` : 'Notifikasi'}
        className="relative inline-flex size-10 items-center justify-center rounded-md text-text-muted hover:bg-surface-muted hover:text-text"
      >
        <Bell size={20} strokeWidth={1.5} aria-hidden />
        {unread > 0 && (
          <span className="num absolute top-1 right-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] leading-none font-semibold text-danger-foreground">
            {badge}
          </span>
        )}
      </button>

      {open && (
        <>
        <Scrim onClose={() => setOpen(false)} />
        <div
          role="menu"
          // On phones the bell is not at the right edge (the profile menu sits after it), so anchoring to the bell pushes the
          // panel off-screen. There it spans the viewport width instead, just under the 56px top bar.
          className="absolute top-full right-0 z-20 mt-1 w-[22rem] rounded-lg border border-border-strong bg-surface max-sm:fixed max-sm:inset-x-4 max-sm:top-[3.75rem] max-sm:mt-0 max-sm:w-auto"
        >
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
            <p className="text-small font-medium">Notifikasi</p>
            {unread > 0 && (
              <button
                type="button"
                onClick={() => void markRead(null)}
                className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-caption text-text-muted hover:bg-surface-muted hover:text-text"
              >
                <CheckCheck size={14} strokeWidth={1.5} aria-hidden /> Tandai semua dibaca
              </button>
            )}
          </div>

          <div className="max-h-[min(26rem,70dvh)] overflow-y-auto overscroll-contain p-1">
            {!loaded ? (
              <p className="px-3 py-6 text-center text-small text-text-muted">Memuat…</p>
            ) : failed ? (
              <p className="px-3 py-6 text-center text-small text-text-muted">Notifikasi gagal dimuat.</p>
            ) : items.length === 0 ? (
              <EmptyState variant="bell" compact>Belum ada notifikasi.</EmptyState>
            ) : (
              items.map((item) => {
                const r = renderNotification(item);
                const isUnread = !item.read_at;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="menuitem"
                    onClick={() => openItem(item, r.href)}
                    className="flex w-full items-start gap-3 rounded-md px-3 py-2.5 text-left hover:bg-surface-muted"
                  >
                    <NotificationIcon icon={r.icon} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className={cn('block text-small', isUnread ? 'font-medium text-text' : 'text-text-muted')}>
                        {r.title}
                        {isUnread && <span className="sr-only"> (belum dibaca)</span>}
                      </span>
                      <span className="mt-0.5 block text-caption text-text-muted">{r.body}</span>
                      <span className="mt-0.5 block text-caption text-text-subtle">{timeAgo(item.created_at)}</span>
                    </span>
                    <span
                      aria-hidden
                      className={cn('mt-1.5 size-2 shrink-0 rounded-full', isUnread ? TONE_DOT[r.tone] : 'bg-transparent')}
                    />
                  </button>
                );
              })
            )}
          </div>

          <div className="border-t border-border p-1">
            <Link
              href="/notifikasi"
              onClick={() => setOpen(false)}
              className="flex h-10 items-center justify-center rounded-md text-small font-medium text-primary hover:bg-surface-muted"
            >
              Lihat semua
            </Link>
          </div>
        </div>
        </>
      )}
    </div>
  );
}

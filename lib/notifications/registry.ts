/**
 * Notification types: how each one reads in the bell and in an email.
 *
 * The database only stores `type` + raw `data` (see app.notify in
 * supabase/migrations/20261111190000_notification.sql). Everything a person
 * reads is rendered here, so in-app and email never drift apart.
 *
 * Adding a type:
 *   1. Add an entry to DEFINITIONS below (and a unit test).
 *   2. Add its recipients to app.notification_recipients.
 *   3. Call app.notify('<type>', ...) from the event (trigger or function).
 *   4. Optional: insert a notification_channel_setting row to allow email.
 *
 * Pure: no React, no Supabase. Unit-tested with plain node.
 * PRD: doc/PRD Notifikasi.md
 */

export type NotificationData = Record<string, unknown>;

export interface NotificationLike {
  type: string;
  entity_type: string;
  entity_id: string;
  data: NotificationData;
}

export interface Rendered {
  title: string;
  body: string;
  /** In-app path to open, or null when there is nothing to open. */
  href: string | null;
  tone: 'warning' | 'info';
}

export interface EmailMessage {
  subject: string;
  text: string;
  html: string;
}

export interface EmailContext {
  /** Absolute origin, e.g. https://konveko.vercel.app */
  appUrl: string;
  recipientName: string;
}

interface Definition {
  render(n: NotificationLike): Rendered;
  /** Override when the email needs more than title + body + link. */
  email?(n: NotificationLike, ctx: EmailContext): EmailMessage;
}

const STEP_LABEL: Record<string, string> = {
  produksi: 'produksi',
  jahit: 'jahit',
  finishing: 'finishing',
};

const str = (v: unknown, fallback = '-') => (typeof v === 'string' && v.trim() ? v : fallback);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);

const DEFINITIONS: Record<string, Definition> = {
  'selisih.baru': {
    render({ data }) {
      const step = STEP_LABEL[str(data.to_step, '')] ?? str(data.to_step);
      const reason = typeof data.reason === 'string' && data.reason ? ` Alasan: ${data.reason}.` : '';
      return {
        title: `Selisih ${num(data.qty)} pcs di ${str(data.bundle_code)}`,
        body: `Terima ${step} oleh ${str(data.receiver)}: ${num(data.qty_received)} dari ${num(data.qty_sent)} pcs.${reason}`,
        href: typeof data.bundle_id === 'string' ? `/bundle/${data.bundle_id}` : '/selisih',
        tone: 'warning',
      };
    },
  },
};

const FALLBACK: Definition = {
  render: (n) => ({ title: 'Notifikasi', body: n.type, href: null, tone: 'info' }),
};

export const NOTIFICATION_TYPES = Object.keys(DEFINITIONS);

export function renderNotification(n: NotificationLike): Rendered {
  return (DEFINITIONS[n.type] ?? FALLBACK).render(n);
}

export function renderEmail(n: NotificationLike, ctx: EmailContext): EmailMessage {
  const def = DEFINITIONS[n.type] ?? FALLBACK;
  if (def.email) return def.email(n, ctx);
  return defaultEmail(def.render(n), ctx);
}

function defaultEmail(r: Rendered, ctx: EmailContext): EmailMessage {
  const origin = ctx.appUrl.replace(/\/+$/, '');
  const link = r.href ? `${origin}${r.href}` : origin;
  const text = [`Halo ${ctx.recipientName},`, '', r.title, r.body, '', `Buka: ${link}`, '', '— Konveko'].join('\n');
  const html = `<!doctype html>
<html lang="id"><body style="margin:0;padding:24px;background:#f6f7f6;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1a1f1e">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:8px;padding:24px;border:1px solid #e3e6e4">
    <p style="margin:0 0 16px">Halo ${escapeHtml(ctx.recipientName)},</p>
    <p style="margin:0 0 4px;font-weight:600;font-size:16px">${escapeHtml(r.title)}</p>
    <p style="margin:0 0 20px;color:#4a5452">${escapeHtml(r.body)}</p>
    <a href="${escapeHtml(link)}" style="display:inline-block;background:#093B34;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:6px;font-weight:500">Buka di Konveko</a>
  </div>
</body></html>`;
  return { subject: r.title, text, html };
}

export function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** "baru saja", "5 menit lalu", "3 jam lalu", "kemarin", "4 hari lalu", then a date. */
export function timeAgo(iso: string, now = new Date()) {
  const diff = Math.max(0, now.getTime() - new Date(iso).getTime());
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'baru saja';
  if (min < 60) return `${min} menit lalu`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours} jam lalu`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'kemarin';
  if (days < 7) return `${days} hari lalu`;
  return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta' });
}

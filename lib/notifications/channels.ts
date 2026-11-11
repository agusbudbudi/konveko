/**
 * External delivery channels. A channel takes one queued notification for one
 * recipient and reports what happened. Retries, backoff and bookkeeping live
 * in dispatch.ts, so a channel only has to send.
 *
 * Turning on email (doc/PRD Notifikasi.md, "Mengaktifkan email nanti"):
 *   1. npm i resend, set RESEND_API_KEY and EMAIL_FROM.
 *   2. Add a `resendEmailChannel` next to `logEmailChannel` and return it
 *      from resolveChannel when RESEND_API_KEY is set.
 *   3. Give recipients a real email address, switch selisih.baru × email on.
 *
 * Pure: no Supabase. Unit-tested with plain node.
 */
import { renderEmail, type EmailMessage, type NotificationLike } from './registry.ts';

export type ChannelName = 'email';

export interface Recipient {
  id: string;
  name: string;
  email: string | null;
}

export interface Outgoing {
  notification: NotificationLike;
  recipient: Recipient;
  appUrl: string;
}

export type SendResult =
  | { status: 'terkirim' }
  | { status: 'dilewati'; reason: string }
  | { status: 'gagal'; error: string };

export interface Channel {
  name: ChannelName;
  send(msg: Outgoing): Promise<SendResult>;
}

/** PIN accounts sign in with a synthetic address that nobody reads. */
const SYNTHETIC_DOMAIN = '@pin.konveko.internal';

export function deliverableEmail(email: string | null | undefined): string | null {
  const e = email?.trim().toLowerCase();
  if (!e || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) || e.endsWith(SYNTHETIC_DOMAIN)) return null;
  return e;
}

/** Shared front half of every email channel: address check + rendering. */
export function prepareEmail(msg: Outgoing): { to: string; message: EmailMessage } | { skip: string } {
  const to = deliverableEmail(msg.recipient.email);
  if (!to) return { skip: 'Penerima belum punya alamat email.' };
  return { to, message: renderEmail(msg.notification, { appUrl: msg.appUrl, recipientName: msg.recipient.name }) };
}

/** Development stand-in: prints the email instead of sending it. */
export const logEmailChannel: Channel = {
  name: 'email',
  async send(msg) {
    const prepared = prepareEmail(msg);
    if ('skip' in prepared) return { status: 'dilewati', reason: prepared.skip };
    console.info(`[notifikasi] email ke ${prepared.to}: ${prepared.message.subject}\n${prepared.message.text}`);
    return { status: 'terkirim' };
  },
};

/**
 * Which implementation serves a channel in this environment. null = not
 * configured yet: the dispatcher records a failure and retries later.
 */
export function resolveChannel(name: string, env: Record<string, string | undefined> = process.env): Channel | null {
  if (name !== 'email') return null;
  if (env.EMAIL_PROVIDER === 'log' || (env.NODE_ENV !== 'production' && !env.RESEND_API_KEY)) {
    return logEmailChannel;
  }
  return null;
}

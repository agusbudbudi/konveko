/**
 * Sends queued external notifications (notification_delivery, status 'antre').
 *
 * The store is injected so this runs against Supabase in the app
 * (lib/notifications/server.ts) and against a fake in unit tests.
 * Every claimed row is always finished, even when a channel throws, so one bad
 * message never blocks the queue. Retry timing lives in the database
 * (app.finish_notification_delivery).
 */
import type { Channel, SendResult } from './channels.ts';
import type { NotificationData } from './registry.ts';

export interface ClaimedDelivery {
  delivery_id: string;
  channel: string;
  attempts: number;
  notification_id: string;
  type: string;
  entity_type: string;
  entity_id: string;
  data: NotificationData;
  created_at: string;
  user_id: string;
  user_name: string;
  user_email: string | null;
}

export interface DeliveryStore {
  claim(limit: number): Promise<ClaimedDelivery[]>;
  finish(deliveryId: string, status: SendResult['status'], error?: string | null): Promise<void>;
}

export interface DispatchOptions {
  appUrl: string;
  resolveChannel: (name: string) => Channel | null;
  batchSize?: number;
  /** Stop after this many batches so one run stays short. */
  maxBatches?: number;
}

export interface DispatchSummary {
  terkirim: number;
  dilewati: number;
  gagal: number;
}

export async function dispatchPending(store: DeliveryStore, opts: DispatchOptions): Promise<DispatchSummary> {
  const summary: DispatchSummary = { terkirim: 0, dilewati: 0, gagal: 0 };
  const batchSize = opts.batchSize ?? 20;
  const maxBatches = opts.maxBatches ?? 5;

  for (let i = 0; i < maxBatches; i++) {
    const rows = await store.claim(batchSize);
    for (const row of rows) {
      const result = await sendOne(row, opts);
      summary[result.status]++;
      const detail = result.status === 'gagal' ? result.error : result.status === 'dilewati' ? result.reason : null;
      await store.finish(row.delivery_id, result.status, detail);
    }
    if (rows.length < batchSize) break;
  }
  return summary;
}

async function sendOne(row: ClaimedDelivery, opts: DispatchOptions): Promise<SendResult> {
  const channel = opts.resolveChannel(row.channel);
  if (!channel) return { status: 'gagal', error: `Kanal ${row.channel} belum dikonfigurasi.` };
  try {
    return await channel.send({
      notification: { type: row.type, entity_type: row.entity_type, entity_id: row.entity_id, data: row.data },
      recipient: { id: row.user_id, name: row.user_name, email: row.user_email },
      appUrl: opts.appUrl,
    });
  } catch (e) {
    return { status: 'gagal', error: e instanceof Error ? e.message : String(e) };
  }
}

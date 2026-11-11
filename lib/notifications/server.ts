import 'server-only';
import { after } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { resolveChannel } from './channels';
import { dispatchPending, type ClaimedDelivery, type DeliveryStore, type DispatchSummary } from './dispatch';

function appUrl() {
  const explicit = process.env.APP_URL;
  if (explicit) return explicit;
  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return prod ? `https://${prod}` : 'http://localhost:3000';
}

function serviceStore(): DeliveryStore {
  const db = createServiceClient();
  return {
    async claim(limit) {
      const { data, error } = await db.rpc('claim_notification_deliveries', { p_limit: limit });
      if (error) throw new Error(error.message);
      return (data ?? []) as ClaimedDelivery[];
    },
    async finish(deliveryId, status, detail) {
      const { error } = await db.rpc('finish_notification_delivery', {
        p_delivery_id: deliveryId,
        p_status: status,
        p_error: detail ?? null,
      });
      if (error) throw new Error(error.message);
    },
  };
}

/** Send what is due now. Used by the cron route and by scheduleDispatch. */
export async function runDispatch(): Promise<DispatchSummary> {
  return dispatchPending(serviceStore(), { appUrl: appUrl(), resolveChannel });
}

/**
 * Call from a server action after an event that may queue external
 * notifications. Runs once the response has been sent, so the user never waits
 * and a failing provider never fails the action.
 */
export function scheduleDispatch() {
  if (!process.env.SUPABASE_SECRET_KEY) return;
  after(async () => {
    try {
      const s = await runDispatch();
      if (s.terkirim + s.dilewati + s.gagal > 0) console.info('[notifikasi] dispatch', s);
    } catch (e) {
      console.error('[notifikasi] dispatch gagal', e);
    }
  });
}

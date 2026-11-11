import { NextResponse } from 'next/server';
import { runDispatch } from '@/lib/notifications/server';

/**
 * Backup sender for queued external notifications (retries, and anything the
 * after-action dispatch missed). Register it in vercel.json `crons` when the
 * email channel goes live. Vercel Cron sends `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    return NextResponse.json(await runDispatch());
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

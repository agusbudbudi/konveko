import 'server-only';
import { createClient } from '@/lib/supabase/server';
import type { ActionResult } from '@/lib/types';

/**
 * Calls a public RPC as the signed-in user. Database functions raise
 * user-facing Indonesian sentences with a machine code in DETAIL, which
 * PostgREST returns as `details`.
 */
export async function callRpc<T>(fn: string, args: Record<string, unknown>): Promise<ActionResult<T>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    const known = typeof error.details === 'string' && /^[a-z_]+$/.test(error.details);
    return {
      ok: false,
      // Only show database text we wrote ourselves; hide internal errors.
      message: known ? error.message : 'Terjadi kesalahan. Coba lagi.',
      code: known ? error.details : null,
    };
  }
  return { ok: true, data: data as T };
}

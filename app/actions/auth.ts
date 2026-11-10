'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { isAuthRetryableFetchError, type AuthError } from '@supabase/supabase-js';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { normalizePhone, pinEmail } from '@/lib/phone';

export type LoginState = { error: string | null };

const FLOOR_ROLES = ['penjahit', 'finishing', 'gudang'];

const UNREACHABLE = 'Server tidak bisa dihubungi. Periksa koneksi, lalu coba lagi.';
const FAILED = 'Login sedang bermasalah. Coba lagi sebentar.';

/**
 * Only a real credentials check says "salah". A network failure (server down, no connection)
 * or another server error gets its own message, so nobody retypes a correct password.
 */
function wrongCredentials(error: AuthError) {
  return error.code === 'invalid_credentials' || (error.status === 400 && !error.code);
}
function loginProblem(error: AuthError) {
  return isAuthRetryableFetchError(error) ? UNREACHABLE : FAILED;
}

function safeNext(value: FormDataEntryValue | null): string | null {
  const v = typeof value === 'string' ? value : '';
  // same-origin paths only
  return v.startsWith('/') && !v.startsWith('//') ? v : null;
}

async function landingPath(next: string | null) {
  if (next) return next;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return '/login';
  const { data } = await supabase.from('app_user').select('roles').eq('id', user.id).maybeSingle();
  const roles: string[] = data?.roles ?? [];
  const floorOnly = roles.length > 0 && roles.every((r) => FLOOR_ROLES.includes(r));
  // floor staff land on the scanner; everyone else starts at Lacak (search over production and stock)
  return floorOnly ? '/scan' : '/lacak';
}

export async function loginWithEmail(_: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  if (!email || !password) return { error: 'Isi email dan password.' };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: wrongCredentials(error) ? 'Email atau password salah.' : loginProblem(error) };
  redirect(await landingPath(safeNext(formData.get('next'))));
}

export async function loginWithPin(_: LoginState, formData: FormData): Promise<LoginState> {
  const phone = normalizePhone(String(formData.get('phone') ?? ''));
  const pin = String(formData.get('pin') ?? '');
  if (!phone) return { error: 'Nomor HP tidak valid.' };
  if (!/^\d{6}$/.test(pin)) return { error: 'PIN harus 6 angka.' };

  // On Vercel, x-forwarded-for is set by the platform. Elsewhere, make sure
  // the proxy in front overwrites it, or the IP limit can be bypassed.
  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const keys = [`phone:${phone}`, `ip:${ip}`];

  const service = createServiceClient();
  const { data: lockedUntil, error: checkError } = await service.rpc('pin_login_check', { p_keys: keys });
  if (checkError) return { error: checkError.message.includes('fetch failed') ? UNREACHABLE : FAILED };
  if (lockedUntil) return { error: lockedMessage(lockedUntil as string) };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: pinEmail(phone), password: pin });
  // a failed attempt only counts toward the lock when the PIN was actually checked and wrong
  if (error && !wrongCredentials(error)) return { error: loginProblem(error) };
  const { data: lockedAfter } = await service.rpc('pin_login_record', { p_keys: keys, p_success: !error });

  if (error) {
    return { error: lockedAfter ? lockedMessage(lockedAfter as string) : 'Nomor HP atau PIN salah.' };
  }
  redirect(await landingPath(safeNext(formData.get('next'))));
}

function lockedMessage(until: string) {
  const time = new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' })
    .format(new Date(until));
  return `Terlalu banyak percobaan. Coba lagi pukul ${time}.`;
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}

'use server';

import { headers } from 'next/headers';
import { createServiceClient } from '@/lib/supabase/server';
import { normalizePhone } from '@/lib/phone';

export type LeadState = { status: 'idle' | 'sent' | 'error'; message: string | null };

const TEAM_SIZES = ['1-10', '11-30', '31-100', '100+'];
const FAILED = 'Belum bisa terkirim. Coba lagi sebentar, atau chat kami lewat WhatsApp.';

/**
 * Landing page contact form. Stores the lead through public.landing_lead_submit (service role only),
 * which also holds the abuse limits. A repeat of the same number reads as sent, so nothing leaks
 * about who already wrote in.
 */
export async function submitLead(_: LeadState, formData: FormData): Promise<LeadState> {
  // Honeypot: a field people never see. Bots that fill it get a quiet "sent".
  if (String(formData.get('website') ?? '')) return { status: 'sent', message: null };

  const name = String(formData.get('name') ?? '').trim();
  const phone = normalizePhone(String(formData.get('phone') ?? ''));
  const size = String(formData.get('team_size') ?? '');
  if (name.length < 2 || name.length > 80) return { status: 'error', message: 'Isi nama kamu.' };
  if (!phone) return { status: 'error', message: 'Nomor WhatsApp tidak valid. Boleh diawali 08, 8, atau +62.' };

  // On Vercel, x-forwarded-for is set by the platform (same note as the PIN login limit).
  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';

  try {
    const { data, error } = await createServiceClient().rpc('landing_lead_submit', {
      p_name: name,
      p_phone: phone,
      p_team_size: TEAM_SIZES.includes(size) ? size : null,
      p_ip: ip,
    });
    if (error) return { status: 'error', message: FAILED };
    if (data === 'rate_limited') return { status: 'error', message: 'Terlalu banyak kiriman dari jaringan ini. Coba lagi nanti, atau chat kami lewat WhatsApp.' };
    return { status: 'sent', message: null };
  } catch {
    return { status: 'error', message: FAILED };
  }
}

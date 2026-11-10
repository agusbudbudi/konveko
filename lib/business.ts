import 'server-only';
import { createClient } from '@/lib/supabase/server';

export type BusinessProfile = {
  name: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  logo_path: string | null;
  /** short-lived signed URL of the logo, for <img> on screen and in print */
  logoUrl: string | null;
};

/** The business identity printed on documents. Missing fields stay null; callers fall back to Konveko. */
export async function loadBusinessProfile(): Promise<BusinessProfile> {
  const supabase = await createClient();
  const { data } = await supabase.from('business_profile').select('name, address, phone, email, logo_path').eq('id', 1).maybeSingle();
  const p = (data ?? { name: null, address: null, phone: null, email: null, logo_path: null }) as Omit<BusinessProfile, 'logoUrl'>;
  let logoUrl: string | null = null;
  if (p.logo_path) {
    const { data: signed } = await supabase.storage.from('business-assets').createSignedUrl(p.logo_path, 3600);
    logoUrl = signed?.signedUrl ?? null;
  }
  return { ...p, logoUrl };
}

export const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export const LOGO_MAX_BYTES = 1024 * 1024;

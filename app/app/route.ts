import { redirect } from 'next/navigation';
import { homePath } from '@/lib/auth/home';
import { getCurrentAppUser } from '@/lib/supabase/server';

/** "Buka aplikasi" on the landing page: send a signed-in user to their start page (scanner or Lacak). */
export async function GET() {
  const user = await getCurrentAppUser();
  redirect(user ? homePath(user.roles) : '/login');
}

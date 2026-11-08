import type { Metadata } from 'next';
import { InlineAlert } from '@/components/ui/inline-alert';
import { createClient, getCurrentAppUser } from '@/lib/supabase/server';
import { UserManager, type UserRow } from './user-manager';

export const metadata: Metadata = { title: 'User' };

export default async function UserPage() {
  const me = await getCurrentAppUser();
  if (!me?.roles.includes('admin')) {
    return <InlineAlert tone="info">Daftar user hanya bisa dilihat admin.</InlineAlert>;
  }
  const supabase = await createClient();
  const [users, holders] = await Promise.all([
    supabase.from('app_user').select('id, name, email, phone, roles, holder_id, is_active').order('name'),
    supabase.from('holder').select('id, name, type').eq('is_active', true).order('name'),
  ]);

  return <UserManager meId={me.id} users={(users.data ?? []) as UserRow[]} holders={holders.data ?? []} />;
}

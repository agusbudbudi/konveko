import type { Metadata } from 'next';
import { InlineAlert } from '@/components/ui/inline-alert';
import { loadBusinessProfile } from '@/lib/business';
import { getCurrentAppUser } from '@/lib/supabase/server';
import { ProfileForm } from './profile-form';

export const metadata: Metadata = { title: 'Profil usaha' };

export default async function BusinessProfilePage() {
  const [me, profile] = await Promise.all([getCurrentAppUser(), loadBusinessProfile()]);
  const canEdit = me?.roles.includes('admin') ?? false;

  return (
    <>
      <h1 className="text-h1">Profil usaha</h1>
      <p className="mt-1 text-text-muted">Identitas usaha yang dicetak di kop surat jalan.</p>
      {!canEdit && (
        <InlineAlert tone="info" className="mt-6">
          Hanya admin yang bisa mengubah profil usaha.
        </InlineAlert>
      )}
      <ProfileForm profile={profile} canEdit={canEdit} />
    </>
  );
}

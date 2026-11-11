import type { Metadata } from 'next';
import { InlineAlert } from '@/components/ui/inline-alert';
import { loadBusinessProfile } from '@/lib/business';
import { getCurrentAppUser } from '@/lib/supabase/server';
import { ProfileForm } from './profile-form';
import { PageHeader } from '@/components/ui/page-header';

export const metadata: Metadata = { title: 'Profil usaha' };

export default async function BusinessProfilePage() {
  const [me, profile] = await Promise.all([getCurrentAppUser(), loadBusinessProfile()]);
  const canEdit = me?.roles.includes('admin') ?? false;

  return (
    <>
      <PageHeader title="Profil usaha" description="Identitas usaha yang dicetak di kop surat jalan." />
      {!canEdit && (
        <InlineAlert tone="info" className="mt-6">
          Hanya admin yang bisa mengubah profil usaha.
        </InlineAlert>
      )}
      <ProfileForm profile={profile} canEdit={canEdit} />
    </>
  );
}

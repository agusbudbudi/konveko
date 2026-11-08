import { InlineAlert } from '@/components/ui/inline-alert';
import { getCurrentAppUser } from '@/lib/supabase/server';
import { MasterTabs } from './tabs';

export default async function MasterLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentAppUser();
  const isAdmin = user?.roles.includes('admin') ?? false;
  return (
    <>
      <h1 className="text-h1">Master data</h1>
      <MasterTabs />
      {!isAdmin && (
        <InlineAlert tone="info" className="mt-4">
          Hanya admin yang bisa menambah atau mengubah master data.
        </InlineAlert>
      )}
      <div className="mt-6">{children}</div>
    </>
  );
}

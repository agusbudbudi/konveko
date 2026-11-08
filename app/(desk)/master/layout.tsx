import { InlineAlert } from '@/components/ui/inline-alert';
import { getCurrentAppUser } from '@/lib/supabase/server';

// Sub-pages are reached from the "Master data" submenu in the sidebar.
export default async function MasterLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentAppUser();
  const isAdmin = user?.roles.includes('admin') ?? false;
  return (
    <>
      {children}
      {!isAdmin && (
        <InlineAlert tone="info" className="mt-4">
          Hanya admin yang bisa menambah atau mengubah master data.
        </InlineAlert>
      )}
    </>
  );
}

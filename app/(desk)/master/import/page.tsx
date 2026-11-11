import type { Metadata } from 'next';
import { Download, FileSpreadsheet } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { getCurrentAppUser } from '@/lib/supabase/server';
import { ImportPanel } from './import-panel';

export const metadata: Metadata = { title: 'Import & export' };

const link =
  'inline-flex h-10 items-center gap-2 rounded-md border border-border bg-surface px-4 font-medium text-text hover:border-border-strong';

/** Excel import/export of master data (admin). PRD: doc/PRD Import dan export master data.md */
export default async function ImportExportPage() {
  const me = await getCurrentAppUser();
  const isAdmin = me?.roles.includes('admin') ?? false;

  return (
    <>
      <PageHeader
        title="Import & export"
        description="Variant, rol kain, rak, penjahit dan tim, dan alasan dalam satu file Excel. User dan profil usaha tetap lewat form."
        actions={
          isAdmin && (
            <>
              {/* plain links: the route answers with a file download */}
              <a href="/master/export?template=1" className={link}>
                <FileSpreadsheet size={16} strokeWidth={1.5} aria-hidden /> Template
              </a>
              <a href="/master/export" className={link}>
                <Download size={16} strokeWidth={1.5} aria-hidden /> Export data
              </a>
            </>
          )
        }
      />
      {isAdmin && (
        <div className="mt-6">
          <ImportPanel />
        </div>
      )}
    </>
  );
}

import Link from 'next/link';
import { EmptyState } from '@/components/ui/empty-state';

/** Rendered inside the desk layout when a page calls notFound(), so the sidebar stays. */
export default function DeskNotFound() {
  return (
    <div className="mx-auto mt-16 max-w-3xl">
      <EmptyState
        variant="search"
        hint="Halaman atau data ini tidak ada, atau sudah dihapus. Periksa kembali kodenya, atau cari lewat Lacak."
        action={
          <Link
            href="/lacak"
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 font-medium text-primary-foreground transition-colors hover:bg-primary-hover"
          >
            Buka Lacak
          </Link>
        }
      >
        Data tidak ditemukan.
      </EmptyState>
    </div>
  );
}

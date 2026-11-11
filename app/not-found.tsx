import Link from 'next/link';
import { EmptyState } from '@/components/ui/empty-state';

/** Unmatched URLs fall here, outside the desk layout. */
export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-md">
        <EmptyState
          variant="search"
          hint="Alamat yang kamu buka tidak ada. Periksa kembali linknya."
          action={
            <Link
              href="/"
              className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 font-medium text-primary-foreground transition-colors hover:bg-primary-hover"
            >
              Ke beranda
            </Link>
          }
        >
          Halaman tidak ditemukan.
        </EmptyState>
      </div>
    </main>
  );
}

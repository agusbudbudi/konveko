import { notFound } from 'next/navigation';
import { Wordmark } from '@/components/brand/wordmark';
import { Preview } from './preview';

// Development only: scan UI against in-memory mock data, no Supabase needed.
export default function ScanPreviewPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
      <header className="flex h-14 items-center justify-between px-4">
        <Wordmark />
        <span className="text-small text-text-muted">Preview (data contoh)</span>
      </header>
      <Preview />
    </div>
  );
}

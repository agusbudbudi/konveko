import type { Metadata } from 'next';
import { Wordmark } from '@/components/brand/wordmark';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Masuk' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col px-4 pt-16 pb-8">
      <Wordmark size="lg" />
      <h1 className="mt-10 text-h1">Masuk</h1>
      <LoginForm next={next ?? ''} />
    </main>
  );
}

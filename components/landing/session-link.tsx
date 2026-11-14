'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { useSignedIn } from './use-signed-in';

/** "Sudah punya akun? Masuk" for visitors, "Buka aplikasi" once a session exists. */
export function SessionLink({ className }: { className?: string }) {
  const signedIn = useSignedIn();
  return (
    <Link href={signedIn ? '/app' : '/login'} className={className}>
      {signedIn ? 'Buka aplikasi' : 'Sudah punya akun? Masuk'}
      <ArrowRight size={14} strokeWidth={1.5} aria-hidden className="transition-transform duration-200 group-hover:translate-x-1" />
    </Link>
  );
}

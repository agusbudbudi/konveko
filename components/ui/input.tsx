import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

const base =
  'w-full rounded-md border border-border bg-surface px-3 text-text placeholder:text-text-muted ' +
  'focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-soft ' +
  'aria-[invalid=true]:border-danger';

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn(base, 'h-12 sm:h-10', className)} {...props} />;
}

export function Label({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block font-medium text-text">
      {children}
    </label>
  );
}

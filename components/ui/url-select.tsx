'use client';

import { useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Combobox, type ComboOption } from '@/components/ui/combobox';
import { cn } from '@/lib/cn';

/**
 * A searchable filter bound to one URL parameter: choosing applies at once (no submit button),
 * resets to page 1 and keeps every other parameter (tab, page size, other filters).
 * The first option is "all" (empty value), which removes the parameter.
 */
export function UrlSelect({
  param,
  label,
  allLabel,
  options,
  className,
}: {
  param: string;
  label: string;
  allLabel: string;
  options: ComboOption[];
  className?: string;
}) {
  const router = useRouter();
  const path = usePathname();
  const value = useSearchParams().get(param) ?? '';
  const [pending, start] = useTransition();

  const choose = (v: string) => {
    // the live URL, so a change made by another filter a moment ago is kept
    const next = new URLSearchParams(window.location.search);
    if (v) next.set(param, v);
    else next.delete(param);
    next.delete('page');
    const s = next.toString();
    start(() => router.replace(s ? `${path}?${s}` : path, { scroll: false }));
  };

  return (
    <div className={cn('relative w-full sm:w-52', className)} aria-busy={pending}>
      <Combobox
        searchable
        aria-label={label}
        value={value}
        onChange={choose}
        options={[{ value: '', label: allLabel }, ...options]}
      />
      {pending && (
        <Loader2 size={16} strokeWidth={1.5} aria-label="Memuat" className="absolute top-1/2 -right-6 -translate-y-1/2 animate-spin text-text-muted" />
      )}
    </div>
  );
}

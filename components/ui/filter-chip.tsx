import Link from 'next/link';
import { X } from 'lucide-react';

/** An active filter that came from a link (e.g. from Lacak), with a link that removes it. */
export function FilterChip({ label, value, removeHref }: { label: string; value: string; removeHref: string }) {
  return (
    <span className="inline-flex h-8 items-center gap-1.5 rounded-md border border-primary/30 bg-primary-soft pr-1 pl-3 text-small text-primary">
      {label} <span className="font-medium">{value}</span>
      <Link
        href={removeHref}
        aria-label={`Hapus filter ${label.toLowerCase()} ${value}`}
        className="inline-flex size-6 items-center justify-center rounded-sm hover:bg-primary/10"
      >
        <X size={14} strokeWidth={1.5} aria-hidden />
      </Link>
    </span>
  );
}

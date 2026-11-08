import { cn } from '@/lib/cn';

/** First letters of the first two words: "Petugas produksi" -> "PP", "Ani" -> "A". */
export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

/** Initials avatar. No photos in the system, so this is the user's visual marker. */
export function Avatar({ name, size = 28, className }: { name: string; size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full bg-primary-soft font-semibold text-primary',
        className,
      )}
    >
      {initials(name) || '?'}
    </span>
  );
}

import { cn } from '@/lib/cn';

export function BrandMark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden className="shrink-0">
      <rect x="6" y="6" width="52" height="52" rx="8" fill="none" stroke="var(--primary)" strokeWidth="5" />
      <path d="M20 44 L29 35 M35 29 L44 20" stroke="var(--primary)" strokeWidth="6" strokeLinecap="round" />
    </svg>
  );
}

const sizes = {
  md: { mark: 24, text: 'text-[18px] leading-6' }, // compact headers (mobile, scan)
  lg: { mark: 32, text: 'text-[24px] leading-8' }, // sidebar, login
} as const;

/** DESIGN §9: lowercase "konveko", weight 600, -0.01em, --text color. */
export function Wordmark({ size = 'md' }: { size?: keyof typeof sizes }) {
  const s = sizes[size];
  return (
    <span className={cn('inline-flex items-center', size === 'lg' ? 'gap-2.5' : 'gap-2')}>
      <BrandMark size={s.mark} />
      <span className={cn('font-semibold tracking-[-0.01em] text-text', s.text)}>konveko</span>
    </span>
  );
}

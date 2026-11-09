import Image from 'next/image';
import { cn } from '@/lib/cn';

/** Brand mark from public/logo-konveko.png (trimmed, 128px copy for the UI). */
export function BrandMark({ size = 24 }: { size?: number }) {
  return <Image src="/logo-konveko-mark.png" width={size} height={size} alt="" aria-hidden className="shrink-0" priority />;
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

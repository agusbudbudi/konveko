import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'md' | 'lg';

const variants: Record<Variant, string> = {
  primary: 'bg-primary text-primary-foreground hover:bg-primary-hover',
  secondary: 'bg-surface text-text border border-border hover:border-border-strong',
  ghost: 'bg-transparent text-text-muted hover:bg-surface-muted',
  danger: 'bg-danger text-danger-foreground',
};

const sizes: Record<Size, string> = {
  md: 'h-10',
  lg: 'h-12', // mobile scan flow
};

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-md px-4 font-medium',
        'transition-colors duration-150 ease-[cubic-bezier(0.2,0,0,1)]',
        'disabled:cursor-not-allowed disabled:opacity-50',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}

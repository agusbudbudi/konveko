import { Bell, CircleX, TriangleAlert, type LucideIcon } from 'lucide-react';
import type { NotificationIconKey } from '@/lib/notifications/registry';
import { cn } from '@/lib/cn';

const ICONS: Record<NotificationIconKey, { Icon: LucideIcon; className: string; label: string }> = {
  selisih: { Icon: TriangleAlert, className: 'bg-warning-soft text-warning', label: 'Selisih' },
  reject: { Icon: CircleX, className: 'bg-danger-soft text-danger', label: 'Reject' },
  umum: { Icon: Bell, className: 'bg-info-soft text-info', label: 'Info' },
};

/** Round badge on the left of a notification, one glyph and color per kind. */
export function NotificationIcon({ icon, size = 'md' }: { icon: NotificationIconKey; size?: 'sm' | 'md' }) {
  const { Icon, className, label } = ICONS[icon] ?? ICONS.umum;
  return (
    <span
      role="img"
      aria-label={label}
      className={cn('mt-0.5 inline-flex shrink-0 items-center justify-center rounded-full', size === 'sm' ? 'size-6' : 'size-7', className)}
    >
      <Icon size={size === 'sm' ? 13 : 15} strokeWidth={2} aria-hidden />
    </span>
  );
}

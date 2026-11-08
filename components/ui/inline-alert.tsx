import { AlertTriangle, CircleCheck, CircleX, Info } from 'lucide-react';
import { cn } from '@/lib/cn';

type Tone = 'info' | 'success' | 'warning' | 'danger';

const styles: Record<Tone, string> = {
  info: 'bg-info-soft text-info',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
};
const icons = { info: Info, success: CircleCheck, warning: AlertTriangle, danger: CircleX };

export function InlineAlert({ tone, children, className }: { tone: Tone; children: React.ReactNode; className?: string }) {
  const Icon = icons[tone];
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cn('flex gap-2 rounded-md px-4 py-3', styles[tone], className)}>
      <Icon aria-hidden size={16} strokeWidth={1.5} className="mt-1 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

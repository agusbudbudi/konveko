import { cn } from '@/lib/cn';
import { STATUS_LABEL, type BundleStatus } from '@/lib/types';

type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

const tones: Record<Tone, string> = {
  neutral: 'bg-neutral-soft text-neutral',
  info: 'bg-info-soft text-info',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
};

const statusTone: Record<BundleStatus, Tone> = {
  siap_jahit: 'neutral',
  proses_jahit: 'info',
  siap_finishing: 'neutral',
  proses_finishing: 'info',
  ready_stock: 'success',
  dipecah: 'neutral',
  batal: 'neutral',
};

export function Badge({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center gap-1.5 rounded-sm px-2 text-xs font-medium leading-4',
        tones[tone],
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: BundleStatus }) {
  return <Badge tone={statusTone[status]}>{STATUS_LABEL[status]}</Badge>;
}

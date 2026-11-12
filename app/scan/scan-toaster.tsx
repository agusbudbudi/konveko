'use client';

import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { dismissToast, useScanToast } from '@/lib/scan/toast';

const TONE = {
  success: { box: 'border-success/30 bg-success-soft text-success', icon: CircleCheck },
  info: { box: 'border-info/30 bg-info-soft text-info', icon: Info },
  warning: { box: 'border-warning/30 bg-warning-soft text-warning', icon: TriangleAlert },
  danger: { box: 'border-danger/30 bg-danger-soft text-danger', icon: CircleAlert },
} as const;

/**
 * Shows the scan app's toast just under the header: out of the thumb's way and clear of the
 * bottom action bar. Tap to close early. Solid soft background, no shadow (DESIGN §4.3).
 */
export function ScanToaster() {
  const t = useScanToast();
  return (
    <div
      aria-live={t?.tone === 'danger' ? 'assertive' : 'polite'}
      className="pointer-events-none fixed inset-x-0 top-[calc(3.25rem+env(safe-area-inset-top)+8px)] z-30 flex justify-center px-4"
    >
      {t && (() => {
        const tone = TONE[t.tone];
        const Icon = tone.icon;
        return (
          <button
            key={t.id}
            type="button"
            onClick={dismissToast}
            className={cn(
              'pointer-events-auto flex w-full max-w-[calc(28rem-2rem)] items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left text-small font-medium',
              'motion-safe:animate-[fade-in_150ms_cubic-bezier(0.2,0,0,1)]',
              tone.box,
            )}
          >
            <Icon size={18} strokeWidth={2} aria-hidden className="mt-0.5 shrink-0" />
            <span className="min-w-0 flex-1">{t.text}</span>
            <X size={16} strokeWidth={2} aria-hidden className="mt-0.5 shrink-0 opacity-60" />
            <span className="sr-only">Tutup pesan</span>
          </button>
        );
      })()}
    </div>
  );
}

'use client';

import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function PrintBar({
  count,
  size = '50 × 30 mm',
  hint = 'Di dialog print: pilih printer thermal, ukuran kertas 50 × 30 mm, margin none, skala 100%.',
  onPrinted,
}: {
  count: number;
  size?: string;
  hint?: string;
  /** called after the print dialog closes (e.g. mark labels as printed) */
  onPrinted?: () => void;
}) {
  return (
    <div className="print-bar">
      <div>
        <p className="font-medium">
          {count} label, {size}
        </p>
        <p className="text-small text-text-muted">{hint}</p>
      </div>
      <Button
        onClick={() => {
          window.print(); // blocks until the dialog closes
          onPrinted?.();
        }}
      >
        <Printer size={16} strokeWidth={1.5} aria-hidden /> Cetak
      </Button>
    </div>
  );
}

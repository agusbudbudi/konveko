'use client';

import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function PrintBar({ count }: { count: number }) {
  return (
    <div className="print-bar">
      <div>
        <p className="font-medium">{count} label, 50 × 30 mm</p>
        <p className="text-small text-text-muted">
          Di dialog print: pilih printer thermal, ukuran kertas 50 × 30 mm, margin none, skala 100%.
        </p>
      </div>
      <Button onClick={() => window.print()}>
        <Printer size={16} strokeWidth={1.5} aria-hidden /> Cetak
      </Button>
    </div>
  );
}

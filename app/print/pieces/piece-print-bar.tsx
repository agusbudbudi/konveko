'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InlineAlert } from '@/components/ui/inline-alert';
import { markPrinted } from '@/app/(desk)/label/actions';
import { PrintBar } from '../labels/print-bar';

/**
 * The browser cannot tell whether the print dialog was cancelled, so after
 * printing we ask before marking the labels as printed.
 */
export function PiecePrintBar({ ids, canMark }: { ids: string[]; canMark: boolean }) {
  const [asked, setAsked] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <>
      <PrintBar count={ids.length} onPrinted={() => canMark && setAsked(true)} />
      {(asked || done || error) && (
        <div className="print-bar print-confirm">
          {done ? (
            <InlineAlert tone="success" className="w-full">
              {done}{' '}
              <Link href="/label" className="font-medium underline">
                Kembali ke antrian label
              </Link>
            </InlineAlert>
          ) : (
            <>
              <div>
                <p className="font-medium">Semua label keluar dengan benar?</p>
                <p className="text-small text-text-muted">Tandai tercetak supaya hilang dari antrian dan bisa di-scan masuk rak.</p>
                {error && <p className="mt-1 text-small text-danger">{error}</p>}
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setAsked(false)} disabled={pending}>
                  Belum
                </Button>
                <Button
                  className="whitespace-nowrap"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      setError(null);
                      const res = await markPrinted(ids);
                      if (res.ok) setDone(`${res.data} label ditandai tercetak.`);
                      else setError(res.message);
                    })
                  }
                >
                  <Check size={16} strokeWidth={1.5} aria-hidden /> Tandai {ids.length} tercetak
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}

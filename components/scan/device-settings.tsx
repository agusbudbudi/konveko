'use client';

import { useEffect, useState } from 'react';
import { Camera, ScanLine, Sparkles } from 'lucide-react';
import { InlineAlert } from '@/components/ui/inline-alert';
import { cn } from '@/lib/cn';
import { subscribeTrace, type KeyTrace, type ScanEvent } from '@/lib/scan/bus';
import { classifyCode, type CodeKind } from '@/lib/scan/normalize';
import { setScanPrefs, useScanPrefs, type InputMode } from '@/lib/scan/prefs';
import { useScanner } from '@/lib/scan/use-scanner';

const MODES: { value: InputMode; label: string; hint: string; icon: typeof Camera }[] = [
  { value: 'auto', label: 'Otomatis', hint: 'Kamera, lalu pindah sendiri ke scanner begitu tombol scan perangkat dipakai.', icon: Sparkles },
  { value: 'scanner', label: 'Scanner perangkat', hint: 'SUNMI, scanner genggam, atau scanner USB/Bluetooth. Kamera tidak dibuka.', icon: ScanLine },
  { value: 'camera', label: 'Kamera', hint: 'HP biasa tanpa scanner.', icon: Camera },
];

const KIND: Record<CodeKind, string> = {
  token: 'QR label',
  piece: 'Kode pcs',
  bundle: 'Kode bundle',
  batch: 'Kode batch',
  outbound: 'Surat jalan',
  other: 'Kode lain (rak atau SKU?)',
};

const SOURCE: Record<ScanEvent['source'], string> = { wedge: 'scanner (keyboard)', native: 'scanner (aplikasi)', camera: 'kamera' };

type Row = { id: number; code: string; source: ScanEvent['source']; kind: CodeKind; avgGap: number | null };

/**
 * Per-device scan setup: choose the input, then test it. The key log shows what the
 * scanner really sends (characters, suffix, ms between keys), which is what we need
 * to set up a new scanner model.
 *
 * One component for both entry points: /scan/perangkat (phones, SUNMI; no sidebar) and
 * /pengaturan/perangkat (desk). Pages only add their own title around it.
 */
export function DeviceSettings({
  className,
  part = 'all',
}: {
  className?: string;
  /**
   * all       desk /pengaturan/perangkat: everything on one page
   * basic     Akun tab: input choice and scan test
   * advanced  /scan/perangkat (linked from Akun): key log and setup guide, no repeat of the above
   */
  part?: 'all' | 'basic' | 'advanced';
}) {
  const prefs = useScanPrefs();
  const [rows, setRows] = useState<Row[]>([]);
  const [keys, setKeys] = useState<KeyTrace[]>([]);

  useScanner((code, e) => {
    navigator.vibrate?.(60);
    const avgGap = e.gaps?.length ? Math.round(e.gaps.reduce((a, b) => a + b, 0) / e.gaps.length) : null;
    setRows((r) => [{ id: Date.now(), code, source: e.source, kind: classifyCode(code), avgGap }, ...r].slice(0, 5));
  });

  useEffect(() => subscribeTrace((t) => setKeys((k) => [...k, t].slice(-60))), []);

  return (
    <div className={cn('flex flex-col gap-6', className)}>
      {part !== 'advanced' && (<>
      {part === 'all' && (
        <InlineAlert tone="info">
          Berlaku untuk perangkat ini saja. Pilihan disimpan di browser ini, tidak ikut ke perangkat atau akun lain.
        </InlineAlert>
      )}

      <section className="flex flex-col gap-2">
        <div>
          <h2 className="text-h3">Cara scan di perangkat ini</h2>
          {part === 'basic' && <p className="text-small text-text-muted">Disimpan di browser ini saja, tidak ikut ke akun.</p>}
        </div>
        <div role="radiogroup" aria-label="Cara scan" className="flex flex-col gap-2">
          {MODES.map((m) => {
            const on = prefs?.input === m.value;
            const Icon = m.icon;
            return (
              <button
                key={m.value}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setScanPrefs({ input: m.value })}
                className={cn(
                  'flex items-start gap-3 rounded-xl border p-4 text-left',
                  on ? 'border-primary bg-primary-soft' : 'border-border bg-surface hover:border-border-strong',
                )}
              >
                <Icon size={20} strokeWidth={1.5} aria-hidden className={cn('mt-0.5 shrink-0', on ? 'text-primary' : 'text-text-muted')} />
                <span>
                  <span className="block font-medium">{m.label}</span>
                  <span className="block text-small text-text-muted">{m.hint}</span>
                </span>
              </button>
            );
          })}
        </div>
        {prefs?.input === 'auto' && (
          <p className="text-small text-text-muted">
            {prefs.hardwareSeen ? 'Scanner perangkat sudah terdeteksi, kamera tidak dibuka lagi. ' : 'Scanner perangkat belum terdeteksi. '}
            {prefs.hardwareSeen && (
              <button type="button" className="underline" onClick={() => setScanPrefs({ hardwareSeen: false })}>
                Pakai kamera lagi
              </button>
            )}
          </p>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-h3">Tes scan</h2>
        <p className="text-small text-text-muted">Scan label apa saja. Tidak ada yang disimpan.</p>
        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border-strong bg-surface px-6 py-8 text-center">
            <ScanLine size={28} strokeWidth={1.5} aria-hidden className="text-primary" />
            <p className="text-small text-text-muted">Tekan tombol scan di perangkat.</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2" aria-live="polite">
            {rows.map((r, i) => (
              <li key={r.id} className={cn('rounded-xl border bg-surface p-3', i === 0 ? 'border-success' : 'border-border')}>
                <p className="num break-all font-medium">{r.code}</p>
                <p className="text-small text-text-muted">
                  {KIND[r.kind]} · lewat {SOURCE[r.source]}
                  {r.avgGap !== null && <> · {r.avgGap} ms/karakter</>}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
      </>)}

      {part !== 'basic' && (<>
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-h3">Log tombol</h2>
          {keys.length > 0 && (
            <button type="button" className="text-small text-text-muted underline" onClick={() => setKeys([])}>
              Kosongkan
            </button>
          )}
        </div>
        <p className="text-small text-text-muted">
          Untuk setup scanner baru. Kalau scan tidak muncul di Tes scan (tab Akun) tapi ada di sini, jeda antar karakter mungkin di atas 50 ms.
        </p>
        <div className="num max-h-48 overflow-y-auto rounded-md bg-surface-muted p-3 text-caption">
          {keys.length === 0 ? (
            <span className="text-text-muted">Belum ada tombol.</span>
          ) : (
            keys.map((k, i) => (
              <span key={i} className={cn('mr-2 inline-block', k.result === 'scan' && 'font-medium text-success')}>
                {k.key === ' ' ? '␣' : k.key}
                <span className="text-text-subtle">{k.gap === null ? '' : `+${Math.min(k.gap, 9999)}`}</span>
              </span>
            ))
          )}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-h3">Setup SUNMI (L2s, L2s Pro, L2H)</h2>
        <ol className="flex list-decimal flex-col gap-1 pl-5 text-small">
          <li>Buka Pengaturan, lalu Scanner (atau aplikasi Scanner Settings).</li>
          <li>Output: pilih output keyboard (simulasi tombol). Jangan pakai mode broadcast saja.</li>
          <li>Suffix / akhiran: Enter.</li>
          <li>Tidak perlu prefix. Kalau AIM ID aktif, sistem membuangnya sendiri.</li>
          <li>Opsional: matikan barcode 1D supaya SKU di label pcs tidak ikut terbaca.</li>
          <li>Buka Konveko di Chrome, lalu di Cara scan pilih &quot;Scanner perangkat&quot; dan coba di Tes scan.</li>
        </ol>
        <InlineAlert tone="info">
          Scanner lain (Zebra, Honeywell, Newland, scanner USB atau Bluetooth) diatur sama: output keyboard dengan akhiran Enter.
        </InlineAlert>
      </section>
      </>)}
    </div>
  );
}

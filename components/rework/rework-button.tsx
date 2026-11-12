'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Printer, Wrench, X } from 'lucide-react';
import { createRework, type ReworkResult } from '@/app/(desk)/rework/actions';
import { Button } from '@/components/ui/button';
import { InlineAlert } from '@/components/ui/inline-alert';
import { Input, Label } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { cn } from '@/lib/cn';
import { normalizeScan } from '@/lib/scan/normalize';
import { useScanner } from '@/lib/scan/use-scanner';
import { REWORK_SOURCE_LABEL, REWORK_STEP_LABEL, type ReworkSource, type ReworkStep } from '@/lib/types';

/** A reject or damaged pcs that can go to rework. */
export type ReworkCandidate = { code: string; source: ReworkSource; where: string | null };

const STEPS: { value: ReworkStep; hint: string }[] = [
  { value: 'jahit', hint: 'Perbaiki jahitan, lalu finishing seperti biasa.' },
  { value: 'finishing', hint: 'Cuci, setrika, atau QC ulang saja.' },
];

/**
 * "Kirim ke rework" (supervisor, admin). Two ways to pick pcs:
 *  - `candidates`: tick from a list (bundle detail, one pcs page)
 *  - `scan`: scan or type pcs codes (Rework page), from any bundle
 * The database groups the pcs per origin bundle and makes one rework bundle each.
 */
export function ReworkButton({
  candidates,
  scan = false,
  label = 'Kirim ke rework',
  variant = 'secondary',
}: {
  candidates?: ReworkCandidate[];
  scan?: boolean;
  label?: string;
  variant?: 'primary' | 'secondary';
}) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [text, setText] = useState('');
  const [step, setStep] = useState<ReworkStep>('jahit');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReworkResult | null>(null);
  const [pending, start] = useTransition();

  const list = candidates ?? [];
  // a sewing reject always goes back to jahit
  const onlyJahit =
    !scan && picked.length > 0 && picked.every((c) => list.find((x) => x.code === c)?.source === 'jahit');
  const effStep: ReworkStep = onlyJahit ? 'jahit' : step;

  const show = () => {
    setPicked(!scan && list.length === 1 ? [list[0].code] : []);
    setText('');
    setStep('jahit');
    setNote('');
    setError(null);
    setResult(null);
    setOpen(true);
  };

  const add = (raw: string) => {
    const code = normalizeScan(raw).toUpperCase();
    if (!code) return;
    setPicked((p) => (p.includes(code) ? p : [...p, code]));
    setText('');
  };
  useScanner((code) => add(code), open && scan && !result);

  const toggle = (code: string) => setPicked((p) => (p.includes(code) ? p.filter((c) => c !== code) : [...p, code]));

  const submit = () => {
    if (pending || picked.length === 0 || note.trim() === '') return;
    start(async () => {
      setError(null);
      const res = await createRework({ codes: picked, startStep: effStep, note });
      if (res.ok) setResult(res.data);
      else setError(res.message);
    });
  };

  return (
    <>
      <Button variant={variant} onClick={show}>
        <Wrench size={16} strokeWidth={1.5} aria-hidden /> {label}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={result ? 'Rework dibuat' : 'Kirim ke rework'} width={560}>
        {open && result && (
          <div className="flex flex-col gap-4 pb-5">
            <InlineAlert tone="success">{result.message}</InlineAlert>
            <ul className="divide-y divide-border rounded-md border border-border">
              {result.created.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <Link href={`/bundle/${c.id}`} className="num link-code font-medium" onClick={() => setOpen(false)}>
                      {c.code}
                    </Link>
                    <p className="text-small text-text-muted">
                      <span className="num">{c.qty}</span> pcs · {REWORK_SOURCE_LABEL[c.source]} dari{' '}
                      <span className="num">{c.of_code}</span> · mulai {REWORK_STEP_LABEL[c.start_step].toLowerCase()}
                    </p>
                  </div>
                  <Link
                    href={`/print/labels?bundle=${c.id}`}
                    className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-surface px-4 font-medium hover:border-border-strong"
                  >
                    <Printer size={16} strokeWidth={1.5} aria-hidden /> Cetak label
                  </Link>
                </li>
              ))}
            </ul>
            {result.skipped.length > 0 && (
              <InlineAlert tone="warning">
                {result.skipped.length} pcs dilewati:
                <ul className="mt-1">
                  {result.skipped.map((s) => (
                    <li key={s.code}>
                      <span className="num">{s.code}</span>: {s.reason}
                    </li>
                  ))}
                </ul>
              </InlineAlert>
            )}
            <p className="text-small text-text-muted">
              Tempel label bundle rework pada barangnya, lalu serahkan ke penjahit atau tim finishing. Label pcs lama tidak berlaku lagi.
            </p>
            <div className="flex justify-end">
              <Button onClick={() => setOpen(false)}>Selesai</Button>
            </div>
          </div>
        )}

        {open && !result && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            className="flex flex-col gap-5"
          >
            {scan ? (
              <div>
                <Label htmlFor="rework-code">Pcs reject atau rusak</Label>
                <Input
                  id="rework-code"
                  data-scan-field
                  autoComplete="off"
                  spellCheck={false}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      add(text);
                    }
                  }}
                  placeholder="Scan label pcs, atau ketik P-0000123 lalu Enter"
                />
                {picked.length > 0 && (
                  <ul className="mt-3 flex flex-wrap gap-1.5">
                    {picked.map((c) => (
                      <li key={c} className="num inline-flex h-8 items-center gap-1 rounded-sm border border-border pl-2 text-small">
                        {c}
                        <button
                          type="button"
                          onClick={() => toggle(c)}
                          aria-label={`Hapus ${c}`}
                          className="inline-flex size-8 items-center justify-center text-text-muted hover:text-text"
                        >
                          <X size={14} strokeWidth={1.5} aria-hidden />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-2 text-small text-text-muted">
                  Boleh campur dari beberapa bundle. Setiap bundle asal mendapat satu bundle rework.
                </p>
              </div>
            ) : (
              <fieldset>
                <div className="mb-1.5 flex items-center justify-between gap-3">
                  <legend className="font-medium">Pcs yang diperbaiki</legend>
                  {list.length > 1 && (
                    <button
                      type="button"
                      className="text-small font-medium text-primary hover:underline"
                      onClick={() => setPicked(picked.length === list.length ? [] : list.map((c) => c.code))}
                    >
                      {picked.length === list.length ? 'Kosongkan' : 'Pilih semua'}
                    </button>
                  )}
                </div>
                <ul className="max-h-64 divide-y divide-border overflow-y-auto rounded-md border border-border">
                  {list.map((c) => (
                    <li key={c.code}>
                      <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 hover:bg-surface-muted">
                        <input
                          type="checkbox"
                          className="size-4 accent-primary"
                          checked={picked.includes(c.code)}
                          onChange={() => toggle(c.code)}
                        />
                        <span className="num font-medium">{c.code}</span>
                        <span className="text-small text-text-muted">{REWORK_SOURCE_LABEL[c.source]}</span>
                        <span className="num ml-auto text-small text-text-subtle">{c.where ?? 'belum di rak'}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </fieldset>
            )}

            <fieldset>
              <legend className="mb-1.5 font-medium">Mulai dari</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {STEPS.map((s) => {
                  const disabled = s.value === 'finishing' && onlyJahit;
                  const active = effStep === s.value;
                  return (
                    <label
                      key={s.value}
                      className={cn(
                        'flex cursor-pointer gap-3 rounded-md border px-3 py-3',
                        active ? 'border-primary bg-primary-soft' : 'border-border hover:border-border-strong',
                        disabled && 'cursor-not-allowed opacity-50',
                      )}
                    >
                      <input
                        type="radio"
                        name="rework-step"
                        className="mt-1 accent-primary"
                        checked={active}
                        disabled={disabled}
                        onChange={() => setStep(s.value)}
                      />
                      <span>
                        <span className="font-medium">{REWORK_STEP_LABEL[s.value]}</span>
                        <span className="block text-small text-text-muted">{s.hint}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
              <p className="mt-2 text-small text-text-muted">Reject jahit selalu kembali ke jahit.</p>
            </fieldset>

            <div>
              <Label htmlFor="rework-note">Yang perlu diperbaiki</Label>
              <textarea
                id="rework-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                maxLength={500}
                placeholder="Misal: jahitan bahu lepas, noda di kerah"
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-text placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-soft"
              />
            </div>

            {error && <InlineAlert tone="danger">{error}</InlineAlert>}
            <div className="sticky bottom-0 -mx-5 mt-1 flex items-center justify-end gap-2 border-t border-border bg-surface px-5 py-3">
              <span className="num mr-auto text-small text-text-muted">{picked.length} pcs dipilih</span>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
                Batal
              </Button>
              <Button type="submit" disabled={pending || picked.length === 0 || note.trim() === ''}>
                {pending ? 'Menyimpan...' : 'Kirim ke rework'}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}

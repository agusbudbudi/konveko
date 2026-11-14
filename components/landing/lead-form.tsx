'use client';

import { useActionState, useState } from 'react';
import { CircleCheck, Loader2 } from 'lucide-react';
import { submitLead, type LeadState } from '@/app/actions/lead';
import { Button } from '@/components/ui/button';
import { InlineAlert } from '@/components/ui/inline-alert';
import { Input, Label } from '@/components/ui/input';
import { WA_ASK_URL } from './contact';

const initial: LeadState = { status: 'idle', message: null };
const TEAM_SIZES = ['1-10', '11-30', '31-100', '100+'];

/** For visitors who would rather be contacted than open WhatsApp themselves. */
export function LeadForm() {
  const [state, action, pending] = useActionState(submitLead, initial);
  // Controlled so they survive the form reset React 19 does after an action.
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [size, setSize] = useState('');

  if (state.status === 'sent') {
    return (
      <div role="status" className="flex flex-col items-start gap-3 rounded-lg bg-surface p-5 sm:p-6">
        <span className="flex size-10 items-center justify-center rounded-full bg-success-soft text-success">
          <CircleCheck size={22} strokeWidth={1.5} aria-hidden />
        </span>
        <h3 className="text-h2">Nomor kamu sudah kami terima.</h3>
        <p className="text-pretty text-text-muted">
          Tim Konveko akan menghubungi {name.trim() || 'kamu'} lewat WhatsApp di nomor yang kamu isi.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4 rounded-lg bg-surface p-5 sm:p-6">
      <div className="flex flex-col gap-1">
        <h3 className="text-h2">Atau tinggalkan nomor kamu</h3>
        <p className="text-small text-text-muted">Kami yang menghubungi lewat WhatsApp.</p>
      </div>

      <div>
        <Label htmlFor="lead-name">Nama</Label>
        <Input
          id="lead-name"
          name="name"
          autoComplete="name"
          placeholder="Nama kamu"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          minLength={2}
          maxLength={80}
          className="h-12 text-[16px]"
        />
      </div>
      <div>
        <Label htmlFor="lead-phone">Nomor WhatsApp</Label>
        <Input
          id="lead-phone"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="0812 3456 7890"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          required
          className="num h-12 text-[16px]"
        />
      </div>
      {/* Buttons plus a hidden field, not radios: the form reset React does after an action would uncheck them. */}
      <div role="group" aria-labelledby="lead-size-label">
        <p id="lead-size-label" className="mb-1.5 font-medium text-text">
          Jumlah orang di tim produksi <span className="font-normal text-text-muted">(opsional)</span>
        </p>
        <input type="hidden" name="team_size" value={size} />
        <div className="grid grid-cols-4 gap-2">
          {TEAM_SIZES.map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={size === t}
              onClick={() => setSize(size === t ? '' : t)}
              className="num flex h-11 cursor-pointer items-center justify-center rounded-md border border-border-strong bg-surface text-small font-medium text-text transition-colors hover:border-primary aria-pressed:border-primary aria-pressed:bg-primary-soft aria-pressed:text-primary"
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Honeypot: hidden from people and assistive tech, tempting to bots. */}
      <div aria-hidden className="absolute -left-[9999px] size-px overflow-hidden">
        <label>
          Website
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      {state.status === 'error' && (
        <InlineAlert tone="danger">
          {state.message}{' '}
          <a href={WA_ASK_URL} className="font-semibold underline underline-offset-3">
            Buka WhatsApp
          </a>
        </InlineAlert>
      )}

      <Button type="submit" size="lg" disabled={pending} className="w-full cursor-pointer">
        {pending ? (
          <>
            <Loader2 size={18} strokeWidth={1.5} aria-hidden className="animate-spin" />
            Mengirim
          </>
        ) : (
          'Minta dihubungi'
        )}
      </Button>
      <p className="text-caption font-normal text-text-muted">Nomor kamu hanya dipakai untuk menghubungi soal Konveko.</p>
    </form>
  );
}

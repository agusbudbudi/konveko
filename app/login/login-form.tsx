'use client';

import { useActionState, useEffect, useState } from 'react';
import { Eye, EyeOff, Loader2, Mail, Smartphone } from 'lucide-react';
import { loginWithEmail, loginWithPin, type LoginState } from '@/app/actions/auth';
import { Button } from '@/components/ui/button';
import { InlineAlert } from '@/components/ui/inline-alert';
import { Input, Label } from '@/components/ui/input';
import { cn } from '@/lib/cn';

type Mode = 'pin' | 'email';
const initial: LoginState = { error: null };
const MODE_KEY = 'konveko:login-mode';

export function LoginForm({ next }: { next: string }) {
  const [mode, setMode] = useState<Mode>('pin');
  // Controlled so they survive the form reset React 19 does after an action.
  // Secrets stay uncontrolled and are cleared on error on purpose.
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [pinState, pinAction, pinPending] = useActionState(loginWithPin, initial);
  const [emailState, emailAction, emailPending] = useActionState(loginWithEmail, initial);
  const state = mode === 'pin' ? pinState : emailState;
  const pending = mode === 'pin' ? pinPending : emailPending;

  // Remember the last login method on this device (a convenience only).
  // The phone number itself is not stored: floor phones can be shared.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(MODE_KEY);
      if (saved === 'pin' || saved === 'email') setMode(saved);
    } catch {}
  }, []);
  const choose = (m: Mode) => {
    setMode(m);
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {}
  };

  return (
    <div className="mt-8">
      <div role="tablist" aria-label="Cara masuk" className="grid grid-cols-2 gap-1 rounded-md bg-surface-muted p-1">
        {(
          [
            { m: 'pin', label: 'Nomor HP', icon: Smartphone },
            { m: 'email', label: 'Email', icon: Mail },
          ] as const
        ).map(({ m, label, icon: Icon }) => (
          <button
            key={m}
            role="tab"
            type="button"
            id={`tab-${m}`}
            aria-selected={mode === m}
            aria-controls={`panel-${m}`}
            onClick={() => choose(m)}
            className={cn(
              'inline-flex h-10 items-center justify-center gap-2 rounded-md font-medium',
              mode === m ? 'border border-border bg-surface text-text' : 'text-text-muted hover:text-text',
            )}
          >
            <Icon size={16} strokeWidth={1.5} aria-hidden />
            {label}
          </button>
        ))}
      </div>

      <form
        key={mode}
        id={`panel-${mode}`}
        role="tabpanel"
        aria-labelledby={`tab-${mode}`}
        action={mode === 'pin' ? pinAction : emailAction}
        className="mt-6 flex flex-col gap-5"
      >
        <input type="hidden" name="next" value={next} />

        {mode === 'pin' ? (
          <>
            <div>
              <Label htmlFor="phone">Nomor HP</Label>
              <Input
                id="phone"
                name="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="0812 3456 7890"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                autoFocus
                className="num h-12"
              />
              <p className="mt-1.5 text-small text-text-muted">Boleh diawali 08, 8, atau +62.</p>
            </div>
            <SecretField
              id="pin"
              label="PIN"
              numeric
              hint="6 angka. Lupa PIN? Minta admin menggantinya."
            />
          </>
        ) : (
          <>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="nama@perusahaan.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                className="h-12"
              />
            </div>
            <SecretField id="password" label="Password" hint="Lupa password? Minta admin menggantinya." />
          </>
        )}

        {state.error && <InlineAlert tone="danger">{state.error}</InlineAlert>}

        <Button type="submit" size="lg" disabled={pending} className="mt-1 w-full">
          {pending ? (
            <>
              <Loader2 size={20} strokeWidth={1.5} className="motion-safe:animate-spin" aria-hidden /> Memeriksa
            </>
          ) : (
            'Masuk'
          )}
        </Button>
      </form>
    </div>
  );
}

/** PIN or password with show/hide and a Caps Lock warning for passwords. */
function SecretField({ id, label, hint, numeric }: { id: string; label: string; hint: string; numeric?: boolean }) {
  const [visible, setVisible] = useState(false);
  const [capsLock, setCapsLock] = useState(false);

  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          name={id}
          type={visible ? 'text' : 'password'}
          inputMode={numeric ? 'numeric' : undefined}
          pattern={numeric ? '\\d{6}' : undefined}
          maxLength={numeric ? 6 : undefined}
          autoComplete="current-password"
          required
          onKeyUp={(e) => !numeric && setCapsLock(e.getModifierState('CapsLock'))}
          onBlur={() => setCapsLock(false)}
          className={cn('h-12 pr-24', numeric && 'num text-[20px] tracking-[0.4em]')}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-pressed={visible}
          aria-controls={id}
          className="absolute inset-y-1 right-1 inline-flex items-center gap-1.5 rounded-md px-3 text-small text-text-muted hover:bg-surface-muted hover:text-text"
        >
          {visible ? <EyeOff size={16} strokeWidth={1.5} aria-hidden /> : <Eye size={16} strokeWidth={1.5} aria-hidden />}
          {visible ? 'Sembunyikan' : 'Lihat'}
        </button>
      </div>
      {capsLock && <p className="mt-1.5 text-small text-warning">Caps Lock aktif.</p>}
      <p className="mt-1.5 text-small text-text-muted">{hint}</p>
    </div>
  );
}

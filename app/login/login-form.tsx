'use client';

import { useActionState, useState } from 'react';
import { loginWithEmail, loginWithPin, type LoginState } from '@/app/actions/auth';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { InlineAlert } from '@/components/ui/inline-alert';
import { cn } from '@/lib/cn';

const initial: LoginState = { error: null };

export function LoginForm({ next }: { next: string }) {
  const [mode, setMode] = useState<'pin' | 'email'>('pin');
  const [pinState, pinAction, pinPending] = useActionState(loginWithPin, initial);
  const [emailState, emailAction, emailPending] = useActionState(loginWithEmail, initial);
  const state = mode === 'pin' ? pinState : emailState;
  const pending = mode === 'pin' ? pinPending : emailPending;

  return (
    <div className="mt-6">
      <div role="tablist" className="grid grid-cols-2 gap-1 rounded-md bg-surface-muted p-1">
        {(['pin', 'email'] as const).map((m) => (
          <button
            key={m}
            role="tab"
            type="button"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={cn(
              'h-10 rounded-md font-medium',
              mode === m ? 'border border-border bg-surface text-text' : 'text-text-muted',
            )}
          >
            {m === 'pin' ? 'Nomor HP' : 'Email'}
          </button>
        ))}
      </div>

      <form action={mode === 'pin' ? pinAction : emailAction} className="mt-6 flex flex-col gap-4">
        <input type="hidden" name="next" value={next} />
        {mode === 'pin' ? (
          <>
            <div>
              <Label htmlFor="phone">Nomor HP</Label>
              <Input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="0812 3456 7890" required />
            </div>
            <div>
              <Label htmlFor="pin">PIN</Label>
              <Input
                id="pin"
                name="pin"
                type="password"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                autoComplete="current-password"
                placeholder="6 angka"
                className="num tracking-[0.3em]"
                required
              />
            </div>
          </>
        ) : (
          <>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" autoComplete="email" required />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input id="password" name="password" type="password" autoComplete="current-password" required />
            </div>
          </>
        )}

        {state.error && <InlineAlert tone="danger">{state.error}</InlineAlert>}

        <Button type="submit" size="lg" disabled={pending} className="mt-2 w-full">
          {pending ? 'Memeriksa...' : 'Masuk'}
        </Button>
      </form>
    </div>
  );
}

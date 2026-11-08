'use client';

import { useActionState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { InlineAlert } from '@/components/ui/inline-alert';
import { Input, Label, Select } from '@/components/ui/input';
import { cn } from '@/lib/cn';
import { initialForm, type FormState } from '@/lib/master';

export type Field = {
  name: string;
  label: string;
  type?: 'text' | 'select' | 'decimal';
  options?: { value: string; label: string }[];
  required?: boolean;
  mono?: boolean;
  placeholder?: string;
  hint?: string;
  span?: 1 | 2;
};

export function EntityForm({
  fields,
  action,
  values = {},
  submitLabel,
  onDone,
  onCancel,
}: {
  fields: Field[];
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  values?: Record<string, string | number | null | undefined>;
  submitLabel: string;
  onDone?: () => void;
  onCancel?: () => void;
}) {
  // React 19 resets the form after an action; keep what was typed so an
  // error does not wipe the fields.
  const lastSubmitted = useRef<Record<string, string>>({});
  const [state, formAction, pending] = useActionState(async (prev: FormState, fd: FormData) => {
    lastSubmitted.current = Object.fromEntries([...fd.entries()].map(([k, v]) => [k, String(v)]));
    return action(prev, fd);
  }, initialForm);
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);
  useEffect(() => {
    if (state.ok) onDoneRef.current?.();
  }, [state]);

  return (
    <form key={state.at} action={formAction} className="flex flex-col gap-4 rounded-md border border-border-strong bg-surface p-4">
      {values.id && <input type="hidden" name="id" value={String(values.id)} />}
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map((f) => {
          const id = `f-${f.name}-${values.id ?? 'new'}`;
          const value = (state.error ? lastSubmitted.current[f.name] : undefined) ?? values[f.name] ?? '';
          return (
            <div key={f.name} className={cn(f.span === 2 && 'sm:col-span-2')}>
              <Label htmlFor={id}>
                {f.label}
                {!f.required && <span className="font-normal text-text-muted"> (opsional)</span>}
              </Label>
              {f.type === 'select' ? (
                <Select id={id} name={f.name} defaultValue={String(value)} required={f.required} className="h-10">
                  {!f.required && <option value="">-</option>}
                  {f.required && value === '' && (
                    <option value="" disabled>
                      Pilih
                    </option>
                  )}
                  {f.options?.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              ) : (
                <Input
                  id={id}
                  name={f.name}
                  defaultValue={String(value)}
                  required={f.required}
                  placeholder={f.placeholder}
                  inputMode={f.type === 'decimal' ? 'decimal' : undefined}
                  autoComplete="off"
                  className={cn('h-10', f.mono && 'num', f.type === 'decimal' && 'text-right')}
                />
              )}
              {f.hint && <p className="mt-1 text-small text-text-muted">{f.hint}</p>}
            </div>
          );
        })}
      </div>
      {state.error && <InlineAlert tone="danger">{state.error}</InlineAlert>}
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
            Batal
          </Button>
        )}
        <Button type="submit" disabled={pending}>
          {pending ? 'Menyimpan...' : submitLabel}
        </Button>
      </div>
    </form>
  );
}

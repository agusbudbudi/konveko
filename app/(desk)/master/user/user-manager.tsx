'use client';

import { useActionState, useEffect, useRef, useState, useTransition } from 'react';
import { KeyRound, Pencil, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InlineAlert } from '@/components/ui/inline-alert';
import { Input, Label, Select } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Badge } from '@/components/ui/status-badge';
import { cn } from '@/lib/cn';
import { initialForm, type FormState } from '@/lib/master';
import { createUser, resetSecret, setUserActive, updateUser } from '../actions';

export type UserRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  roles: string[];
  holder_id: string | null;
  is_active: boolean;
};
type Holder = { id: string; name: string; type: string };

const ROLES = [
  { value: 'penjahit', label: 'Penjahit', hint: 'scan terima dan selesai jahit' },
  { value: 'finishing', label: 'Finishing', hint: 'scan terima dan selesai finishing' },
  { value: 'produksi', label: 'Produksi', hint: 'buat batch, pecah bundle, cetak label' },
  { value: 'supervisor', label: 'Supervisor', hint: 'koreksi scan, selesaikan selisih' },
  { value: 'admin', label: 'Admin', hint: 'master data dan user' },
];

export function UserManager({ meId, users, holders }: { meId: string; users: UserRow[]; holders: Holder[] }) {
  const [mode, setMode] = useState<{ kind: 'new' } | { kind: 'edit' | 'secret'; id: string } | null>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const holderName = new Map(holders.map((h) => [h.id, h.name]));
  const selected = mode && mode.kind !== 'new' ? users.find((u) => u.id === mode.id) : undefined;

  return (
    <>
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-small text-text-muted">Master data</p>
        <h1 className="text-h1">User</h1>
        <p className="mt-1 text-text-muted">Akun login, role, dan PIN. Penjahit dan finishing login pakai nomor HP + PIN.</p>
      </div>
      {mode?.kind !== 'new' && (
        <Button onClick={() => setMode({ kind: 'new' })}>
          <Plus size={16} strokeWidth={1.5} aria-hidden /> Tambah user
        </Button>
      )}
    </div>
    <section className="mt-6 overflow-hidden rounded-lg border border-border bg-surface">
      <p className="px-5 py-3 text-small text-text-muted">
        <span className="num text-text">{users.length}</span> user
        {users.some((u) => !u.is_active) && (
          <> · <span className="num">{users.filter((u) => !u.is_active).length}</span> nonaktif</>
        )}
      </p>

      {error && <p className="border-t border-border px-5 py-2 text-small text-danger">{error}</p>}

      <ul className="divide-y divide-border border-t border-border">
        {users.map((u) => (
          <li key={u.id} className={cn('px-5 py-3', !u.is_active && 'text-text-muted')}>
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">
                    {u.name} {u.id === meId && <span className="text-small font-normal text-text-muted">(Anda)</span>}
                  </p>
                  <p className="text-small text-text-muted">
                    {u.phone ? <span className="num">HP {u.phone}</span> : <span>{u.email}</span>}
                    {u.holder_id && <> · {holderName.get(u.holder_id) ?? 'pemegang nonaktif'}</>}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {u.roles.map((r) => (
                      <Badge key={r} tone="neutral">
                        {r}
                      </Badge>
                    ))}
                    {!u.is_active && <Badge tone="danger">Nonaktif</Badge>}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  <Button variant="ghost" onClick={() => setMode({ kind: 'edit', id: u.id })}>
                    <Pencil size={16} strokeWidth={1.5} aria-hidden /> Ubah
                  </Button>
                  <Button variant="ghost" onClick={() => setMode({ kind: 'secret', id: u.id })}>
                    <KeyRound size={16} strokeWidth={1.5} aria-hidden /> {u.phone ? 'Ganti PIN' : 'Ganti password'}
                  </Button>
                  {u.id !== meId && (
                    <Button
                      variant="ghost"
                      disabled={pending}
                      onClick={() =>
                        start(async () => {
                          setError(null);
                          const res = await setUserActive(u.id, !u.is_active);
                          if (!res.ok) setError(res.error);
                        })
                      }
                    >
                      {u.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                    </Button>
                  )}
                </div>
              </div>
          </li>
        ))}
      </ul>
    </section>

    <Modal
      open={mode !== null}
      onClose={() => setMode(null)}
      title={
        mode?.kind === 'new'
          ? 'Tambah user'
          : mode?.kind === 'edit'
            ? `Ubah user ${selected?.name ?? ''}`
            : `${selected?.phone ? 'Ganti PIN' : 'Ganti password'} ${selected?.name ?? ''}`
      }
      width={mode?.kind === 'secret' ? 420 : 640}
    >
      {mode?.kind === 'new' && <UserForm holders={holders} onClose={() => setMode(null)} />}
      {mode?.kind === 'edit' && selected && (
        <UserForm key={selected.id} holders={holders} user={selected} isSelf={selected.id === meId} onClose={() => setMode(null)} />
      )}
      {mode?.kind === 'secret' && selected && <SecretForm key={selected.id} user={selected} onClose={() => setMode(null)} />}
    </Modal>
    </>
  );
}

function UserForm({ holders, user, isSelf, onClose }: { holders: Holder[]; user?: UserRow; isSelf?: boolean; onClose: () => void }) {
  // Keep typed values after an error (React 19 resets forms after an action). Secrets are not kept.
  const last = useRef<Record<string, string>>({});
  const [state, action, pending] = useActionState(async (prev: FormState, fd: FormData) => {
    last.current = Object.fromEntries([...fd.entries()].filter(([k]) => k !== 'secret').map(([k, v]) => [k, String(v)]));
    return (user ? updateUser : createUser)(prev, fd);
  }, initialForm);
  const kept = (k: string) => (state.error ? last.current[k] : undefined);
  const [login, setLogin] = useState<'pin' | 'email'>('pin');
  const [roles, setRoles] = useState<string[]>(user?.roles ?? ['penjahit']);
  useEffect(() => {
    if (state.ok) onClose();
  }, [state, onClose]);

  const floor = roles.includes('penjahit') || roles.includes('finishing');

  return (
    <form key={state.at} action={action} className="flex flex-col gap-5">
      {user && <input type="hidden" name="id" value={user.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="u-name">Nama</Label>
          <Input id="u-name" name="name" defaultValue={kept('name') ?? user?.name} required autoFocus className="h-10" />
        </div>

        {!user && (
          <div>
            <Label htmlFor="u-login">Cara login</Label>
            <Select id="u-login" name="login" value={login} onChange={(e) => setLogin(e.target.value as 'pin' | 'email')} className="h-10">
              <option value="pin">Nomor HP + PIN (untuk lantai produksi)</option>
              <option value="email">Email + password</option>
            </Select>
          </div>
        )}

        {!user &&
          (login === 'pin' ? (
            <>
              <div>
                <Label htmlFor="u-phone">Nomor HP</Label>
                <Input id="u-phone" name="phone" defaultValue={kept('phone')} type="tel" inputMode="tel" placeholder="0812 3456 7890" required className="num h-10" />
              </div>
              <div>
                <Label htmlFor="u-pin">PIN awal</Label>
                <Input id="u-pin" name="secret" inputMode="numeric" pattern="\d{6}" maxLength={6} placeholder="6 angka" autoComplete="new-password" required className="num h-10" />
                <p className="mt-1 text-small text-text-muted">Hindari angka sama atau berurutan.</p>
              </div>
            </>
          ) : (
            <>
              <div>
                <Label htmlFor="u-email">Email</Label>
                <Input id="u-email" name="email" defaultValue={kept('email')} type="email" required className="h-10" />
              </div>
              <div>
                <Label htmlFor="u-pass">Password awal</Label>
                <Input id="u-pass" name="secret" type="password" minLength={8} autoComplete="new-password" required className="h-10" />
              </div>
            </>
          ))}

        <fieldset className="sm:col-span-2">
          <legend className="mb-1.5 font-medium">Role</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {ROLES.map((r) => {
              const locked = isSelf && r.value === 'admin';
              return (
                <label key={r.value} className="flex items-start gap-3 rounded-md border border-border px-3 py-2 transition-colors hover:border-border-strong has-[:checked]:border-primary has-[:checked]:bg-primary-soft has-[:disabled]:opacity-70">
                  <input
                    type="checkbox"
                    name="roles"
                    value={r.value}
                    checked={roles.includes(r.value)}
                    disabled={locked}
                    onChange={(e) => setRoles((rs) => (e.target.checked ? [...rs, r.value] : rs.filter((x) => x !== r.value)))}
                    className="mt-0.5"
                  />
                  {locked && <input type="hidden" name="roles" value="admin" />}
                  <span>
                    {r.label}
                    <span className="block text-small text-text-muted">{r.hint}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="sm:col-span-2">
          <Label htmlFor="u-holder">Pemegang bundle {!floor && <span className="font-normal text-text-muted">(opsional)</span>}</Label>
          <Select id="u-holder" name="holder_id" defaultValue={kept('holder_id') ?? user?.holder_id ?? (floor ? 'auto' : '')} className="h-10">
            <option value="">-</option>
            <option value="auto">Buat baru dengan nama user ini</option>
            {holders.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name} ({h.type})
              </option>
            ))}
          </Select>
          <p className="mt-1 text-small text-text-muted">Penjahit dan finishing wajib punya pemegang, supaya bundle tercatat di tangan siapa.</p>
        </div>
      </div>

      {state.error && <InlineAlert tone="danger">{state.error}</InlineAlert>}
      <div className="sticky bottom-0 -mx-5 mt-1 flex justify-end gap-2 border-t border-border bg-surface px-5 py-3">
        <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
          Batal
        </Button>
        <Button type="submit" disabled={pending || roles.length === 0}>
          {pending ? 'Menyimpan...' : user ? 'Simpan perubahan' : 'Buat user'}
        </Button>
      </div>
    </form>
  );
}

function SecretForm({ user, onClose }: { user: UserRow; onClose: () => void }) {
  const [state, action, pending] = useActionState(resetSecret, initialForm);
  const isPin = Boolean(user.phone);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={user.id} />
      <Label htmlFor={`s-${user.id}`}>{isPin ? 'PIN baru' : 'Password baru'}</Label>
      <Input
        id={`s-${user.id}`}
        name="secret"
        type={isPin ? 'text' : 'password'}
        inputMode={isPin ? 'numeric' : undefined}
        pattern={isPin ? '\\d{6}' : undefined}
        maxLength={isPin ? 6 : 72}
        minLength={isPin ? 6 : 8}
        autoComplete="new-password"
        required
        autoFocus
        className="num h-10"
      />
      {state.error && <InlineAlert tone="danger">{state.error}</InlineAlert>}
      {state.ok && <InlineAlert tone="success">{isPin ? 'PIN' : 'Password'} sudah diganti. Beritahu user secara langsung.</InlineAlert>}
      <div className="sticky bottom-0 -mx-5 mt-1 flex justify-end gap-2 border-t border-border bg-surface px-5 py-3">
        <Button type="button" variant="ghost" onClick={onClose}>
          Tutup
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? 'Menyimpan...' : 'Simpan'}
        </Button>
      </div>
    </form>
  );
}

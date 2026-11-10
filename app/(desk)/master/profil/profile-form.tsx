'use client';

import { useActionState, useEffect, useState } from 'react';
import { ImageUp, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InlineAlert } from '@/components/ui/inline-alert';
import { Input, Label } from '@/components/ui/input';
import type { BusinessProfile } from '@/lib/business';
import { initialForm } from '@/lib/master';
import { saveBusinessProfile } from '../actions';

/** Business profile form with a live preview of the surat jalan header. */
export function ProfileForm({ profile, canEdit }: { profile: BusinessProfile; canEdit: boolean }) {
  const [state, action, pending] = useActionState(saveBusinessProfile, initialForm);
  const [name, setName] = useState(profile.name ?? '');
  const [address, setAddress] = useState(profile.address ?? '');
  const [phone, setPhone] = useState(profile.phone ?? '');
  const [email, setEmail] = useState(profile.email ?? '');
  const [logo, setLogo] = useState<string | null>(profile.logoUrl);
  const [removeLogo, setRemoveLogo] = useState(false);

  // after a save, show what the server now has (a new signed logo URL)
  useEffect(() => {
    if (state.ok) {
      setLogo(profile.logoUrl);
      setRemoveLogo(false);
    }
  }, [state, profile.logoUrl]);

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <form action={action} className="flex flex-col gap-5 rounded-lg border border-border bg-surface p-5">
        <fieldset disabled={!canEdit || pending} className="flex flex-col gap-5">
          <div>
            <Label htmlFor="bp-name">Nama usaha</Label>
            <Input id="bp-name" name="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="Konveksi Sinar Jaya" className="h-10" />
          </div>
          <div>
            <Label htmlFor="bp-address">Alamat</Label>
            <textarea
              id="bp-address"
              name="address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              maxLength={300}
              rows={3}
              placeholder="Jl. Contoh No. 12, Bandung"
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-text placeholder:text-text-muted focus:border-primary focus:ring-2 focus:ring-primary-soft focus:outline-none"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="bp-phone">Telepon</Label>
              <Input id="bp-phone" name="phone" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={40} inputMode="tel" placeholder="0812 3456 7890" className="h-10" />
            </div>
            <div>
              <Label htmlFor="bp-email">
                Email <span className="font-normal text-text-muted">(opsional)</span>
              </Label>
              <Input id="bp-email" name="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={120} className="h-10" />
            </div>
          </div>
          <div>
            <Label htmlFor="bp-logo">Logo</Label>
            <div className="flex flex-wrap items-center gap-3">
              <label
                htmlFor="bp-logo"
                className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-md border border-border bg-surface px-4 font-medium hover:border-border-strong"
              >
                <ImageUp size={16} strokeWidth={1.5} aria-hidden /> Pilih file
              </label>
              <input
                id="bp-logo"
                name="logo"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    setLogo(URL.createObjectURL(f));
                    setRemoveLogo(false);
                  }
                }}
              />
              {logo && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setLogo(null);
                    setRemoveLogo(true);
                    const input = document.getElementById('bp-logo') as HTMLInputElement | null;
                    if (input) input.value = '';
                  }}
                >
                  <Trash2 size={16} strokeWidth={1.5} aria-hidden /> Hapus logo
                </Button>
              )}
              <input type="hidden" name="remove_logo" value={removeLogo ? '1' : ''} />
            </div>
            <p className="mt-1 text-small text-text-muted">PNG, JPG, atau WEBP, maksimal 1 MB. Dicetak hitam-putih.</p>
          </div>
        </fieldset>

        {state.error && <InlineAlert tone="danger">{state.error}</InlineAlert>}
        {state.ok && !pending && <InlineAlert tone="success">Profil usaha tersimpan.</InlineAlert>}
        {canEdit && (
          <div className="flex justify-end border-t border-border pt-4">
            <Button type="submit" disabled={pending}>
              {pending ? 'Menyimpan...' : 'Simpan'}
            </Button>
          </div>
        )}
      </form>

      <section aria-label="Pratinjau kop surat jalan" className="flex flex-col gap-2">
        <p className="text-caption tracking-[0.02em] text-text-muted">Pratinjau kop surat jalan</p>
        <div className="rounded-lg border border-border bg-surface p-5">
          <div className="flex items-start gap-4 border-b-2 border-text pb-4 text-text">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element -- signed or local preview URL
              <img src={logo} alt="" className="size-16 shrink-0 object-contain grayscale" />
            ) : (
              <div className="flex size-16 shrink-0 items-center justify-center rounded-md border border-dashed border-border-strong text-caption text-text-subtle">Logo</div>
            )}
            <div className="min-w-0">
              <p className="text-h3">{name || 'Nama usaha'}</p>
              <p className="text-small whitespace-pre-line text-text-muted">{address || 'Alamat usaha'}</p>
              <p className="text-small text-text-muted">{[phone, email].filter(Boolean).join(' · ') || 'Telepon'}</p>
            </div>
            <div className="ml-auto text-right">
              <p className="text-h3">Surat jalan</p>
              <p className="num text-small text-text-muted">SJ-000001</p>
            </div>
          </div>
          <p className="mt-3 text-small text-text-subtle">Isi dokumen mengikuti barang yang di-scan.</p>
        </div>
      </section>
    </div>
  );
}

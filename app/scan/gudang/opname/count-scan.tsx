'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ChevronRight, CircleCheck, ClipboardList, PackagePlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Combobox } from '@/components/ui/combobox';
import { InlineAlert } from '@/components/ui/inline-alert';
import { Label } from '@/components/ui/input';
import { Badge } from '@/components/ui/status-badge';
import { normalizeScan } from '@/lib/scan/normalize';
import { toast } from '@/lib/scan/toast';
import { BigStepper, SuccessScreen, TaskHeader } from '../../scan-ui';
import { BottomBar, ScannerView } from '../../scanner-view';
import { countCloseRack, countScan, countUndo, countUnlabeled, type CountTally } from './actions';

export type CountRack = { code: string; kind: 'stok' | 'reject'; token: string; status: 'menghitung' | 'ditutup' };
export type OpenCount = { id: string; code: string; note: string | null; racks: CountRack[] };
export type UnlabeledLine = { variantId: string; label: string; qty: number };

type View = 'scan' | 'unlabeled' | 'close';

const CLOSED_MS = 1600;

/** Stok opname on the phone: pick a count, scan a rack, then count its pcs blind. */
export function CountScan({
  canWork,
  counts,
  selected,
  rack,
  initialTally,
  lines,
  variants,
}: {
  canWork: boolean;
  counts: OpenCount[];
  selected: OpenCount | null;
  rack: CountRack | null;
  initialTally: CountTally;
  lines: UnlabeledLine[];
  variants: { id: string; label: string; sku: string }[];
}) {
  if (!canWork) {
    return (
      <main className="px-4 pt-3">
        <InlineAlert tone="info">Hanya akun gudang atau supervisor yang bisa menghitung stok opname.</InlineAlert>
      </main>
    );
  }
  if (!selected) return <PickCount counts={counts} />;
  if (!rack) return <PickRack count={selected} />;
  if (rack.status !== 'menghitung') {
    return (
      <main className="px-4 pt-3">
        <InlineAlert tone="info">
          Rak <span className="num">{rack.code}</span> sudah ditutup. Minta supervisor membuka ulang kalau perlu dihitung ulang.
        </InlineAlert>
        <Link href={`/scan/gudang/opname?count=${selected.id}`} className="mt-4 inline-flex h-12 items-center gap-2 font-medium text-primary">
          <ArrowLeft size={20} strokeWidth={1.5} aria-hidden /> Pilih rak lain
        </Link>
      </main>
    );
  }
  return <CountRackView count={selected} rack={rack} initialTally={initialTally} lines={lines} variants={variants} />;
}

function PickCount({ counts }: { counts: OpenCount[] }) {
  return (
    <main className="flex flex-1 flex-col gap-3 px-4 pt-4 pb-6">
      <div>
        <h1 className="text-h2">Stok opname</h1>
        <p className="text-small text-text-muted">Pilih stok opname yang sedang dihitung.</p>
      </div>
      {counts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border-strong bg-surface">
          <EmptyState variant="count" compact hint="Buat dulu di desk: Gudang → Stok opname.">
            Belum ada stok opname yang sedang dihitung.
          </EmptyState>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {counts.map((c) => {
            const left = c.racks.filter((r) => r.status === 'menghitung').length;
            const done = c.racks.length - left;
            return (
              <li key={c.id}>
                <Link
                  href={`/scan/gudang/opname?count=${c.id}`}
                  className="flex min-h-16 items-center gap-3 rounded-lg border border-border bg-surface p-4 hover:border-border-strong"
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2">
                      <span className="num text-h3">{c.code}</span>
                      <Badge tone={left > 0 ? 'info' : 'success'}>{left > 0 ? `${left} rak lagi` : 'Selesai'}</Badge>
                    </p>
                    <p className="num truncate text-small text-text-muted">
                      {done} dari {c.racks.length} rak ditutup · {c.racks.map((r) => r.code).join(', ')}
                    </p>
                    {c.note && <p className="truncate text-small text-text-muted">{c.note}</p>}
                  </div>
                  <ChevronRight size={20} strokeWidth={1.5} aria-hidden className="shrink-0 text-text-subtle" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

function PickRack({ count }: { count: OpenCount }) {
  const router = useRouter();
  const onCode = useCallback(
    (raw: string) => {
      const code = normalizeScan(raw);
      const hit = count.racks.find((r) => r.token === code || r.code === code.toUpperCase());
      const reject = (text: string) => {
        navigator.vibrate?.([80, 60, 80]);
        toast('danger', text);
      };
      if (!hit) return reject(`Kode ${code} bukan rak di ${count.code}. Scan QR rak yang ada di daftar.`);
      if (hit.status !== 'menghitung') return reject(`Rak ${hit.code} sudah ditutup.`);
      navigator.vibrate?.(60);
      router.push(`/scan/gudang/opname?count=${count.id}&rak=${hit.code}`);
    },
    [count, router],
  );

  return (
    <main className="flex flex-1 flex-col px-4 pb-8">
      <TaskHeader href="/scan/gudang/opname" backLabel="Opname" title={<span className="num text-small font-normal text-text-muted">{count.code}</span>} />
      <ScannerView onCode={onCode} loading={false} kinds={['rack']} hint="Scan QR rak yang akan dihitung" className="-mx-4 max-h-[50dvh]" />
      <h2 className="mt-4 mb-2 text-h3">Atau pilih rak</h2>
      <ul className="grid grid-cols-3 gap-2">
        {count.racks.map((r) => (
          <li key={r.code}>
            {r.status === 'menghitung' ? (
              <Link
                href={`/scan/gudang/opname?count=${count.id}&rak=${r.code}`}
                className="num flex h-14 flex-col items-center justify-center rounded-md border border-border-strong bg-surface font-semibold hover:border-primary"
              >
                {r.code}
                <span className="text-caption font-normal text-text-muted">{r.kind === 'reject' ? 'reject' : 'stok'}</span>
              </Link>
            ) : (
              <span className="num flex h-14 flex-col items-center justify-center rounded-md bg-success-soft font-medium text-success">
                {r.code}
                <span className="text-caption font-normal">ditutup</span>
              </span>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}

function CountRackView({
  count,
  rack,
  initialTally,
  lines,
  variants,
}: {
  count: OpenCount;
  rack: CountRack;
  initialTally: CountTally;
  lines: UnlabeledLine[];
  variants: { id: string; label: string; sku: string }[];
}) {
  const router = useRouter();
  const [tally, setTally] = useState(initialTally);
  const [closed, setClosed] = useState<{ racksLeft: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<View>('scan');
  const [pending, start] = useTransition();
  const condition = rack.kind === 'stok' ? 'baik' : 'rusak';

  const onCode = useCallback(
    async (raw: string) => {
      setBusy(true);
      const res = await countScan(count.id, rack.code, raw);
      setBusy(false);
      if (!res.ok) {
        navigator.vibrate?.([80, 60, 80]);
        return toast('danger', res.message);
      }
      const d = res.data;
      setTally({ pieces: d.pieces, unlabeled: d.unlabeled, last: d.last });
      navigator.vibrate?.(d.duplicate || d.warning ? [80, 60, 80] : 40);
      if (d.warning) toast('warning', `${d.code}: ${d.warning}`);
      else toast(d.duplicate ? 'info' : 'success', d.message);
    },
    [count.id, rack.code],
  );

  const undo = (code: string) =>
    start(async () => {
      const res = await countUndo(count.id, rack.code, code);
      if (!res.ok) return toast('danger', res.message);
      setTally({ pieces: res.data.pieces, unlabeled: res.data.unlabeled, last: res.data.last });
      toast('info', res.data.message);
    });

  const next = closed && (closed.racksLeft > 0 ? `/scan/gudang/opname?count=${count.id}` : '/scan/gudang/opname');
  useEffect(() => {
    if (!next) return;
    const t = setTimeout(() => router.push(next), CLOSED_MS);
    return () => clearTimeout(t);
  }, [next, router]);

  if (closed) {
    return (
      <main className="flex flex-1 flex-col px-4">
        <SuccessScreen
          ms={CLOSED_MS}
          onNext={() => router.push(next!)}
          title={`Rak ${rack.code} ditutup`}
          subtitle={
            <>
              <span className="num font-semibold">{tally.pieces}</span> pcs berlabel
              {tally.unlabeled > 0 && (
                <>
                  {' '}
                  + <span className="num font-semibold">{tally.unlabeled}</span> tanpa label
                </>
              )}
            </>
          }
        >
          <p className="text-small">
            {closed.racksLeft > 0 ? `${closed.racksLeft} rak lagi di ${count.code}.` : `Semua rak ${count.code} sudah ditutup. Tunggu persetujuan supervisor.`}
          </p>
        </SuccessScreen>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col px-4">
      <TaskHeader href={`/scan/gudang/opname?count=${count.id}`} backLabel="Rak lain" title={<span className="num text-small font-normal text-text-muted">{count.code}</span>} />

      <section aria-live="polite" className="-mx-4 border-b border-primary/20 bg-primary-soft px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-caption text-primary-hover">Rak {rack.kind === 'reject' ? 'reject' : 'stok'}</p>
            <h1 className="num text-[28px] leading-9 font-semibold text-primary">{rack.code}</h1>
          </div>
          <div className="text-right">
            <p className="text-caption text-primary-hover">Sudah discan</p>
            <p className="num text-display">{tally.pieces}</p>
            {tally.unlabeled > 0 && <p className="num text-small text-primary-hover">+ {tally.unlabeled} tanpa label</p>}
          </div>
        </div>
      </section>

      {view === 'scan' && (
        <>
          <ScannerView onCode={onCode} loading={busy} kinds={['piece']} hint={`Scan setiap pcs di rak ${rack.code}`} loadingText="Mencatat..." className="-mx-4 max-h-[45dvh]" />
          {tally.last.length > 0 && (
            <section className="mt-4">
              <h2 className="text-small font-medium text-text-muted">Scan terakhir</h2>
              <ul className="mt-1 divide-y divide-border rounded-md border border-border bg-surface">
                {tally.last.map((c) => (
                  <li key={c} className="flex items-center justify-between pl-3">
                    <span className="num">{c}</span>
                    <button
                      type="button"
                      onClick={() => undo(c)}
                      disabled={pending}
                      aria-label={`Hapus scan ${c}`}
                      className="inline-flex size-12 items-center justify-center text-text-muted hover:text-danger"
                    >
                      <X size={20} strokeWidth={1.5} aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <BottomBar>
            <div className="flex gap-2">
              <Button size="lg" variant="secondary" className="h-14" onClick={() => setView('unlabeled')}>
                <PackagePlus size={20} strokeWidth={1.5} aria-hidden /> Tanpa label
              </Button>
              <Button size="lg" className="h-14 flex-1" onClick={() => setView('close')}>
                <CircleCheck size={20} strokeWidth={1.5} aria-hidden /> Tutup rak {rack.code}
              </Button>
            </div>
          </BottomBar>
        </>
      )}

      {view === 'unlabeled' && (
        <UnlabeledForm
          countId={count.id}
          rack={rack.code}
          condition={condition}
          lines={lines}
          variants={variants}
          onDone={(t, message) => {
            if (t) setTally(t);
            if (message) toast('success', message);
            setView('scan');
          }}
        />
      )}

      {view === 'close' && (
        <>
          <section aria-label="Konfirmasi tutup rak" className="mt-4 flex flex-col gap-3">
            <h2 className="text-h2">Tutup rak {rack.code}?</h2>
            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border">
              <div className="bg-surface px-3 py-2.5">
                <dt className="text-caption text-text-muted">Berlabel</dt>
                <dd className="num text-h1">{tally.pieces} pcs</dd>
              </div>
              <div className="bg-surface px-3 py-2.5">
                <dt className="text-caption text-text-muted">Tanpa label</dt>
                <dd className="num text-h1">{tally.unlabeled} pcs</dd>
              </div>
            </dl>
            <p className="rounded-md bg-warning-soft px-3 py-2.5 text-small text-warning">
              Setelah ditutup, rak ini tidak bisa discan lagi kecuali dibuka ulang oleh supervisor.
            </p>
            <button
              type="button"
              onClick={() => setView('scan')}
              disabled={pending}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-md border border-border-strong bg-surface font-medium hover:bg-surface-muted"
            >
              <ArrowLeft size={20} strokeWidth={1.75} aria-hidden /> Kembali scan
            </button>
          </section>
          <BottomBar>
            <Button
              size="lg"
              className="h-14 w-full"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await countCloseRack(count.id, rack.code);
                  if (!res.ok) {
                    setView('scan');
                    return toast('danger', res.message);
                  }
                  navigator.vibrate?.(60);
                  setClosed({ racksLeft: res.data.racks_left });
                })
              }
            >
              <ClipboardList size={20} strokeWidth={1.5} aria-hidden /> {pending ? 'Menutup...' : `Ya, tutup rak ${rack.code}`}
            </Button>
          </BottomBar>
        </>
      )}
    </main>
  );
}

function UnlabeledForm({
  countId,
  rack,
  condition,
  lines,
  variants,
  onDone,
}: {
  countId: string;
  rack: string;
  condition: 'baik' | 'rusak';
  lines: UnlabeledLine[];
  variants: { id: string; label: string; sku: string }[];
  onDone: (tally: CountTally | null, message: string | null) => void;
}) {
  const [variantId, setVariantId] = useState('');
  const [qty, setQty] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const existing = lines.find((l) => l.variantId === variantId);

  const save = (id: string, n: number) =>
    start(async () => {
      setError(null);
      const res = await countUnlabeled(countId, rack, id, condition, n);
      if (!res.ok) return setError(res.message);
      onDone({ pieces: res.data.pieces, unlabeled: res.data.unlabeled, last: res.data.last }, res.data.message);
    });

  return (
    <>
      <section className="mt-4 flex flex-col gap-4">
        <div>
          <h2 className="text-h2">Barang tanpa label</h2>
          <p className="text-small text-text-muted">
            Barang di rak ini yang belum punya label Konveko, kondisi <span className="font-medium text-text">{condition}</span>. Setelah
            opname disetujui, labelnya masuk antrean cetak.
          </p>
        </div>
        <div>
          <Label htmlFor="ul-variant">Variant</Label>
          <Combobox
            id="ul-variant"
            options={variants.map((v) => ({ value: v.id, label: v.label, hint: v.sku }))}
            value={variantId}
            onChange={(v) => {
              setVariantId(v);
              setQty(lines.find((l) => l.variantId === v)?.qty ?? 1);
            }}
            placeholder="Cari variant"
            searchable
            size="lg"
          />
        </div>
        <BigStepper id="ul-qty" label={existing ? 'Jumlah (mengganti yang dicatat)' : 'Jumlah'} value={qty} onChange={setQty} min={0} max={10000} />
        {lines.length > 0 && (
          <div>
            <h2 className="text-small font-medium text-text-muted">Sudah dicatat di rak ini</h2>
            <ul className="mt-1 divide-y divide-border rounded-md border border-border bg-surface">
              {lines.map((l) => (
                <li key={l.variantId} className="flex items-center justify-between gap-2 pl-3">
                  <span className="min-w-0 truncate">{l.label}</span>
                  <span className="flex items-center">
                    <span className="num font-medium">{l.qty}</span>
                    <button
                      type="button"
                      onClick={() => save(l.variantId, 0)}
                      disabled={pending}
                      aria-label={`Hapus ${l.label}`}
                      className="inline-flex size-12 items-center justify-center text-text-muted hover:text-danger"
                    >
                      <X size={20} strokeWidth={1.5} aria-hidden />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {error && <InlineAlert tone="danger">{error}</InlineAlert>}
        <button
          type="button"
          onClick={() => onDone(null, null)}
          disabled={pending}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-md border border-border-strong bg-surface font-medium hover:bg-surface-muted"
        >
          <ArrowLeft size={20} strokeWidth={1.75} aria-hidden /> Kembali scan
        </button>
      </section>
      <BottomBar>
        <Button size="lg" className="h-14 w-full" disabled={pending || !variantId} onClick={() => save(variantId, qty)}>
          {pending ? 'Menyimpan...' : !variantId ? 'Pilih variant dulu' : qty === 0 ? 'Hapus baris ini' : `Simpan ${qty} pcs tanpa label`}
        </Button>
      </BottomBar>
    </>
  );
}

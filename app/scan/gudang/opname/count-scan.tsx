'use client';

import { useCallback, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CircleCheck, ClipboardList, PackagePlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { InlineAlert } from '@/components/ui/inline-alert';
import { Label } from '@/components/ui/input';
import { QtyStepper } from '@/components/ui/qty-stepper';
import { Badge } from '@/components/ui/status-badge';
import { cn } from '@/lib/cn';
import { normalizeScan } from '@/lib/scan/normalize';
import { BottomBar, ScannerView } from '../../scan-app';
import { countCloseRack, countScan, countUndo, countUnlabeled, type CountTally } from './actions';

export type CountRack = { code: string; kind: 'stok' | 'reject'; token: string; status: 'menghitung' | 'ditutup' };
export type OpenCount = { id: string; code: string; note: string | null; racks: CountRack[] };
export type UnlabeledLine = { variantId: string; label: string; qty: number };

type Feedback = { tone: 'success' | 'warning' | 'danger' | 'info'; text: string } | null;
type View = 'scan' | 'unlabeled' | 'close';

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
    <main className="flex flex-col gap-3 px-4 pt-4 pb-8">
      <h1 className="text-h2">Pilih stok opname</h1>
      {counts.length === 0 ? (
        <InlineAlert tone="info">Belum ada stok opname yang sedang dihitung. Buat dulu di desk: Gudang → Stok opname.</InlineAlert>
      ) : (
        counts.map((c) => {
          const left = c.racks.filter((r) => r.status === 'menghitung').length;
          return (
            <Link
              key={c.id}
              href={`/scan/gudang/opname?count=${c.id}`}
              className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4 hover:border-border-strong"
            >
              <div>
                <p className="num text-h3">{c.code}</p>
                <p className="num text-small text-text-muted">Rak {c.racks.map((r) => r.code).join(', ')}</p>
                {c.note && <p className="text-small text-text-muted">{c.note}</p>}
              </div>
              <Badge tone={left > 0 ? 'info' : 'success'}>{left > 0 ? `${left} rak lagi` : 'Selesai'}</Badge>
            </Link>
          );
        })
      )}
    </main>
  );
}

function PickRack({ count }: { count: OpenCount }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const onCode = useCallback(
    (raw: string) => {
      const code = normalizeScan(raw);
      const hit = count.racks.find((r) => r.token === code || r.code === code.toUpperCase());
      if (!hit) return setError(`Kode ${code} bukan rak di ${count.code}. Scan QR rak yang ada di daftar.`);
      if (hit.status !== 'menghitung') return setError(`Rak ${hit.code} sudah ditutup.`);
      navigator.vibrate?.(60);
      router.push(`/scan/gudang/opname?count=${count.id}&rak=${hit.code}`);
    },
    [count, router],
  );

  return (
    <main className="flex flex-1 flex-col px-4 pb-8">
      <div className="mt-3 flex items-center justify-between">
        <Link href="/scan/gudang/opname" className="inline-flex h-10 items-center gap-1 text-small text-text-muted">
          <ArrowLeft size={16} strokeWidth={1.5} aria-hidden /> Opname
        </Link>
        <p className="num font-medium">{count.code}</p>
      </div>
      <p className="mt-2 text-h3">Scan QR rak yang akan dihitung</p>
      <ScannerView onCode={onCode} loading={false} label="Ketik kode rak" placeholder="A1" loadingText="" />
      {error && (
        <InlineAlert tone="danger" className="mt-3">
          {error}
        </InlineAlert>
      )}
      <ul className="mt-4 grid grid-cols-3 gap-2">
        {count.racks.map((r) => (
          <li key={r.code}>
            {r.status === 'menghitung' ? (
              <Link
                href={`/scan/gudang/opname?count=${count.id}&rak=${r.code}`}
                className="num flex h-14 flex-col items-center justify-center rounded-md border border-border bg-surface font-medium"
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
  const [feedback, setFeedback] = useState<Feedback>(null);
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
        return setFeedback({ tone: 'danger', text: res.message });
      }
      const d = res.data;
      setTally({ pieces: d.pieces, unlabeled: d.unlabeled, last: d.last });
      navigator.vibrate?.(d.duplicate || d.warning ? [80, 60, 80] : 40);
      setFeedback(
        d.warning
          ? { tone: 'warning', text: `${d.code}: ${d.warning}` }
          : { tone: d.duplicate ? 'info' : 'success', text: d.message },
      );
    },
    [count.id, rack.code],
  );

  const undo = (code: string) =>
    start(async () => {
      const res = await countUndo(count.id, rack.code, code);
      if (!res.ok) return setFeedback({ tone: 'danger', text: res.message });
      setTally({ pieces: res.data.pieces, unlabeled: res.data.unlabeled, last: res.data.last });
      setFeedback({ tone: 'info', text: res.data.message });
    });

  return (
    <main className="flex flex-1 flex-col px-4 pb-32">
      <div className="mt-3 flex items-center justify-between">
        <Link href={`/scan/gudang/opname?count=${count.id}`} className="inline-flex h-10 items-center gap-1 text-small text-text-muted">
          <ArrowLeft size={16} strokeWidth={1.5} aria-hidden /> Rak lain
        </Link>
        <p className="num text-small text-text-muted">{count.code}</p>
      </div>

      <section aria-live="polite" className="rounded-xl border border-border bg-surface p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-caption text-text-muted">Rak {rack.kind === 'reject' ? 'reject' : 'stok'}</p>
            <h1 className="num text-h1">{rack.code}</h1>
          </div>
          <div className="text-right">
            <p className="text-caption text-text-muted">Sudah discan</p>
            <p className="num text-display">{tally.pieces}</p>
            {tally.unlabeled > 0 && <p className="num text-small text-text-muted">+ {tally.unlabeled} tanpa label</p>}
          </div>
        </div>
        {feedback && (
          <p
            role="status"
            className={cn(
              'mt-3 rounded-md px-3 py-2 text-small',
              feedback.tone === 'success' && 'bg-success-soft text-success',
              feedback.tone === 'warning' && 'bg-warning-soft text-warning',
              feedback.tone === 'danger' && 'bg-danger-soft text-danger',
              feedback.tone === 'info' && 'bg-info-soft text-info',
            )}
          >
            {feedback.text}
          </p>
        )}
      </section>

      {view === 'scan' && (
        <>
          <ScannerView onCode={onCode} loading={busy} label="Ketik kode pcs" placeholder="P-0000123" loadingText="Mencatat..." />
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
              <Button size="lg" variant="secondary" onClick={() => setView('unlabeled')}>
                <PackagePlus size={20} strokeWidth={1.5} aria-hidden /> Tanpa label
              </Button>
              <Button size="lg" className="flex-1" onClick={() => setView('close')}>
                <CircleCheck size={20} strokeWidth={1.5} aria-hidden /> Selesai rak ini
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
            if (message) setFeedback({ tone: 'success', text: message });
            setView('scan');
          }}
        />
      )}

      {view === 'close' && (
        <>
          <InlineAlert tone="info" className="mt-4">
            Tutup rak <span className="num">{rack.code}</span> dengan <span className="num">{tally.pieces}</span> pcs berlabel
            {tally.unlabeled > 0 && (
              <>
                {' '}
                dan <span className="num">{tally.unlabeled}</span> pcs tanpa label
              </>
            )}
            ? Setelah ditutup, rak ini tidak bisa discan lagi kecuali dibuka ulang oleh supervisor.
          </InlineAlert>
          <BottomBar>
            <div className="flex gap-2">
              <Button size="lg" variant="secondary" onClick={() => setView('scan')} disabled={pending}>
                Kembali
              </Button>
              <Button
                size="lg"
                className="flex-1"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const res = await countCloseRack(count.id, rack.code);
                    if (!res.ok) {
                      setView('scan');
                      return setFeedback({ tone: 'danger', text: res.message });
                    }
                    navigator.vibrate?.(60);
                    router.push(res.data.racks_left > 0 ? `/scan/gudang/opname?count=${count.id}` : '/scan/gudang/opname');
                  })
                }
              >
                <ClipboardList size={20} strokeWidth={1.5} aria-hidden /> {pending ? 'Menutup...' : 'Tutup rak'}
              </Button>
            </div>
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
        <InlineAlert tone="info">
          Barang yang belum punya label Konveko. Setelah opname disetujui, sistem membuat pcs stok awal dan labelnya masuk antrean cetak.
          Kondisi: <strong>{condition}</strong> (sesuai jenis rak).
        </InlineAlert>
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
        <QtyStepper id="ul-qty" label={existing ? 'Jumlah (mengganti yang sudah dicatat)' : 'Jumlah'} value={qty} onChange={setQty} min={0} max={10000} />
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
      </section>
      <BottomBar>
        <div className="flex gap-2">
          <Button size="lg" variant="secondary" onClick={() => onDone(null, null)} disabled={pending}>
            Kembali
          </Button>
          <Button size="lg" className="flex-1" disabled={pending || !variantId} onClick={() => save(variantId, qty)}>
            {pending ? 'Menyimpan...' : qty === 0 ? 'Hapus baris' : 'Simpan'}
          </Button>
        </div>
      </BottomBar>
    </>
  );
}

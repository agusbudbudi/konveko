'use client';

import { useRef, useState, useTransition } from 'react';
import { FileSpreadsheet, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InlineAlert } from '@/components/ui/inline-alert';
import { TabButton, TabList } from '@/components/ui/tab-link';
import { cn } from '@/lib/cn';
import type { Table } from '@/lib/master-import';
import { applyImport, previewImport, type Applied, type Preview, type PreviewSheet } from './actions';

const SHEET_OF: Record<Table, string> = {
  product_variant: 'Variant',
  fabric_roll: 'Rol kain',
  location: 'Rak',
  holder: 'Penjahit dan tim',
  reason: 'Alasan',
};

function show(v: unknown) {
  if (v === true) return 'Ya';
  if (v === false) return 'Tidak';
  if (v === null || v === undefined || v === '') return '(kosong)';
  return String(v);
}

/** Pick a .xlsx, see what would change, then save it all at once (PRD: Import dan export master data). */
export function ImportPanel() {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [tab, setTab] = useState<Table | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<Applied | null>(null);
  const [checking, startCheck] = useTransition();
  const [saving, startSave] = useTransition();

  const check = (f: File) => {
    setFile(f);
    setPreview(null);
    setSaved(null);
    setError(null);
    startCheck(async () => {
      const fd = new FormData();
      fd.set('file', f);
      const res = await previewImport(fd);
      if (!res.ok) return setError(res.message);
      setPreview(res.data);
      const found = res.data.sheets.filter((s) => s.found);
      // open the first sheet with errors, else the first with changes
      setTab((found.find((s) => s.counts.errors) ?? found.find((s) => s.counts.added + s.counts.changed) ?? found[0]).table);
    });
  };

  const save = () =>
    startSave(async () => {
      if (!file || !preview) return;
      setError(null);
      const fd = new FormData();
      fd.set('file', file);
      fd.set('hash', preview.hash);
      const res = await applyImport(fd);
      if (!res.ok) {
        setError(res.message);
        // the data moved since the preview: show the new preview
        if (res.code === 'import_stale') check(file);
        return;
      }
      setSaved(res.data);
      setPreview(null);
      setFile(null);
      if (input.current) input.current.value = '';
    });

  const current = preview?.sheets.find((s) => s.table === tab);
  const canSave = !!preview && preview.errorCount === 0 && preview.changeCount > 0 && !saving;

  return (
    <section className="rounded-lg border border-border bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div>
          <h2 className="text-h2">Import</h2>
          <p className="text-small text-text-muted">Data yang sudah ada diperbarui, data baru ditambahkan. Tidak ada yang dihapus.</p>
        </div>
        <input
          ref={input}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) check(f);
          }}
        />
        <Button variant="secondary" onClick={() => input.current?.click()} disabled={checking || saving}>
          <Upload size={16} strokeWidth={1.5} aria-hidden /> {file ? 'Pilih file lain' : 'Pilih file .xlsx'}
        </Button>
      </div>

      <div className="flex flex-col gap-4 border-t border-border px-5 py-4">
        {!file && !saved && !error && (
          <p className="flex items-center gap-2 text-small text-text-muted">
            <FileSpreadsheet size={16} strokeWidth={1.5} aria-hidden /> Belum ada file. Mulai dari Export atau Template di atas.
          </p>
        )}
        {checking && <p className="text-small text-text-muted" aria-live="polite">Memeriksa {file?.name}...</p>}
        {error && <InlineAlert tone="danger">{error}</InlineAlert>}
        {saved && (
          <InlineAlert tone="success">
            Tersimpan.{' '}
            {(Object.entries(saved) as [Table, { added: number; changed: number }][])
              .filter(([, c]) => c.added + c.changed > 0)
              .map(([t, c]) => `${SHEET_OF[t]}: ${c.added} baru, ${c.changed} diubah`)
              .join(' · ') || 'Tidak ada perubahan.'}
          </InlineAlert>
        )}

        {preview && (
          <>
            <p className="text-small">
              <span className="font-medium">{preview.file}</span>
              <span className="text-text-muted">
                {' '}
                · {preview.changeCount} perubahan · {preview.errorCount} error
                {preview.sheets.some((s) => !s.found) && <> · tidak ada di file: {preview.sheets.filter((s) => !s.found).map((s) => s.sheet).join(', ')}</>}
              </span>
            </p>

            <TabList label="Sheet">
              {preview.sheets
                .filter((s) => s.found)
                .map((s) => (
                  <TabButton
                    key={s.table}
                    label={s.sheet}
                    active={s.table === tab}
                    count={s.counts.errors || s.counts.added + s.counts.changed}
                    onClick={() => setTab(s.table)}
                  />
                ))}
            </TabList>

            {current && <SheetView s={current} />}

            <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border pt-4">
              {preview.errorCount > 0 && <p className="text-small text-danger">Perbaiki {preview.errorCount} baris error di file, lalu pilih file lagi.</p>}
              {preview.errorCount === 0 && preview.changeCount === 0 && <p className="text-small text-text-muted">Semua data sama dengan sistem.</p>}
              <Button onClick={save} disabled={!canSave}>
                {saving ? 'Menyimpan...' : `Simpan ${preview.changeCount} perubahan`}
              </Button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function More({ shown, total }: { shown: number; total: number }) {
  if (total <= shown) return null;
  return <p className="text-small text-text-muted">Menampilkan {shown} dari {total}. Semuanya tetap diproses.</p>;
}

function SheetView({ s }: { s: PreviewSheet }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="num text-small text-text-muted">
        {s.counts.added} baru · {s.counts.changed} berubah · {s.same} sama · <span className={cn(s.counts.errors > 0 && 'text-danger')}>{s.counts.errors} error</span>
      </p>

      {s.errors.length > 0 && (
        <div>
          <h3 className="text-h3 text-danger">Error</h3>
          <ul className="mt-2 divide-y divide-border rounded-md border border-danger/40">
            {s.errors.map((e, i) => (
              <li key={i} className="flex gap-3 px-3 py-2 text-small">
                <span className="num w-20 shrink-0 text-text-muted">Baris {e.row}</span>
                <span>{e.message}</span>
              </li>
            ))}
          </ul>
          <More shown={s.errors.length} total={s.counts.errors} />
        </div>
      )}

      {s.changed.length > 0 && (
        <div>
          <h3 className="text-h3">Berubah</h3>
          <ul className="mt-2 divide-y divide-border rounded-md border border-border">
            {s.changed.map((c) => (
              <li key={c.id} className="flex flex-wrap gap-x-3 gap-y-1 px-3 py-2 text-small">
                <span className="num w-20 shrink-0 text-text-muted">Baris {c.row}</span>
                <span className="num font-medium">{c.label}</span>
                <span className="min-w-0 basis-full sm:basis-auto">
                  {c.changes.map((x, i) => (
                    <span key={x.field}>
                      {i > 0 && ' · '}
                      {x.header}: <span className="text-text-muted line-through">{show(x.from)}</span> → <span className="font-medium">{show(x.to)}</span>
                    </span>
                  ))}
                </span>
              </li>
            ))}
          </ul>
          <More shown={s.changed.length} total={s.counts.changed} />
        </div>
      )}

      {s.added.length > 0 && (
        <div>
          <h3 className="text-h3">Baru</h3>
          <ul className="mt-2 divide-y divide-border rounded-md border border-border">
            {s.added.map((a) => (
              <li key={a.row} className="flex flex-wrap gap-x-3 px-3 py-2 text-small">
                <span className="num w-20 shrink-0 text-text-muted">Baris {a.row}</span>
                <span className="num font-medium">{a.label}</span>
                <span className="text-text-muted">
                  {Object.entries(a.values)
                    .filter(([k]) => !['sku', 'code', 'is_active'].includes(k))
                    .map(([, v]) => show(v))
                    .join(' · ')}
                  {a.values.is_active === false && ' · nonaktif'}
                </span>
              </li>
            ))}
          </ul>
          <More shown={s.added.length} total={s.counts.added} />
        </div>
      )}

      {s.counts.added + s.counts.changed + s.counts.errors === 0 && <p className="text-small text-text-muted">Tidak ada perubahan di sheet ini.</p>}
    </div>
  );
}

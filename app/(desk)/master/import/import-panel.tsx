'use client';

import { useRef, useState, useTransition } from 'react';
import { AlertTriangle, CircleCheck, Download, FileSpreadsheet, Upload } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { InlineAlert } from '@/components/ui/inline-alert';
import { Badge } from '@/components/ui/status-badge';
import { TabButton, TabList } from '@/components/ui/tab-link';
import { cn } from '@/lib/cn';
import type { Table } from '@/lib/master-import';
import { applyImport, previewImport, type Applied, type Preview, type PreviewSheet } from './actions';

/** What a saved row is called in the summary, and where that master lives. */
const RESULT_OF: Record<Table, { noun: string; href: string }> = {
  product_variant: { noun: 'variant', href: '/master/variant' },
  fabric_roll: { noun: 'rol kain', href: '/master/rol' },
  location: { noun: 'rak', href: '/master/rak' },
  holder: { noun: 'penjahit dan tim', href: '/master/pemegang' },
  reason: { noun: 'alasan', href: '/master/alasan' },
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

  /** Preview `f`. `notice` stays on screen above the new preview (e.g. why a save was refused). */
  const check = (f: File, notice: string | null = null) => {
    setFile(f);
    setPreview(null);
    setSaved(null);
    setError(notice);
    startCheck(async () => {
      const fd = new FormData();
      fd.set('file', f);
      const res = await previewImport(fd);
      if (!res.ok) return setError(res.message);
      setError(notice);
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
        // the data moved since the preview: show the new preview, and say why nothing was saved
        if (res.code === 'import_stale') check(file, res.message);
        else setError(res.message);
        return;
      }
      setSaved(res.data);
      setPreview(null);
      setFile(null);
      if (input.current) input.current.value = '';
    });

  const current = preview?.sheets.find((s) => s.table === tab);
  // errors and unchanged rows are skipped; one new or changed row is enough to save
  const canSave = !!preview && preview.changeCount > 0 && !saving;

  return (
    <section className="rounded-lg border border-border bg-surface">
      <Modal open={!!saved} onClose={() => setSaved(null)} title="Import berhasil" width={480} closeOnBackdrop>
        {saved && <ImportResult saved={saved} onClose={() => setSaved(null)} />}
      </Modal>
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
            // clear at once, so picking the same (fixed) file again still fires onChange
            e.target.value = '';
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
              {preview.errorCount > 0 && preview.changeCount > 0 && (
                <p className="flex items-center gap-1.5 text-small text-warning">
                  <AlertTriangle size={16} strokeWidth={1.5} aria-hidden /> {preview.errorCount} baris error tidak ikut disimpan.
                </p>
              )}
              {preview.changeCount === 0 && (
                <p className="text-small text-text-muted">
                  {preview.errorCount > 0 ? 'Tidak ada data yang bisa disimpan. Perbaiki baris error di file, lalu pilih file lagi.' : 'Semua data sama dengan sistem.'}
                </p>
              )}
              <Button onClick={save} disabled={!canSave}>
                {saving
                  ? 'Menyimpan...'
                  : preview.errorCount > 0
                    ? `Simpan ${preview.changeCount} data, lewati ${preview.errorCount} error`
                    : `Simpan ${preview.changeCount} perubahan`}
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
  return <p className="mt-2 text-small text-text-muted">Menampilkan {shown} dari {total}. Semuanya tetap diproses.</p>;
}

/** Save a base64 .xlsx from the server as a file. */
function download(f: { name: string; base64: string }) {
  const bytes = Uint8Array.from(atob(f.base64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = f.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Summary after a save: per master how many rows were saved, and what was skipped. */
function ImportResult({ saved, onClose }: { saved: Applied; onClose: () => void }) {
  const rows = (Object.entries(saved.tables) as [Table, { added: number; changed: number }][]).filter(([, c]) => c.added + c.changed > 0);
  return (
    <div className="flex flex-col gap-5">
      <p className="flex items-start gap-2 text-small text-text-muted">
        <CircleCheck size={18} strokeWidth={1.5} aria-hidden className="mt-0.5 shrink-0 text-success" />
        <span>
          Data dari <span className="font-medium text-text">{saved.file}</span> sudah tersimpan.
        </span>
      </p>
      <ul className="divide-y divide-border rounded-md border border-border">
        {rows.map(([t, c]) => (
          <li key={t} className="flex items-center justify-between gap-3 px-4 py-3">
            <div>
              <p>
                <span className="num font-medium">{c.added + c.changed}</span> {RESULT_OF[t].noun} berhasil di-import
              </p>
              <p className="num text-small text-text-muted">
                {c.added} baru · {c.changed} diubah
              </p>
            </div>
            <Link href={RESULT_OF[t].href} className="shrink-0 text-small font-medium text-primary hover:underline">
              Lihat
            </Link>
          </li>
        ))}
      </ul>
      {(saved.skippedErrors > 0 || saved.skippedSame > 0) && (
        <div className="flex flex-col gap-1 text-small">
          {saved.skippedErrors > 0 && (
            <p className="flex items-center gap-1.5 text-warning">
              <AlertTriangle size={16} strokeWidth={1.5} aria-hidden /> {saved.skippedErrors} baris error dilewati.
            </p>
          )}
          {saved.skippedSame > 0 && <p className="text-text-muted">{saved.skippedSame} baris sama dengan sistem, dilewati.</p>}
        </div>
      )}
      {saved.errorFile && (
        <div className="flex flex-col gap-2 rounded-md border border-border bg-surface-muted p-4 text-small">
          <p>
            Unduh baris yang error saja, lengkap dengan alasannya di kolom paling kanan. Perbaiki di Excel, lalu import file itu lagi.
          </p>
          <Button variant="secondary" className="self-start" onClick={() => download(saved.errorFile!)}>
            <Download size={16} strokeWidth={1.5} aria-hidden /> Unduh {saved.skippedErrors} baris error (.xlsx)
          </Button>
        </div>
      )}
      <div className="sticky bottom-0 -mx-5 mt-1 flex justify-end gap-2 border-t border-border bg-surface px-5 py-3">
        <Button onClick={onClose}>Tutup</Button>
      </div>
    </div>
  );
}

/** A raw cell as typed in the file (error rows). */
function raw(v: unknown) {
  return v === null || v === undefined || String(v).trim() === '' ? <span className="text-text-subtle">—</span> : String(v);
}

type Col = PreviewSheet['columns'][number];

/** The sheet's own columns, a row number first and one extra column last. */
function PreviewTable({ columns, tail, children }: { columns: Col[]; tail: string; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full text-small">
        <thead className="bg-surface-muted text-left text-caption tracking-[0.02em] text-text-muted">
          <tr className="h-9">
            <th className="w-16 px-3 font-medium">Baris</th>
            {columns.map((c) => (
              <th key={c.field} className="px-3 font-medium whitespace-nowrap">
                {c.header}
              </th>
            ))}
            <th className="px-3 font-medium">{tail}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">{children}</tbody>
      </table>
    </div>
  );
}

/** Status of a valid row; only Baru and Berubah are saved. */
const STATUS = {
  baru: { label: 'Baru', tone: 'success' },
  berubah: { label: 'Berubah', tone: 'info' },
  sama: { label: 'Sama', tone: 'neutral' },
} as const;

function SheetView({ s }: { s: PreviewSheet }) {
  // a sheet-level problem (missing column, too many rows) has no row values
  const sheetErrors = s.errors.filter((e) => !e.values);
  const rowErrors = s.errors.filter((e) => e.values);
  const changedBy = new Map(s.changed.map((c) => [c.row, c]));
  const valid = [
    ...s.added.map((a) => ({ row: a.row, values: a.values, kind: 'baru' as const })),
    ...s.changed.map((c) => ({ row: c.row, values: c.values, kind: 'berubah' as const })),
    ...s.unchanged.map((u) => ({ row: u.row, values: u.values, kind: 'sama' as const })),
  ].sort((a, b) => a.row - b.row);
  const validTotal = s.counts.added + s.counts.changed + s.counts.same;

  return (
    <div className="flex flex-col gap-6">
      <p className="num text-small text-text-muted">
        {s.counts.added} baru · {s.counts.changed} berubah · {s.same} sama · <span className={cn(s.counts.errors > 0 && 'text-danger')}>{s.counts.errors} error</span>
        {s.samples > 0 && <> · {s.samples} baris contoh dilewati</>}
      </p>

      {sheetErrors.map((e, i) => (
        <InlineAlert key={i} tone="danger">
          {e.message}
        </InlineAlert>
      ))}

      {rowErrors.length > 0 && (
        <div>
          <h3 className="mb-2 flex items-center gap-2 text-h3 text-danger">
            <AlertTriangle size={18} strokeWidth={1.5} aria-hidden /> Error <span className="num font-normal">({s.counts.errors})</span>
          </h3>
          <PreviewTable columns={s.columns} tail="Alasan">
            {rowErrors.map((e) => (
              <tr key={e.row} className="align-top">
                <td className="num px-3 py-2 text-text-muted">{e.row}</td>
                {s.columns.map((c) => (
                  <td key={c.field} className="px-3 py-2 whitespace-nowrap">
                    {raw(e.values?.[c.field])}
                  </td>
                ))}
                <td className="min-w-64 px-3 py-2 text-danger">
                  <span className="flex items-start gap-1.5">
                    <AlertTriangle size={16} strokeWidth={1.5} aria-label="Error" className="mt-0.5 shrink-0" />
                    {e.message}
                  </span>
                </td>
              </tr>
            ))}
          </PreviewTable>
          <More shown={s.errors.length} total={s.counts.errors} />
          <p className="mt-2 text-small text-text-muted">Baris error dilewati saat disimpan. Baris lain tetap bisa disimpan.</p>
        </div>
      )}

      {valid.length > 0 && (
        <div>
          <h3 className="mb-2 flex items-center gap-2 text-h3">
            <CircleCheck size={18} strokeWidth={1.5} aria-hidden className="text-success" /> Tervalidasi{' '}
            <span className="num font-normal text-text-muted">({validTotal})</span>
          </h3>
          <PreviewTable columns={s.columns} tail="Status">
            {valid.map((r) => {
              const changes = new Map((changedBy.get(r.row)?.changes ?? []).map((x) => [x.field, x]));
              return (
                <tr key={r.row} className={cn('align-top', r.kind === 'sama' && 'text-text-muted')}>
                  <td className="num px-3 py-2 text-text-muted">{r.row}</td>
                  {s.columns.map((c) => {
                    const x = changes.get(c.field);
                    return (
                      <td key={c.field} className="px-3 py-2 whitespace-nowrap">
                        {x ? (
                          <>
                            <span className="text-text-muted line-through">{show(x.from)}</span> → <span className="font-medium text-primary">{show(x.to)}</span>
                          </>
                        ) : (
                          show(r.values[c.field])
                        )}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2">
                    <Badge tone={STATUS[r.kind].tone}>{STATUS[r.kind].label}</Badge>
                  </td>
                </tr>
              );
            })}
          </PreviewTable>
          <More shown={valid.length} total={validTotal} />
          {s.same > 0 && <p className="mt-2 text-small text-text-muted">Baris berstatus Sama sudah sama dengan data di sistem dan dilewati saat disimpan.</p>}
        </div>
      )}

      {validTotal + s.counts.errors === 0 && <p className="text-small text-text-muted">Sheet ini tidak berisi data.</p>}
    </div>
  );
}

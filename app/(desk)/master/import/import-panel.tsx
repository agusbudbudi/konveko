'use client';

import { useRef, useState, useTransition } from 'react';
import { AlertTriangle, CircleCheck, FileSpreadsheet, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InlineAlert } from '@/components/ui/inline-alert';
import { Badge } from '@/components/ui/status-badge';
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
  return <p className="mt-2 text-small text-text-muted">Menampilkan {shown} dari {total}. Semuanya tetap diproses.</p>;
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

function SheetView({ s }: { s: PreviewSheet }) {
  // a sheet-level problem (missing column, too many rows) has no row values
  const sheetErrors = s.errors.filter((e) => !e.values);
  const rowErrors = s.errors.filter((e) => e.values);
  const changedBy = new Map(s.changed.map((c) => [c.row, c]));
  const valid = [
    ...s.added.map((a) => ({ row: a.row, values: a.values, kind: 'baru' as const })),
    ...s.changed.map((c) => ({ row: c.row, values: c.values, kind: 'berubah' as const })),
  ].sort((a, b) => a.row - b.row);

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
        </div>
      )}

      {valid.length > 0 && (
        <div>
          <h3 className="mb-2 flex items-center gap-2 text-h3">
            <CircleCheck size={18} strokeWidth={1.5} aria-hidden className="text-success" /> Tervalidasi{' '}
            <span className="num font-normal text-text-muted">({s.counts.added + s.counts.changed})</span>
          </h3>
          <PreviewTable columns={s.columns} tail="Status">
            {valid.map((r) => {
              const changes = new Map((changedBy.get(r.row)?.changes ?? []).map((x) => [x.field, x]));
              return (
                <tr key={r.row} className="align-top">
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
                    <Badge tone={r.kind === 'baru' ? 'success' : 'info'}>{r.kind === 'baru' ? 'Baru' : 'Berubah'}</Badge>
                  </td>
                </tr>
              );
            })}
          </PreviewTable>
          <More shown={valid.length} total={s.counts.added + s.counts.changed} />
        </div>
      )}

      {s.same > 0 && <p className="text-small text-text-muted">{s.same} baris sama dengan data di sistem, tidak ditampilkan.</p>}
      {s.counts.added + s.counts.changed + s.counts.errors === 0 && <p className="text-small text-text-muted">Tidak ada perubahan di sheet ini.</p>}
    </div>
  );
}

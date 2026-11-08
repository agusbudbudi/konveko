'use client';

import { useState, useTransition } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Badge } from '@/components/ui/status-badge';
import { cn } from '@/lib/cn';
import type { FormState } from '@/lib/master';
import { EntityForm, type Field } from './entity-form';

export type MasterRow = {
  id: string;
  cells: React.ReactNode[];
  values: Record<string, string | number | null>;
  active?: boolean;
};

/**
 * Card list with add / edit (in a modal) / activate toggle. Server passes
 * rows already rendered as cells; the form posts to a server action.
 */
export function MasterList({
  title,
  description,
  columns,
  rows,
  fields,
  action,
  canEdit,
  addLabel,
  noun,
  onToggleActive,
  empty = 'Belum ada data.',
}: {
  title: string;
  description?: string;
  columns: string[];
  rows: MasterRow[];
  fields: Field[];
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  canEdit: boolean;
  addLabel: string;
  /** used in the edit modal title: "Ubah <noun>" */
  noun: string;
  onToggleActive?: (id: string, active: boolean) => Promise<FormState>;
  empty?: string;
}) {
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [pending, start] = useTransition();
  const [toggleError, setToggleError] = useState<string | null>(null);
  const grid = { gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr)) ${canEdit ? '200px' : ''}` };

  return (
    <>
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-small text-text-muted">Master data</p>
        <h1 className="text-h1">{title}</h1>
        {description && <p className="mt-1 text-text-muted">{description}</p>}
      </div>
      {canEdit && (
        <Button onClick={() => setEditing('new')}>
          <Plus size={16} strokeWidth={1.5} aria-hidden /> {addLabel}
        </Button>
      )}
    </div>
    <section className="mt-6 overflow-hidden rounded-lg border border-border bg-surface">
      <p className="px-5 py-3 text-small text-text-muted">
        <span className="num text-text">{rows.length}</span> data
        {rows.some((r) => r.active === false) && (
          <> · <span className="num">{rows.filter((r) => r.active === false).length}</span> nonaktif</>
        )}
      </p>

      {toggleError && <p className="border-t border-border px-5 py-2 text-small text-danger">{toggleError}</p>}

      <div className="hidden gap-4 border-t border-border bg-surface-muted px-5 py-2 text-caption tracking-[0.02em] text-text-muted md:grid" style={grid}>
        {columns.map((c) => (
          <span key={c}>{c}</span>
        ))}
        {canEdit && <span />}
      </div>

      {rows.length === 0 ? (
        <p className="border-t border-border px-5 py-4 text-text-muted">{empty}</p>
      ) : (
        <ul className="divide-y divide-border border-t border-border">
          {rows.map((r) => (
              <li
                key={r.id}
                className={cn('grid items-center gap-x-4 gap-y-1 px-5 py-3 max-md:!grid-cols-1', r.active === false && 'text-text-muted')}
                style={grid}
              >
                {r.cells.map((c, i) => (
                  <div key={i} className="min-w-0 truncate">
                    {c}
                  </div>
                ))}
                {canEdit && (
                  <div className="flex items-center justify-end gap-1 max-md:justify-start">
                    {r.active === false && <Badge tone="neutral">Nonaktif</Badge>}
                    <Button variant="ghost" onClick={() => setEditing(r.id)}>
                      <Pencil size={16} strokeWidth={1.5} aria-hidden /> Ubah
                    </Button>
                    {onToggleActive && r.active !== undefined && (
                      <Button
                        variant="ghost"
                        disabled={pending}
                        onClick={() =>
                          start(async () => {
                            setToggleError(null);
                            const res = await onToggleActive(r.id, !r.active);
                            if (!res.ok) setToggleError(res.error);
                          })
                        }
                      >
                        {r.active ? 'Nonaktifkan' : 'Aktifkan'}
                      </Button>
                    )}
                  </div>
                )}
              </li>
          ))}
        </ul>
      )}
    </section>

    <Modal
      open={editing !== null}
      onClose={() => setEditing(null)}
      title={editing === 'new' ? addLabel : `Ubah ${noun}`}
    >
      {editing !== null && (
        <EntityForm
          key={editing}
          fields={fields}
          action={action}
          values={editing === 'new' ? {} : { id: editing, ...rows.find((r) => r.id === editing)?.values }}
          submitLabel={editing === 'new' ? 'Simpan' : 'Simpan perubahan'}
          onDone={() => setEditing(null)}
          onCancel={() => setEditing(null)}
        />
      )}
    </Modal>
    </>
  );
}

/** DESIGN §5.7: target broken down into ready, reject, WIP, selisih. */
export type Recon = {
  target: number;
  ready: number;
  reject: number;
  wip_menunggu: number;
  wip_dikerjakan: number;
  selisih: number;
};

const segments = [
  { key: 'ready', label: 'Ready stock', className: 'bg-primary' },
  { key: 'reject', label: 'Reject', className: 'bg-danger' },
  { key: 'wip_dikerjakan', label: 'Sedang dikerjakan', className: 'bg-neutral/40' },
  { key: 'wip_menunggu', label: 'Menunggu terima', className: 'bg-neutral/20' },
  { key: 'selisih', label: 'Selisih', className: 'bg-warning' },
] as const;

export function ReconciliationBar({ r }: { r: Recon }) {
  const total = Math.max(r.target, 1);
  const wip = r.wip_menunggu + r.wip_dikerjakan;
  return (
    <div>
      <div className="flex h-3 gap-0.5 rounded-sm bg-surface-muted" role="img"
        aria-label={`${r.target} = ${r.ready} ready + ${r.reject} reject + ${wip} WIP + ${r.selisih} selisih`}>
        {segments.map((s) =>
          r[s.key] > 0 ? (
            <span
              key={s.key}
              className={`group relative first:rounded-l-sm last:rounded-r-sm hover:brightness-90 ${s.className}`}
              style={{ width: `${(r[s.key] / total) * 100}%` }}
            >
              <span
                aria-hidden
                className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-text px-2 py-1 text-caption text-surface opacity-0 transition-opacity group-hover:opacity-100"
              >
                {s.label} <span className="num font-medium">{r[s.key]}</span>
                <span className="num opacity-70"> · {Math.round((r[s.key] / total) * 100)}%</span>
              </span>
            </span>
          ) : null,
        )}
      </div>
      <p className="num mt-2 text-small text-text-muted">
        {r.target} = {r.ready} + {r.reject} + {wip} + <span className={r.selisih > 0 ? 'text-warning' : undefined}>{r.selisih}</span>
      </p>
    </div>
  );
}

export function ReconciliationLegend({ r }: { r: Recon }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-small text-text-muted">
      {segments.map((s) => (
        <li key={s.key} className="inline-flex items-center gap-1.5">
          <span aria-hidden className={`size-2 rounded-sm ${s.className}`} />
          {s.label} <span className="num text-text">{r[s.key]}</span>
        </li>
      ))}
    </ul>
  );
}

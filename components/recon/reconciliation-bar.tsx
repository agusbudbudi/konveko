/** DESIGN §5.7: target broken down into ready, reject, WIP, selisih. */
export type Recon = {
  target: number;
  ready: number;
  reject: number;
  wip_menunggu: number;
  wip_dikerjakan: number;
  selisih: number;
  /**
   * Bundle level only: reject pcs now counted in rework child bundles. Not named `reworked`, so a
   * batch row (whose `reworked` is already inside its other numbers) never shows it by accident.
   */
  reworkedOut?: number;
};

const segments = [
  { key: 'ready', label: 'Ready stock', className: 'bg-primary' },
  { key: 'reject', label: 'Reject', className: 'bg-danger' },
  { key: 'wip_dikerjakan', label: 'Sedang dikerjakan', className: 'bg-wip-active' },
  { key: 'wip_menunggu', label: 'Menunggu terima', className: 'bg-neutral/20' },
  { key: 'selisih', label: 'Selisih', className: 'bg-warning' },
  { key: 'reworkedOut', label: 'Dirework', className: 'bg-info' },
] as const;

const val = (r: Recon, key: (typeof segments)[number]['key']) => r[key] ?? 0;

export function ReconciliationBar({ r }: { r: Recon }) {
  const total = Math.max(r.target, 1);
  const wip = r.wip_menunggu + r.wip_dikerjakan;
  return (
    <div>
      <div className="flex h-3 gap-0.5 rounded-sm bg-surface-muted" role="img"
        aria-label={`${r.target} = ${r.ready} ready + ${r.reject} reject + ${wip} WIP + ${r.selisih} selisih${r.reworkedOut ? ` + ${r.reworkedOut} dirework` : ''}`}>
        {segments.map((s) =>
          val(r, s.key) > 0 ? (
            <span
              key={s.key}
              className={`group relative first:rounded-l-sm last:rounded-r-sm hover:brightness-90 ${s.className}`}
              style={{ width: `${(val(r, s.key) / total) * 100}%` }}
            >
              <span
                aria-hidden
                className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-text px-2 py-1 text-caption text-surface opacity-0 transition-opacity group-hover:opacity-100"
              >
                {s.label} <span className="num font-medium">{val(r, s.key)}</span>
                <span className="num opacity-70"> · {Math.round((val(r, s.key) / total) * 100)}%</span>
              </span>
            </span>
          ) : null,
        )}
      </div>
      <p className="num mt-2 text-small text-text-muted">
        {r.target} = {r.ready} + {r.reject} + {wip} + <span className={r.selisih > 0 ? 'text-warning' : undefined}>{r.selisih}</span>
        {r.reworkedOut ? <> + <span className="text-info">{r.reworkedOut}</span> dirework</> : null}
      </p>
    </div>
  );
}

export function ReconciliationLegend({ r }: { r: Recon }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-small text-text-muted">
      {segments
        .filter((s) => s.key !== 'reworkedOut' || val(r, s.key) > 0)
        .map((s) => (
          <li key={s.key} className="inline-flex items-center gap-1.5">
            <span aria-hidden className={`size-2 rounded-sm ${s.className}`} />
            {s.label} <span className="num text-text">{val(r, s.key)}</span>
          </li>
        ))}
    </ul>
  );
}

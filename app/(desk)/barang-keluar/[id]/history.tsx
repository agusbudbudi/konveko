import Link from 'next/link';
import type { HistoryEntry } from '@/lib/outbound-history';

const SHOW_CODES = 6;
const when = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' });

/** Document history, newest first; entries come from buildHistory (lib/outbound-history). */
export function OutboundHistory({ entries, nameOf }: { entries: HistoryEntry[]; nameOf: Map<string, string> }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <h2 className="px-5 pt-5 pb-3 text-h3">Riwayat</h2>
      <ol className="border-t border-border px-5 py-3">
        {entries.map((e, i) => (
          <li key={`${e.at}-${i}`} className="grid grid-cols-[20px_1fr] gap-x-3">
            <div className="relative flex justify-center" aria-hidden>
              {i < entries.length - 1 && <span className="absolute top-3 bottom-0 w-px bg-border-strong" />}
              <span className={`relative mt-1.5 size-2.5 rounded-full border-2 ${i === 0 ? 'border-primary bg-primary' : 'border-border-strong bg-surface'}`} />
            </div>
            <div className={i < entries.length - 1 ? 'pb-4' : ''}>
              <p className="font-medium">{e.title}</p>
              <p className="text-small text-text-muted">
                <time dateTime={e.at}>{when.format(new Date(e.at))}</time>
                {e.by && <> · {nameOf.get(e.by) ?? '-'}</>}
                {e.note && <> · {e.note}</>}
              </p>
              {e.codes.length > 0 && (
                <p className="mt-1 text-small">
                  {e.codes.slice(0, SHOW_CODES).map((c, j) => (
                    <span key={c + j}>
                      {j > 0 && ', '}
                      <Link href={`/pcs/${c}`} className="num link-code">
                        {c}
                      </Link>
                    </span>
                  ))}
                  {e.codes.length > SHOW_CODES && <span className="text-text-muted"> dan {e.codes.length - SHOW_CODES} lainnya</span>}
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

import { PhotoPreview } from '@/components/ui/photo-preview';
import { Badge } from '@/components/ui/status-badge';
import { cn } from '@/lib/cn';
import { MOVEMENT_LABEL, qtySummary, type MovementType } from '@/lib/movement';
import type { Reason } from '@/lib/types';
import { CorrectionPanel } from './correction-panel';

export type TimelineMovement = {
  id: string;
  seq: number;
  type: MovementType;
  from_holder_id: string | null;
  to_holder_id: string | null;
  qty_sent: number | null;
  qty_received: number | null;
  qty_good: number | null;
  qty_reject: number | null;
  reason_id: string | null;
  note: string | null;
  photo_path: string | null;
  corrects_movement_id: string | null;
  is_void: boolean;
  scanned_by: string;
  scanned_at: string;
};

const TZ = 'Asia/Jakarta';
const dayKey = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const dayLabelFmt = new Intl.DateTimeFormat('id-ID', { timeZone: TZ, day: 'numeric', month: 'long', year: 'numeric' });
const timeFmt = new Intl.DateTimeFormat('id-ID', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });

function dayLabel(d: Date, now: Date) {
  const key = dayKey.format(d);
  if (key === dayKey.format(now)) return 'Hari ini';
  if (key === dayKey.format(new Date(now.getTime() - 86_400_000))) return 'Kemarin';
  return dayLabelFmt.format(d);
}

/**
 * FR-23 as a vertical timeline, newest first. Every event is its own entry,
 * including supervisor corrections, so the order of what happened is exact.
 * A scan entry shows what was originally scanned; later changes appear as
 * their own entries and as a badge on the scan.
 */
export function ScanTimeline({
  movements,
  effectiveIds,
  correctableId,
  reasons,
  holderName,
  userName,
  photoUrl,
  canCorrect,
}: {
  movements: TimelineMovement[];
  effectiveIds: Set<string>;
  correctableId: string | null;
  reasons: Map<string, Reason>;
  holderName: Map<string, string>;
  userName: Map<string, string>;
  photoUrl: Map<string, string>;
  canCorrect: boolean;
}) {
  const byId = new Map(movements.map((m) => [m.id, m]));
  const events = [...movements].sort((a, b) => b.seq - a.seq);
  const now = new Date();

  // group by day, keeping newest-first order
  const groups: { label: string; items: TimelineMovement[] }[] = [];
  for (const m of events) {
    const label = dayLabel(new Date(m.scanned_at), now);
    const last = groups.at(-1);
    if (last && last.label === label) last.items.push(m);
    else groups.push({ label, items: [m] });
  }

  return (
    <div className="px-5 pb-5">
      {groups.map((g, gi) => (
        <section key={g.label + gi} className="mt-4">
          <h3 className="text-caption tracking-[0.02em] text-text-muted">{g.label}</h3>
          <ol className="mt-2">
            {g.items.map((m, i) => {
              const isNewest = gi === 0 && i === 0;
              const isLastInGroup = i === g.items.length - 1;
              return (
                <li key={m.id} className="grid grid-cols-[48px_20px_1fr] gap-x-3">
                  <time dateTime={m.scanned_at} className="num pt-0.5 text-right text-small text-text-muted">
                    {timeFmt.format(new Date(m.scanned_at))}
                  </time>

                  {/* rail + dot */}
                  <div className="relative flex justify-center" aria-hidden>
                    {!isLastInGroup && <span className="absolute top-3 bottom-0 w-px bg-border-strong" />}
                    {i > 0 && <span className="absolute top-0 h-2 w-px bg-border-strong" />}
                    <span
                      className={cn(
                        'relative mt-1.5 size-2.5 rounded-full border-2',
                        isNewest ? 'border-primary bg-primary' : 'border-border-strong bg-surface',
                      )}
                    />
                  </div>

                  <div className={cn('min-w-0', !isLastInGroup && 'pb-5')}>
                    {m.type === 'correction' ? (
                      <CorrectionEntry m={m} original={byId.get(m.corrects_movement_id ?? '')} userName={userName} />
                    ) : (
                      <ScanEntry
                        m={m}
                        voided={!effectiveIds.has(m.id)}
                        corrected={movements.some((c) => c.corrects_movement_id === m.id && !c.is_void)}
                        reasons={reasons}
                        holderName={holderName}
                        userName={userName}
                        photo={photoUrl.get(m.id)}
                      />
                    )}
                    {canCorrect && m.id === correctableId && (
                      <CorrectionPanel
                        movement={currentValues(m, movements)}
                        reasons={[...reasons.values()]}
                      />
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}

/** Values the correction panel should start from: the latest correction if any. */
function currentValues(m: TimelineMovement, all: TimelineMovement[]) {
  const latest = all.filter((c) => c.corrects_movement_id === m.id).sort((a, b) => b.seq - a.seq)[0];
  const src = latest && !latest.is_void ? latest : m;
  return {
    id: m.id,
    type: m.type,
    qty_sent: src.qty_sent ?? m.qty_sent,
    qty_received: src.qty_received,
    qty_good: src.qty_good,
    qty_reject: src.qty_reject,
    reason_id: src.reason_id,
  };
}

function ScanEntry({
  m,
  voided,
  corrected,
  reasons,
  holderName,
  userName,
  photo,
}: {
  m: TimelineMovement;
  voided: boolean;
  corrected: boolean;
  reasons: Map<string, Reason>;
  holderName: Map<string, string>;
  userName: Map<string, string>;
  photo?: string;
}) {
  const reason = m.reason_id ? reasons.get(m.reason_id) : null;
  const from = m.from_holder_id ? holderName.get(m.from_holder_id) : null;
  const to = m.to_holder_id ? holderName.get(m.to_holder_id) : null;
  const isReceive = m.type === 'receive_sew' || m.type === 'receive_finishing';

  return (
    <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
      <div className={cn('min-w-0', voided && 'text-text-muted line-through')}>
        <p className="font-medium">
          {MOVEMENT_LABEL[m.type]}
          <span className="num ml-2 font-normal">{qtySummary(m.type, m)}</span>
        </p>
        <p className="text-small text-text-muted">
          {userName.get(m.scanned_by) ?? '-'}
          {isReceive && from && to && <> · {from} → {to}</>}
          {reason && <> · {reason.label}</>}
          {(m.type === 'split' || m.type === 'rework') && m.note && <> · {m.note}</>}
        </p>
        {photo && (
          <PhotoPreview
            url={photo}
            caption={`Foto selisih · ${MOVEMENT_LABEL[m.type]} · ${timeFmt.format(new Date(m.scanned_at))}`}
          />
        )}
      </div>
      <div className="flex items-center gap-2">
        {voided && <Badge tone="neutral">Dibatalkan</Badge>}
        {!voided && corrected && <Badge tone="info">Dikoreksi</Badge>}
      </div>
    </div>
  );
}

function CorrectionEntry({
  m,
  original,
  userName,
}: {
  m: TimelineMovement;
  original?: TimelineMovement;
  userName: Map<string, string>;
}) {
  const step = original ? MOVEMENT_LABEL[original.type].toLowerCase() : 'scan';
  return (
    <div>
      <p className="font-medium">
        {m.is_void ? `Scan ${step} dibatalkan` : `Koreksi ${step}`}
        {!m.is_void && original && <span className="num ml-2 font-normal">{qtySummary(original.type, m)}</span>}
      </p>
      <p className="text-small text-text-muted">
        {userName.get(m.scanned_by) ?? '-'}
        {original && <> · scan pukul {timeFmt.format(new Date(original.scanned_at))}</>}
        {m.note && <> · {m.note}</>}
      </p>
    </div>
  );
}

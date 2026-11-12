import { cn } from '@/lib/cn';

type Variant = 'box' | 'search' | 'document' | 'check' | 'rack' | 'bell';

const c = {
  blob: 'var(--primary-soft)',
  surface: 'var(--surface)',
  muted: 'var(--surface-muted)',
  line: 'var(--border-strong)',
  primary: 'var(--primary)',
  accent: 'var(--highlight)',
};

/** Soft blob shared by every illustration so they read as one family. */
function Blob() {
  return (
    <>
      <ellipse cx="60" cy="86" rx="38" ry="6" style={{ fill: c.muted }} />
      <circle cx="60" cy="48" r="38" style={{ fill: c.blob }} />
      <circle cx="98" cy="22" r="3" style={{ fill: c.accent }} opacity=".7" />
      <circle cx="20" cy="70" r="2.5" style={{ fill: c.primary }} opacity=".35" />
    </>
  );
}

const art: Record<Variant, React.ReactNode> = {
  // Open, empty box
  box: (
    <>
      <Blob />
      <path d="M34 44 60 34l26 10v26L60 80 34 70Z" style={{ fill: c.surface, stroke: c.line }} strokeWidth="2" strokeLinejoin="round" />
      <path d="M34 44 60 54l26-10M60 54v26" style={{ stroke: c.line }} strokeWidth="2" strokeLinejoin="round" fill="none" />
      <path d="M34 44 22 38l26-10 12 6M86 44l12-6-26-10-12 6" style={{ fill: c.muted, stroke: c.line }} strokeWidth="2" strokeLinejoin="round" />
      <path d="M52 62h8" style={{ stroke: c.primary }} strokeWidth="2.5" strokeLinecap="round" opacity=".6" />
    </>
  ),
  // Magnifier, nothing matched
  search: (
    <>
      <Blob />
      <circle cx="54" cy="44" r="18" style={{ fill: c.surface, stroke: c.primary }} strokeWidth="3" />
      <path d="m67 57 14 14" style={{ stroke: c.primary }} strokeWidth="5" strokeLinecap="round" />
      <path d="M46 44h16" style={{ stroke: c.line }} strokeWidth="3" strokeLinecap="round" />
      <path d="M50 51h8" style={{ stroke: c.line }} strokeWidth="3" strokeLinecap="round" />
    </>
  ),
  // Blank sheet
  document: (
    <>
      <Blob />
      <rect x="38" y="24" width="44" height="56" rx="6" style={{ fill: c.surface, stroke: c.line }} strokeWidth="2" />
      <path d="M48 40h24M48 50h24M48 60h14" style={{ stroke: c.line }} strokeWidth="3" strokeLinecap="round" />
      <circle cx="78" cy="72" r="11" style={{ fill: c.primary }} />
      <path d="M78 67v10M73 72h10" style={{ stroke: c.surface }} strokeWidth="2.5" strokeLinecap="round" />
    </>
  ),
  // All clear
  check: (
    <>
      <Blob />
      <rect x="38" y="26" width="44" height="52" rx="6" style={{ fill: c.surface, stroke: c.line }} strokeWidth="2" />
      <path d="M48 40h24M48 50h24" style={{ stroke: c.line }} strokeWidth="3" strokeLinecap="round" />
      <circle cx="74" cy="68" r="12" style={{ fill: c.primary }} />
      <path d="m68.5 68 4 4 7-8" style={{ stroke: c.surface }} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </>
  ),
  // Quiet bell
  bell: (
    <>
      <Blob />
      <path
        d="M60 26c-11 0-18 8-18 19v9c0 5-3 8-6 11h48c-3-3-6-6-6-11v-9c0-11-7-19-18-19Z"
        style={{ fill: c.surface, stroke: c.line }}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M60 26v-4" style={{ stroke: c.line }} strokeWidth="3" strokeLinecap="round" />
      <path d="M54 68c0 4 3 7 6 7s6-3 6-7" style={{ fill: c.primary }} />
      <path d="M52 44h16" style={{ stroke: c.line }} strokeWidth="3" strokeLinecap="round" />
      <circle cx="82" cy="32" r="8" style={{ fill: c.primary }} />
      <path d="m78.5 32 2.5 2.5 4.5-5" style={{ stroke: c.surface }} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </>
  ),
  // Shelf with free slots
  rack: (
    <>
      <Blob />
      <path d="M32 32v50M88 32v50" style={{ stroke: c.line }} strokeWidth="4" strokeLinecap="round" />
      <path d="M32 46h56M32 66h56" style={{ stroke: c.line }} strokeWidth="4" strokeLinecap="round" />
      <rect x="40" y="52" width="14" height="14" rx="2" style={{ fill: c.surface, stroke: c.primary }} strokeWidth="2" strokeDasharray="3 3" />
      <rect x="62" y="32" width="14" height="14" rx="2" style={{ fill: c.surface, stroke: c.primary }} strokeWidth="2" strokeDasharray="3 3" />
    </>
  ),
};

/**
 * Centered empty state: illustration, a short message, optional hint and action.
 * Drop it inside a card in place of the old muted <p>.
 */
export function EmptyState({
  variant = 'box',
  children,
  hint,
  action,
  compact = false,
  className,
}: {
  variant?: Variant;
  children: React.ReactNode;
  hint?: React.ReactNode;
  action?: React.ReactNode;
  /** Smaller illustration and padding, for panels inside a card. */
  compact?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center', compact ? 'px-4 py-6' : 'px-5 py-12', className)}>
      <svg
        aria-hidden
        viewBox="0 0 120 96"
        fill="none"
        className={cn('shrink-0', compact ? 'h-20 w-24' : 'h-28 w-36')}
      >
        {art[variant]}
      </svg>
      <p className={cn('font-medium text-text', compact ? 'mt-2 text-small' : 'mt-3')}>{children}</p>
      {hint && <p className="mt-1 max-w-sm text-small text-text-muted">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

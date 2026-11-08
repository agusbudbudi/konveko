export function BrandMark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <rect x="6" y="6" width="52" height="52" rx="5" fill="none" stroke="var(--primary)" strokeWidth="5" />
      <path d="M20 44 L29 35 M35 29 L44 20" stroke="var(--primary)" strokeWidth="6" strokeLinecap="round" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="inline-flex items-center gap-2">
      <BrandMark />
      <span className="font-semibold tracking-[-0.01em] text-text">konveko</span>
    </span>
  );
}

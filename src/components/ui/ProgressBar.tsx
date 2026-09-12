/** Slim progress bar with accessible value semantics. */
export function ProgressBar({ value, max = 100, label, className = '' }: {
  value: number;
  max?: number;
  label?: string;
  className?: string;
}) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className={className}>
      {label && <div className="mb-1 text-sm text-ink-soft">{label}</div>}
      <div
        role="progressbar"
        aria-valuenow={Math.round(value)}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={label ?? 'Progress'}
        className="h-2 overflow-hidden rounded-full bg-line"
      >
        <div className="h-full rounded-full bg-accent transition-calm" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Progress ring for Roadmap stages (SVG, screen-reader labelled). */
export function ProgressRing({ value, size = 56, label }: {
  value: number; // 0–1
  size?: number;
  label: string;
}) {
  const clamped = Math.min(1, Math.max(0, value));
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={label}
      className="-rotate-90"
    >
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={5} className="stroke-line" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={5}
        strokeLinecap="round"
        className="stroke-accent transition-calm"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - clamped)}
      />
    </svg>
  );
}

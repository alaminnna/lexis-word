/** Skeleton loaders for enriched sections — core local data renders first (§4). */
export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div aria-hidden className={`animate-pulse rounded-md bg-line ${className}`} />
  );
}

export function SkeletonBlock({ lines = 3, label = 'Loading enriched content' }: { lines?: number; label?: string }) {
  return (
    <div aria-label={label} role="status" className="space-y-2">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={i === lines - 1 ? 'h-4 w-2/3' : 'h-4 w-full'} />
      ))}
    </div>
  );
}

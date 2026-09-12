// Time helpers (pure, testable). All timestamps are epoch millis.

export const DAY_MS = 86_400_000;

/** 'YYYY-MM-DD' in local time — key for DailyLog records. */
export function dayKey(ts: number, now = new Date(ts)): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function daysBetween(fromMs: number, toMs: number): number {
  return Math.max(0, (toMs - fromMs) / DAY_MS);
}

/** Compact human duration: "8 min", "1 h 5 min", "45 s". */
export function formatMinutes(totalMinutes: number): string {
  const m = Math.round(totalMinutes);
  if (m < 1) return '<1 min';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `${h} h` : `${h} h ${rest} min`;
}

/** "12 March" style date for pace projections. */
export function formatDayMonth(ts: number): string {
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
}

// Per-dimension spaced scheduler (§9). Pure functions; called by mastery.ts.

import { INTERVAL_LADDER, MAX_INTERVAL_DAYS, IN_SESSION_RETRY_MS } from './constants';
import { DAY_MS } from '../../utils/time';

/** Next interval in days after a success at the given (new) streak & strength. */
export function nextIntervalDays(streak: number, strength: number): number {
  const base = INTERVAL_LADDER[Math.min(Math.max(streak, 0), INTERVAL_LADDER.length - 1)]!;
  const scaled = base * (0.5 + strength / 200);
  return Math.min(scaled, MAX_INTERVAL_DAYS);
}

/** Due timestamp after a success. A successful in-session retry always lands +1 day (§9). */
export function dueAfterSuccess(now: number, streak: number, strength: number, isRetry: boolean): { nextDueAt: number; intervalDays: number } {
  if (isRetry) return { nextDueAt: now + DAY_MS, intervalDays: 1 };
  const intervalDays = nextIntervalDays(streak, strength);
  return { nextDueAt: now + intervalDays * DAY_MS, intervalDays };
}

/** Due timestamp after a lapse: 10 min when a session is active (retry),
 *  otherwise immediately (due at the next session) (§9). */
export function dueAfterLapse(now: number, inSession: boolean): number {
  return inSession ? now + IN_SESSION_RETRY_MS : now;
}

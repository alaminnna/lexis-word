// Projections (§15, §21): pace & completion date, retention forecast,
// rolling success rate. Pure functions over logs + progress.

import type { DailyLog, LearningEvent, WordProgress } from '../../types/domain';
import { retentionOf } from './mastery';
import { DIMENSIONS } from '../../types/domain';
import { DAY_MS, dayKey } from '../../utils/time';

export interface PaceProjection {
  newPerDay: number; // trailing 7-day rate
  projectedDate: number | null; // epoch ms when all words reach active memory
  remaining: number;
}

/**
 * Honest pace projection from the trailing 7-day new-word rate (§15).
 * Zero pace → null date (UI shows a gentle re-entry prompt, never guilt copy).
 */
export function paceProjection(
  daily: Record<string, DailyLog>,
  now: number,
  activeWords: number,
  totalWords: number,
): PaceProjection {
  let introduced = 0;
  for (let d = 0; d < 7; d++) {
    const log = daily[dayKey(now - d * DAY_MS)];
    if (log) introduced += log.newWordsIntroduced;
  }
  const newPerDay = introduced / 7;
  const remaining = Math.max(0, totalWords - activeWords);
  if (newPerDay <= 0 || remaining === 0) {
    return { newPerDay, projectedDate: null, remaining };
  }
  return { newPerDay, projectedDate: now + (remaining / newPerDay) * DAY_MS, remaining };
}

export interface RetentionForecast {
  likelyRemembered: number; // words with min-dim R ≥ 0.8 at the horizon
  activeTotal: number;
  pct: number;
}

/**
 * "In 7 days you'll likely remember ~X% of your active words" (§21):
 * per active word, the weakest-link retention across attempted dimensions.
 */
export function retentionForecast(
  progress: Record<string, WordProgress>,
  now: number,
  horizonDays = 7,
): RetentionForecast {
  const horizon = now + horizonDays * DAY_MS;
  let activeTotal = 0;
  let likelyRemembered = 0;
  for (const id of Object.keys(progress)) {
    const p = progress[id]!;
    if (p.introducedAt === 0 || p.masteryStage < 1) continue;
    activeTotal++;
    let minR = 1;
    let attempted = false;
    for (const d of DIMENSIONS) {
      const st = p.dimensions[d];
      if (st.attempts === 0) continue;
      attempted = true;
      minR = Math.min(minR, retentionOf(st, horizon).retention);
    }
    if (attempted && minR >= 0.8) likelyRemembered++;
  }
  return {
    likelyRemembered,
    activeTotal,
    pct: activeTotal === 0 ? 0 : likelyRemembered / activeTotal,
  };
}

/**
 * Rolling success rate over the last `window` events. Null when fewer than
 * 10 events exist (neutral difficulty until real data accumulates).
 */
export function rollingSuccess(events: LearningEvent[], window = 40): number | null {
  if (events.length < 10) return null;
  const slice = events.slice(-window);
  const correct = slice.filter((e) => e.correct).length;
  return correct / slice.length;
}

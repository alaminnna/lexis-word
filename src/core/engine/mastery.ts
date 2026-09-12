// Adaptive mastery model (§6): per-dimension state, deterministic update rules,
// retention math, overall score. All functions are pure (state in → state out).

import type {
  ActivityType, Confidence, DimensionKey, DimensionState, WordProgress,
} from '../../types/domain';
import { DIMENSIONS } from '../../types/domain';
import {
  ACTIVITY_DIMENSION, CORE_DIMENSIONS, CROSS_CREDIT, DICTATION_SPELLING_CREDIT,
  EVIDENCE_WEIGHT, EXPECTED_MS, MASTERY_WEIGHTS,
} from './constants';
import { dueAfterLapse, dueAfterSuccess } from './scheduler';
import { daysBetween } from '../../utils/time';
import { computeStage } from './stages';

export interface EventInput {
  activity: ActivityType;
  dimension?: DimensionKey; // defaults to ACTIVITY_DIMENSION[activity]
  correct: boolean;
  responseMs: number;
  confidence?: Confidence;
  hintsUsed: number;
  timestamp: number;
  aiVerified?: boolean; // writing-task graded by a configured provider → weight 1.10
}

export interface ApplyOptions {
  inSession?: boolean;
  isRetry?: boolean;
}

export function freshDimensionState(): DimensionState {
  return {
    strength: 0, streak: 0, lapses: 0, attempts: 0, successes: 0,
    lastReviewedAt: 0, nextDueAt: 0, lastIntervalDays: 0,
    recent: [],
  };
}

export function freshWordProgress(wordId: string, now: number): WordProgress {
  const dimensions = {} as Record<DimensionKey, DimensionState>;
  for (const d of DIMENSIONS) dimensions[d] = freshDimensionState();
  return {
    wordId, introducedAt: 0, masteryStage: 0, dimensions,
    firstExposureModality: null, errorProfile: {}, updatedAt: now,
  };
}

/** Seed state on Meet acknowledgment (weight 0 — seeds only, §6). */
export function seedIntroduction(progress: WordProgress, modality: ActivityType, now: number): WordProgress {
  return {
    ...progress,
    introducedAt: progress.introducedAt > 0 ? progress.introducedAt : now,
    masteryStage: 1,
    firstExposureModality: progress.firstExposureModality ?? modality,
    updatedAt: Math.max(now, progress.updatedAt),
  };
}

/** timeModifier = clamp(expected/actual, 0.7, 1.15) (§6). */
export function timeModifier(activity: ActivityType, responseMs: number): number {
  const expected = EXPECTED_MS[activity];
  if (expected <= 0 || responseMs <= 0) return 1;
  return Math.min(1.15, Math.max(0.7, expected / responseMs));
}

function evidenceWeight(activity: ActivityType, aiVerified: boolean): number {
  if (activity === 'writing-task' && aiVerified) return 1.10;
  return EVIDENCE_WEIGHT[activity];
}

interface SuccessArgs {
  dim: DimensionState;
  weight: number;
  timeMod: number;
  hintMod: number;
  now: number;
  isRetry: boolean;
}

function applySuccessToDim(args: SuccessArgs): DimensionState {
  const { dim, weight, timeMod, hintMod, now, isRetry } = args;
  const delta = weight * (100 - dim.strength) * 0.3 * timeMod * hintMod;
  const strength = Math.min(100, dim.strength + delta);
  const streak = dim.streak + 1;
  const { nextDueAt, intervalDays } = dueAfterSuccess(now, streak, strength, isRetry);
  return {
    strength,
    streak,
    lapses: dim.lapses,
    attempts: dim.attempts + 1,
    successes: dim.successes + 1,
    lastReviewedAt: now,
    nextDueAt,
    lastIntervalDays: intervalDays,
    recent: [...dim.recent.slice(-1), true],
  };
}

function applyFailureToDim(dim: DimensionState, now: number, inSession: boolean, overconfident: boolean): DimensionState {
  const penalty = overconfident ? 0.55 * 0.85 : 0.55;
  return {
    strength: Math.floor(dim.strength * penalty),
    streak: 0,
    lapses: dim.lapses + 1,
    attempts: dim.attempts + 1,
    successes: dim.successes,
    lastReviewedAt: now,
    nextDueAt: dueAfterLapse(now, inSession),
    lastIntervalDays: dim.lastIntervalDays,
    recent: [...dim.recent.slice(-1), false],
  };
}

/**
 * Apply one learning event. Recognition successes only extend the recognition
 * ladder — cross-dimension credit follows CROSS_CREDIT edges (harder → easier
 * only), so a recognition event can never satisfy a recall due date.
 */
export function applyLearningEvent(
  progress: WordProgress,
  event: EventInput,
  opts: ApplyOptions = {},
): WordProgress {
  const dimension = event.dimension ?? ACTIVITY_DIMENSION[event.activity];
  const inSession = opts.inSession ?? true;
  const isRetry = opts.isRetry ?? false;
  const current = progress.dimensions[dimension];
  // Clock-skew guard (§9, §22): never schedule in the past relative to last review.
  const now = Math.max(event.timestamp, current.lastReviewedAt);
  const timeMod = timeModifier(event.activity, event.responseMs);
  const hintMod = event.hintsUsed > 0 ? 0.7 : 1;
  const weight = evidenceWeight(event.activity, event.aiVerified ?? false);

  const dimensions = { ...progress.dimensions };
  if (event.correct) {
    dimensions[dimension] = applySuccessToDim({ dim: current, weight, timeMod, hintMod, now, isRetry });
    if (weight > 0) {
      // Harder-dimension success partially credits easier ones (factor 0.5, §6).
      const credited = new Set<DimensionKey>(CROSS_CREDIT[dimension] ?? []);
      if (event.activity === 'sentence-dictation') credited.add('spelling');
      for (const easier of credited) {
        if (easier === dimension) continue;
        const target = dimensions[easier];
        // Never credit a dimension that has never been attempted: credit must not
        // fabricate review history or satisfy dues that were never scheduled.
        if (target.attempts === 0) continue;
        const factor = easier === 'spelling' && event.activity === 'sentence-dictation'
          ? DICTATION_SPELLING_CREDIT
          : 0.5;
        dimensions[easier] = applySuccessToDim({
          dim: target, weight: weight * factor, timeMod, hintMod, now, isRetry,
        });
      }
    }
  } else {
    const overconfident = event.confidence === 'sure';
    dimensions[dimension] = applyFailureToDim(current, now, inSession, overconfident);
    // Failure never propagates (§6).
  }

  const updated: WordProgress = { ...progress, dimensions, updatedAt: now };
  // Mastery stage is derived, except stage 0→1 which requires the Meet seed.
  updated.masteryStage = progress.introducedAt === 0 && updated.introducedAt === 0
    ? 0
    : computeStage(updated);
  return updated;
}

export interface Retention {
  stabilityDays: number;
  retention: number; // predicted R at `now`
  risk: number;      // 1 − R
  atRisk: boolean;
  overdueDays: number;
}

/** Forgetting-risk math (§6). Never-reviewed dimensions report R = 1 (no decay yet). */
export function retentionOf(dim: DimensionState, now: number): Retention {
  if (dim.lastReviewedAt === 0) {
    return { stabilityDays: 0.5, retention: 1, risk: 0, atRisk: false, overdueDays: 0 };
  }
  const safeNow = Math.max(now, dim.lastReviewedAt);
  const stabilityDays = Math.max(0.5, dim.lastIntervalDays * (0.6 + dim.strength / 250));
  const deltaDays = daysBetween(dim.lastReviewedAt, safeNow);
  const retention = Math.exp(-deltaDays / stabilityDays);
  const overdueDays = Math.max(0, (safeNow - dim.nextDueAt) / 86_400_000);
  const atRisk = retention < 0.6 || overdueDays > 1;
  return { stabilityDays, retention, risk: 1 - retention, atRisk, overdueDays };
}

/** Weighted overall mastery score (§6). */
export function overallMastery(dimensions: Record<DimensionKey, DimensionState>): number {
  let total = 0;
  for (const d of DIMENSIONS) total += dimensions[d].strength * MASTERY_WEIGHTS[d];
  return total;
}

/** Longest confirmed interval across dimensions (stage-5 rubric input). */
export function longestIntervalDays(progress: WordProgress): number {
  let longest = 0;
  for (const d of DIMENSIONS) longest = Math.max(longest, progress.dimensions[d].lastIntervalDays);
  return longest;
}

export { CORE_DIMENSIONS };

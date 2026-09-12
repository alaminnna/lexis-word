// Answer grading: fuzzy typed-recall thresholds + response-time math (§6).

import { EXPECTED_MS } from './constants';
import type { ActivityType } from '../../types/domain';
import { levenshtein, normalizeAnswer } from '../../utils/text';

export type TypedOutcome = 'correct' | 'near-miss' | 'wrong';

export interface TypedGrade {
  outcome: TypedOutcome;
  distance: number;
  normalizedTyped: string;
  normalizedTarget: string;
}

/**
 * Fuzzy grading for typed recall (§6): Levenshtein ≤ 1 (≤ 2 for words ≥ 6
 * letters) grades as recall-correct + spelling lapse. Everything else exact
 * (after normalization) is wrong.
 */
export function gradeTyped(target: string, typed: string): TypedGrade {
  const t = normalizeAnswer(target);
  const u = normalizeAnswer(typed);
  const distance = levenshtein(t, u);
  if (distance === 0) return { outcome: 'correct', distance, normalizedTyped: u, normalizedTarget: t };
  const threshold = t.length >= 6 ? 2 : 1;
  if (distance <= threshold) return { outcome: 'near-miss', distance, normalizedTyped: u, normalizedTarget: t };
  return { outcome: 'wrong', distance, normalizedTyped: u, normalizedTarget: t };
}

/** Expected response time in ms for hesitation detection (§14) and timeModifier. */
export function expectedMs(activity: ActivityType): number {
  return EXPECTED_MS[activity];
}

/** Long hesitation = slower than 2× the expected response time (§14). */
export function isHesitation(activity: ActivityType, responseMs: number): boolean {
  const expected = EXPECTED_MS[activity];
  return expected > 0 && responseMs > expected * 2;
}

// Shared engine constants — exact §6 values. Spec-gap resolutions are marked [CHOICE].

import type { ActivityType, DimensionKey } from '../../types/domain';

/** Evidence weight per activity (§6). [CHOICE]: minimal-pair = 0.70 (listening family),
 *  flash-type = 0.70 (spelling family) — the spec omits these two ladder steps. */
export const EVIDENCE_WEIGHT: Record<ActivityType, number> = {
  'meet': 0,
  'mcq-word-meaning': 0.55,
  'mcq-meaning-word': 0.60,
  'listen-meaning': 0.70,
  'listen-spelling': 0.70,
  'minimal-pair': 0.70,
  'cued-recall': 0.75,
  'free-recall': 1.00,
  'spelling-build': 0.70,
  'flash-type': 0.70,
  'sentence-dictation': 1.00,
  'context-cloze': 0.80,
  'collocation-select': 0.80,
  'form-transform': 0.80,
  'sentence-production': 1.15,
  'discrimination': 0.80,
  'writing-task': 0.90,
};

/** Writing-task weight when graded by a configured AI provider (§6). */
export const WRITING_AI_WEIGHT = 1.10;

/** Expected response time per activity in ms (§6 buckets: MCQ 6s, typing 12s, sentence 60s).
 *  [CHOICE]: listening MCQs → 6s bucket; dictation typing → 12s; writing-task → 60s. */
export const EXPECTED_MS: Record<ActivityType, number> = {
  'meet': 0,
  'mcq-word-meaning': 6_000,
  'mcq-meaning-word': 6_000,
  'listen-meaning': 6_000,
  'listen-spelling': 6_000,
  'minimal-pair': 6_000,
  'cued-recall': 12_000,
  'free-recall': 12_000,
  'spelling-build': 12_000,
  'flash-type': 12_000,
  'sentence-dictation': 12_000,
  'context-cloze': 6_000,
  'collocation-select': 6_000,
  'form-transform': 12_000,
  'sentence-production': 60_000,
  'discrimination': 6_000,
  'writing-task': 60_000,
};

/** Default dimension trained by each activity. The session item's own `dimension`
 *  field is authoritative at runtime (discrimination variants, dictation). */
export const ACTIVITY_DIMENSION: Record<ActivityType, DimensionKey> = {
  'meet': 'recognition',
  'mcq-word-meaning': 'recognition',
  'mcq-meaning-word': 'recognition',
  'listen-meaning': 'listening',
  'listen-spelling': 'listening',
  'minimal-pair': 'listening',
  'cued-recall': 'recall',
  'free-recall': 'recall',
  'spelling-build': 'spelling',
  'flash-type': 'spelling',
  'sentence-dictation': 'listening',
  'context-cloze': 'context',
  'collocation-select': 'collocation',
  'form-transform': 'forms',
  'sentence-production': 'production',
  'discrimination': 'recognition',
  'writing-task': 'writing',
};

/** Harder → easier cross-dimension credit edges, factor 0.5 (§6). Failure never propagates. */
export const CROSS_CREDIT: Partial<Record<DimensionKey, DimensionKey[]>> = {
  recall: ['recognition', 'context'],
  production: ['recall'],
  writing: ['production'],
  listening: ['recognition'],
  spelling: ['recognition'],
  collocation: ['context'],
  context: ['recognition'],
};

/** [CHOICE]: dictation genuinely exercises spelling (hear → type). On a correct
 *  sentence-dictation, spelling also receives half-weight credit. */
export const DICTATION_SPELLING_CREDIT = 0.5;

/** Spaced-repetition interval ladder in days (§9). */
export const INTERVAL_LADDER = [1, 2, 4, 8, 16, 32, 64] as const;
export const MAX_INTERVAL_DAYS = 90;
export const IN_SESSION_RETRY_MS = 10 * 60 * 1000;

/** Overall mastery weights (§6) — sums to 1.00. */
export const MASTERY_WEIGHTS: Record<DimensionKey, number> = {
  recognition: 0.08,
  context: 0.10,
  listening: 0.13,
  spelling: 0.13,
  recall: 0.18,
  forms: 0.05,
  collocation: 0.08,
  production: 0.15,
  writing: 0.10,
};

/** Core dimensions for the stage-5 "no recent lapses" rubric (§6). */
export const CORE_DIMENSIONS: DimensionKey[] = ['recognition', 'recall', 'context', 'listening', 'spelling'];

/** Desirable-difficulty band for the rolling session success rate (§5, §7). */
export const SUCCESS_TARGET_LOW = 0.8;
export const SUCCESS_TARGET_HIGH = 0.85;
export const SUCCESS_EASY_BELOW = 0.7;
export const SUCCESS_HARD_ABOVE = 0.92;

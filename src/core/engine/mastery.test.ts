import { describe, expect, it } from 'vitest';
import type { DimensionKey, WordProgress } from '../../types/domain';
import { DIMENSIONS } from '../../types/domain';
import {
  applyLearningEvent, freshDimensionState, freshWordProgress, overallMastery,
  retentionOf, seedIntroduction,
} from './mastery';
import { computeStage } from './stages';

const NOW = 1_700_000_000_000;

function intro(): WordProgress {
  return seedIntroduction(freshWordProgress('achieve', NOW), 'meet', NOW);
}

function withDims(base: WordProgress, patch: Partial<Record<DimensionKey, Partial<{ strength: number }>>>): WordProgress {
  const dimensions = { ...base.dimensions };
  for (const d of DIMENSIONS) {
    const spec = patch[d];
    if (spec?.strength !== undefined) dimensions[d] = { ...dimensions[d], strength: spec.strength };
  }
  return { ...base, dimensions };
}

describe('mastery update rules', () => {
  it('applies the exact success formula Δ = w·(100−s)·0.30·time·hint', () => {
    const p = intro();
    const out = applyLearningEvent(p, {
      activity: 'mcq-word-meaning', correct: true, responseMs: 6000, hintsUsed: 0, timestamp: NOW,
    });
    // Δ = 0.55 × 100 × 0.30 × 1 × 1 = 16.5
    expect(out.dimensions.recognition.strength).toBeCloseTo(16.5, 9);
    expect(out.dimensions.recognition.streak).toBe(1);
    expect(out.dimensions.recognition.attempts).toBe(1);
    expect(out.dimensions.recognition.successes).toBe(1);
  });

  it('scales gains by response time (fast correct earns more)', () => {
    const p = intro();
    const fast = applyLearningEvent(p, {
      activity: 'mcq-word-meaning', correct: true, responseMs: 3000, hintsUsed: 0, timestamp: NOW,
    });
    const slow = applyLearningEvent(p, {
      activity: 'mcq-word-meaning', correct: true, responseMs: 12000, hintsUsed: 0, timestamp: NOW,
    });
    // timeMod fast = clamp(6000/3000)=1.15 → Δ=18.975; slow = clamp(6000/12000)=0.7 → Δ=11.55
    expect(fast.dimensions.recognition.strength).toBeCloseTo(18.975, 9);
    expect(slow.dimensions.recognition.strength).toBeCloseTo(11.55, 9);
  });

  it('halves hint-assisted gains (×0.7)', () => {
    const p = intro();
    const out = applyLearningEvent(p, {
      activity: 'mcq-word-meaning', correct: true, responseMs: 6000, hintsUsed: 1, timestamp: NOW,
    });
    expect(out.dimensions.recognition.strength).toBeCloseTo(16.5 * 0.7, 9);
  });

  it('failure floors strength at ×0.55, resets streak, counts a lapse', () => {
    let p = withDims(intro(), { recognition: { strength: 50 } });
    p = { ...p, dimensions: { ...p.dimensions, recognition: { ...p.dimensions.recognition, attempts: 2, successes: 2, streak: 3 } } };
    const out = applyLearningEvent(p, {
      activity: 'mcq-word-meaning', correct: false, responseMs: 4000, hintsUsed: 0, timestamp: NOW,
    });
    expect(out.dimensions.recognition.strength).toBe(27); // floor(50×0.55)
    expect(out.dimensions.recognition.streak).toBe(0);
    expect(out.dimensions.recognition.lapses).toBe(1);
  });

  it('applies the extra ×0.85 penalty on overconfident misses', () => {
    const p = withDims(intro(), { recognition: { strength: 50 } });
    const out = applyLearningEvent(p, {
      activity: 'mcq-word-meaning', correct: false, responseMs: 4000,
      hintsUsed: 0, timestamp: NOW, confidence: 'sure',
    });
    expect(out.dimensions.recognition.strength).toBe(23); // floor(50×0.55×0.85)
  });

  it('recognition success NEVER touches the recall schedule (anti-illusion-of-competence)', () => {
    const recallDueAt = NOW - 5000;
    const p: WordProgress = {
      ...intro(),
      dimensions: {
        ...intro().dimensions,
        recall: {
          ...freshDimensionState(), strength: 50, streak: 2, attempts: 3, successes: 2,
          lastReviewedAt: NOW - 4 * 86_400_000, nextDueAt: recallDueAt, lastIntervalDays: 4,
        },
      },
    };
    const out = applyLearningEvent(p, {
      activity: 'mcq-word-meaning', correct: true, responseMs: 5000, hintsUsed: 0, timestamp: NOW,
    });
    expect(out.dimensions.recall.nextDueAt).toBe(recallDueAt);
    expect(out.dimensions.recall.strength).toBe(50);
    expect(out.dimensions.recall.attempts).toBe(3);
  });

  it('recall success partially credits recognition + context (factor 0.5)', () => {
    let p = intro();
    // Attempt recognition first so credit has history to extend (no fabricated dues).
    p = applyLearningEvent(p, {
      activity: 'mcq-word-meaning', correct: true, responseMs: 6000, hintsUsed: 0, timestamp: NOW,
    });
    const before = p.dimensions.recognition.strength;
    const beforeDue = p.dimensions.recognition.nextDueAt;
    const out = applyLearningEvent(p, {
      activity: 'free-recall', correct: true, responseMs: 10000, hintsUsed: 0, timestamp: NOW + 1000,
    });
    expect(out.dimensions.recall.strength).toBeGreaterThan(0);
    expect(out.dimensions.recognition.strength).toBeGreaterThan(before);
    expect(out.dimensions.recognition.nextDueAt).toBeGreaterThanOrEqual(beforeDue);
  });

  it('meet seeds introduction without changing strength', () => {
    const fresh = freshWordProgress('achieve', NOW);
    expect(fresh.masteryStage).toBe(0);
    const seeded = seedIntroduction(fresh, 'meet', NOW);
    expect(seeded.masteryStage).toBe(1);
    expect(seeded.introducedAt).toBe(NOW);
    expect(seeded.firstExposureModality).toBe('meet');
  });

  it('clamps a skewed clock to lastReviewedAt', () => {
    const p = applyLearningEvent(intro(), {
      activity: 'mcq-word-meaning', correct: true, responseMs: 6000, hintsUsed: 0, timestamp: NOW,
    });
    const skewed = applyLearningEvent(p, {
      activity: 'mcq-word-meaning', correct: true, responseMs: 6000, hintsUsed: 0, timestamp: NOW - 999_999,
    });
    expect(skewed.dimensions.recognition.lastReviewedAt).toBe(NOW);
  });
});

describe('retention math', () => {
  it('computes S, R, risk per the forgetting-curve formula', () => {
    const p = withDims(intro(), { recall: { strength: 50 } });
    const dim = { ...p.dimensions.recall, lastReviewedAt: NOW - 2 * 86_400_000, lastIntervalDays: 4 };
    const r = retentionOf(dim, NOW);
    // S = 4 × (0.6 + 50/250) = 3.2; R = exp(−2/3.2)
    expect(r.stabilityDays).toBeCloseTo(3.2, 9);
    expect(r.retention).toBeCloseTo(Math.exp(-2 / 3.2), 9);
    expect(r.risk).toBeCloseTo(1 - Math.exp(-2 / 3.2), 9);
    expect(r.atRisk).toBe(true); // R ≈ 0.535 < 0.6
  });

  it('reports never-reviewed dimensions as fully retained', () => {
    const r = retentionOf(freshDimensionState(), NOW);
    expect(r.retention).toBe(1);
    expect(r.atRisk).toBe(false);
  });
});

describe('overall mastery', () => {
  it('is the weighted mean with the §6 weights', () => {
    const p = withDims(intro(), {
      recognition: { strength: 100 }, recall: { strength: 100 },
    });
    // 0.08 + 0.18 = 0.26 → 26
    expect(overallMastery(p.dimensions)).toBeCloseTo(26, 9);
  });
});

describe('mastery stage ladder', () => {
  it('fires exactly at thresholds', () => {
    expect(computeStage(freshWordProgress('x', NOW))).toBe(0);
    expect(computeStage(intro())).toBe(1);
    expect(computeStage(withDims(intro(), { recognition: { strength: 60 }, context: { strength: 40 } }))).toBe(2);
    expect(computeStage(withDims(intro(), { recognition: { strength: 59.9 }, context: { strength: 100 } }))).toBe(1);
    const active = withDims(intro(), {
      recognition: { strength: 80 }, context: { strength: 60 },
      recall: { strength: 50 }, listening: { strength: 40 }, spelling: { strength: 40 },
    });
    expect(computeStage(active)).toBe(3);
    const expressive = withDims(active, { production: { strength: 50 }, collocation: { strength: 50 } });
    expect(computeStage(expressive)).toBe(4);
  });

  it('requires the full stage-5 rubric and demotes on lapse', () => {
    const allHigh = withDims(intro(), {
      recognition: { strength: 90 }, context: { strength: 90 }, listening: { strength: 90 },
      spelling: { strength: 90 }, recall: { strength: 90 }, forms: { strength: 90 },
      collocation: { strength: 90 }, production: { strength: 90 }, writing: { strength: 90 },
    });
    const withInterval: WordProgress = {
      ...allHigh,
      dimensions: {
        ...allHigh.dimensions,
        recognition: {
          ...allHigh.dimensions.recognition, lastIntervalDays: 25,
          attempts: 4, successes: 4, recent: [true, true],
        },
        recall: { ...allHigh.dimensions.recall, attempts: 4, successes: 4, recent: [true, true] },
        context: { ...allHigh.dimensions.context, attempts: 4, successes: 4, recent: [true, true] },
        listening: { ...allHigh.dimensions.listening, attempts: 4, successes: 4, recent: [true, true] },
        spelling: { ...allHigh.dimensions.spelling, attempts: 4, successes: 4, recent: [true, true] },
      },
    };
    expect(computeStage(withInterval)).toBe(5);
    // Short interval → not mastered.
    const short: WordProgress = {
      ...withInterval,
      dimensions: { ...withInterval.dimensions, recognition: { ...withInterval.dimensions.recognition, lastIntervalDays: 8 } },
    };
    expect(computeStage(short)).toBe(4);
    // Recent lapse in a core dimension → demoted to 4.
    const lapsed: WordProgress = {
      ...withInterval,
      dimensions: { ...withInterval.dimensions, recall: { ...withInterval.dimensions.recall, recent: [true, false] } },
    };
    expect(computeStage(lapsed)).toBe(4);
  });
});

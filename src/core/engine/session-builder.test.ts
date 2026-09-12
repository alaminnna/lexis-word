import { describe, expect, it } from 'vitest';
import type {
  DimensionKey, UserSettings, WordProgress, WordRecord,
} from '../../types/domain';
import { DIMENSIONS } from '../../types/domain';
import { WORDS } from '../../data/words';
import { DEFAULT_SETTINGS } from '../../services/persistence';
import { applyLearningEvent, freshWordProgress, seedIntroduction } from './mastery';
import { buildSession, type BuilderInput } from './session-builder';

const NOW = 1_700_000_000_000;
const DAY = 86_400_000;

const SETTINGS: UserSettings = {
  dailyNewTarget: 8, maxActiveWords: 90, sessionLengthTarget: 15,
  bengaliPolicy: 'on-demand', speechRate: 1, theme: 'light', seed: 42,
  sound: DEFAULT_SETTINGS.sound, haptics: DEFAULT_SETTINGS.haptics,
};

function baseInput(overrides: Partial<BuilderInput> = {}): BuilderInput {
  return {
    words: WORDS, progress: {}, confusion: [], settings: SETTINGS,
    seed: 42, now: NOW, introducedToday: [], daysSinceActive: 0,
    rollingSuccess: null, speechAvailable: true, ...overrides,
  };
}

function intro(id: string, at: number): WordProgress {
  return seedIntroduction(freshWordProgress(id, at), 'meet', at);
}

/** Introduced word with fully specified dimension states. */
function prog(id: string, at: number, dims: Partial<Record<DimensionKey, { strength: number; attempts: number; nextDueAt: number; lastReviewedAt: number; streak?: number; recent?: boolean[] }>>): WordProgress {
  const p = intro(id, at);
  const dimensions = { ...p.dimensions };
  for (const d of DIMENSIONS) {
    const spec = dims[d];
    if (!spec) continue;
    dimensions[d] = {
      strength: spec.strength, streak: spec.streak ?? 1, lapses: 0,
      attempts: spec.attempts, successes: spec.attempts,
      lastReviewedAt: spec.lastReviewedAt, nextDueAt: spec.nextDueAt,
      lastIntervalDays: 2, recent: spec.recent ?? [true],
    };
  }
  return { ...p, dimensions };
}

describe('session builder', () => {
  it('is deterministic: identical inputs → identical plans', () => {
    const a = buildSession(baseInput());
    const b = buildSession(baseInput());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.items).toHaveLength(15);
  });

  it('introduces brand-new words as meet triples with spaced follow-ups', () => {
    const plan = buildSession(baseInput());
    const meets = plan.items.filter((i) => i.activity === 'meet');
    expect(meets.length).toBeGreaterThanOrEqual(1);
    for (const meet of meets) {
      const idx = plan.items.indexOf(meet);
      const f1 = plan.items.findIndex((i) => i.wordId === meet.wordId && i.activity === 'mcq-word-meaning');
      const f2 = plan.items.findIndex((i) => i.wordId === meet.wordId && i.activity === 'mcq-meaning-word');
      expect(f1).toBeGreaterThanOrEqual(idx + 5); // ≥5 items after the meet
      expect(f2).toBeGreaterThan(f1); // reverse check closes the session arc
      // Every MCQ carries its question stem (a stem-less MCQ is a broken item).
      expect(plan.items[f1]!.prompt).toBe(WORDS.find((w) => w.id === meet.wordId)!.word);
      expect(plan.items[f2]!.prompt).toBeTruthy();
    }
  });

  it('gives every item a human-readable reason', () => {
    const plan = buildSession(baseInput());
    for (const item of plan.items) {
      expect(item.reason.kind).toBeTruthy();
      expect(item.reason.humanText.length).toBeGreaterThan(10);
    }
  });

  it('schedules the weakest due dimension (recall) for a recall-due word', () => {
    const progress = {
      achieve: prog('achieve', NOW - 5 * DAY, {
        recognition: { strength: 80, attempts: 3, nextDueAt: NOW + 10 * DAY, lastReviewedAt: NOW - DAY },
        recall: { strength: 30, attempts: 2, nextDueAt: NOW - DAY, lastReviewedAt: NOW - 3 * DAY },
      }),
    };
    const plan = buildSession(baseInput({ progress }));
    const recallItem = plan.items.find((i) => i.wordId === 'achieve' && i.dimension === 'recall');
    expect(recallItem).toBeDefined();
    expect(['cued-recall', 'free-recall']).toContain(recallItem!.activity);
  });

  it('still schedules recall after a recognition-only success (end-to-end separation)', () => {
    const before: Record<string, WordProgress> = {
      achieve: prog('achieve', NOW - 5 * DAY, {
        recognition: { strength: 80, attempts: 3, nextDueAt: NOW + 10 * DAY, lastReviewedAt: NOW - DAY },
        recall: { strength: 30, attempts: 2, nextDueAt: NOW - DAY, lastReviewedAt: NOW - 3 * DAY },
      }),
    };
    const after = applyLearningEvent(before.achieve!, {
      activity: 'mcq-word-meaning', correct: true, responseMs: 5000,
      hintsUsed: 0, timestamp: NOW,
    });
    const plan = buildSession(baseInput({ progress: { achieve: after }, now: NOW + 1000 }));
    expect(plan.items.find((i) => i.wordId === 'achieve' && i.dimension === 'recall')).toBeDefined();
  });

  it('opens with a warm-up when a high-confidence due item exists', () => {
    // strength 90, interval 30d, reviewed 1d ago → R = exp(−1/28.8) ≈ 0.966 > 0.9.
    const strong = prog('achieve', NOW - 10 * DAY, {
      recognition: {
        strength: 90, attempts: 3, nextDueAt: NOW - 1000,
        lastReviewedAt: NOW - DAY, streak: 4, recent: [true, true],
      },
    });
    const fixed: WordProgress = {
      ...strong,
      dimensions: {
        ...strong.dimensions,
        recognition: { ...strong.dimensions.recognition, lastIntervalDays: 30 },
      },
    };
    const plan = buildSession(baseInput({ progress: { achieve: fixed } }));
    expect(plan.items[0]!.reason.kind).toBe('warm-up');
  });

  it('suspends introductions after >3 inactive days (re-entry protocol)', () => {
    const progress = {
      achieve: prog('achieve', NOW - 10 * DAY, {
        recall: { strength: 30, attempts: 2, nextDueAt: NOW - DAY, lastReviewedAt: NOW - 5 * DAY },
      }),
    };
    const plan = buildSession(baseInput({ progress, daysSinceActive: 4 }));
    expect(plan.items.length).toBeGreaterThan(0);
    expect(plan.items.every((i) => i.activity !== 'meet')).toBe(true);
  });

  it('honours the daily new-word budget and the active-words cap', () => {
    const full = ['w1', 'w2', 'w3', 'w4', 'w5', 'w6', 'w7', 'w8'];
    expect(buildSession(baseInput({ introducedToday: full })).items.every((i) => i.activity !== 'meet')).toBe(true);

    const capped: Record<string, WordProgress> = {};
    WORDS.slice(0, 90).forEach((w: WordRecord, i: number) => {
      capped[w.id] = prog(w.id, NOW - (i + 1) * DAY, {
        recognition: { strength: 40, attempts: 2, nextDueAt: NOW - DAY, lastReviewedAt: NOW - 2 * DAY },
      });
    });
    const plan = buildSession(baseInput({ progress: capped }));
    expect(plan.items.every((i) => i.activity !== 'meet')).toBe(true);
    expect(plan.items.length).toBeGreaterThan(0);
  });

  it('schedules discrimination drills for confusion pairs (weight ≥ 2)', () => {
    const at = NOW - 5 * DAY;
    const progress = { achieve: intro('achieve', at), affect: intro('affect', at) };
    const confusion = [{ a: 'achieve', b: 'affect', weight: 2.5, lastAt: NOW - DAY, resolvedStreak: 0 }];
    const plan = buildSession(baseInput({ progress, confusion }));
    const drill = plan.items.find((i) => i.activity === 'discrimination');
    expect(drill).toBeDefined();
    expect(drill!.pairId).toBeDefined();
    expect(drill!.reason.kind).toBe('confusion-pair');
  });

  it('sizes MCQ options by rolling success (3 easy / 4 default / 5 hard)', () => {
    const countFor = (rolling: number | null): number => {
      const plan = buildSession(baseInput({ rollingSuccess: rolling }));
      const mcq = plan.items.find((i) => i.activity === 'mcq-word-meaning');
      return mcq!.options!.length;
    };
    expect(countFor(0.6)).toBe(3);
    expect(countFor(null)).toBe(4);
    expect(countFor(0.95)).toBe(5);
  });

  it('keeps steady-state sessions introducing new words (no review starvation)', () => {
    const progress: Record<string, WordProgress> = {};
    WORDS.slice(0, 20).forEach((w: WordRecord, i: number) => {
      progress[w.id] = prog(w.id, NOW - (i + 2) * DAY, {
        recognition: { strength: 45, attempts: 2, nextDueAt: NOW - DAY, lastReviewedAt: NOW - 2 * DAY },
        recall: { strength: 35, attempts: 1, nextDueAt: NOW - DAY, lastReviewedAt: NOW - 2 * DAY },
        spelling: { strength: 45, attempts: 2, nextDueAt: NOW - DAY, lastReviewedAt: NOW - 2 * DAY },
      });
    });
    const plan = buildSession(baseInput({ progress }));
    expect(plan.items.some((i) => i.activity === 'meet')).toBe(true);
  });

  it('marks stage-5 dues as maintenance checks', () => {
    const dims: Partial<Record<DimensionKey, { strength: number; attempts: number; nextDueAt: number; lastReviewedAt: number; streak: number; recent: boolean[] }>> = {};
    for (const d of DIMENSIONS) {
      dims[d] = {
        strength: 90, attempts: 5, nextDueAt: NOW - DAY, lastReviewedAt: NOW - 3 * DAY,
        streak: 5, recent: [true, true],
      };
    }
    const p = prog('achieve', NOW - 60 * DAY, dims);
    const withInterval: WordProgress = {
      ...p,
      dimensions: {
        ...p.dimensions,
        recognition: { ...p.dimensions.recognition, lastIntervalDays: 25 },
      },
    };
    const staged: WordProgress = { ...withInterval, masteryStage: 5 };
    // Block introductions so the maintenance item leads the session.
    const plan = buildSession(baseInput({
      progress: { achieve: staged },
      introducedToday: ['x1', 'x2', 'x3', 'x4', 'x5', 'x6', 'x7', 'x8'],
    }));
    expect(plan.items[0]!.reason.kind).toBe('maintenance');
  });
});

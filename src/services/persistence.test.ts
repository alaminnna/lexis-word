import { describe, expect, it, beforeEach } from 'vitest';
import type { DimensionKey, DimensionState, PersistedProgress } from '../types/domain';
import { DIMENSIONS } from '../types/domain';
import { WORDS } from '../data/words';
import { buildSession } from '../core/engine/session-builder';
import { emptyProgress, persistence } from './persistence';
import { DEFAULT_SETTINGS } from './persistence';

function dims(strength: number): Record<DimensionKey, DimensionState> {
  const out = {} as Record<DimensionKey, DimensionState>;
  for (const d of DIMENSIONS) {
    out[d] = {
      strength, streak: 1, lapses: 0, attempts: 2, successes: 2,
      lastReviewedAt: 1, nextDueAt: 2, lastIntervalDays: 1, recent: [true],
    };
  }
  return out;
}

describe('persistence', () => {
  beforeEach(() => localStorage.clear());

  it('exports, wipes, and imports back complete progress', () => {
    const progress: PersistedProgress = {
      ...emptyProgress(),
      words: {
        achieve: {
          wordId: 'achieve', introducedAt: 123, masteryStage: 2,
          dimensions: dims(42),
          firstExposureModality: 'meet',
          errorProfile: { 'dropped-double': 2 },
          updatedAt: 456,
        },
      },
      confusion: [{ a: 'achieve', b: 'affect', weight: 2, lastAt: 7, resolvedStreak: 1 }],
      onboardingDone: true,
    };
    const json = persistence.exportAll(progress, DEFAULT_SETTINGS);
    persistence.resetAll();
    expect(persistence.loadProgress()).toBeNull();
    const { progress: back, settings } = persistence.importAll(json);
    expect(back.words['achieve']?.masteryStage).toBe(2);
    expect(back.words['achieve']?.dimensions.recall.strength).toBe(42);
    expect(back.words['achieve']?.errorProfile).toEqual({ 'dropped-double': 2 });
    expect(back.confusion).toHaveLength(1);
    expect(back.onboardingDone).toBe(true);
    expect(settings.dailyNewTarget).toBe(DEFAULT_SETTINGS.dailyNewTarget);
  });

  it('rejects corrupt imports loudly', () => {
    expect(() => persistence.importAll('not json')).toThrow();
    expect(() => persistence.importAll(JSON.stringify({ app: 'other' }))).toThrow();
    expect(() => persistence.importAll(JSON.stringify({ app: 'lexis', progress: { version: 999 } }))).toThrow();
  });

  it('normalizes stale-schema word progress (no recent, partial dims, bad ranges)', () => {
    const stale = {
      app: 'lexis',
      progress: {
        version: 1,
        words: {
          achieve: {
            wordId: 'achieve', introducedAt: 123, masteryStage: 9,
            dimensions: {
              recognition: { strength: 250, streak: 1, attempts: 2, successes: 2, lastReviewedAt: 1, nextDueAt: 2, lastIntervalDays: 1 },
            },
            errorProfile: { bad: 'x', 'dropped-double': 2 },
            updatedAt: 456,
          },
        },
        onboardingDone: true,
      },
      settings: DEFAULT_SETTINGS,
    };
    const { progress } = persistence.importAll(JSON.stringify(stale));
    const w = progress.words['achieve'];
    expect(w).toBeDefined();
    expect(w!.masteryStage).toBe(5); // clamped
    expect(w!.dimensions.recall.attempts).toBe(0); // missing dims filled
    expect(w!.dimensions.recall.recent).toEqual([]);
    expect(w!.dimensions.recognition.strength).toBe(100); // clamped
    expect(w!.dimensions.recognition.recent).toEqual([]);
    expect(w!.errorProfile).toEqual({ 'dropped-double': 2 }); // non-numeric dropped
    // The normalized output must be engine-safe (the stale shape crashed the
    // session builder and dead-ended Today's CTA).
    const plan = buildSession({
      words: [{ ...WORDS[0]! }], progress: progress.words, confusion: [],
      settings: DEFAULT_SETTINGS, seed: 1, now: Date.now(),
      introducedToday: [], daysSinceActive: 0, rollingSuccess: null, speechAvailable: false,
    });
    expect(plan.items.length).toBeGreaterThan(0);
  });
});

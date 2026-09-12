import { describe, expect, it } from 'vitest';
import { paceProjection, retentionForecast, rollingSuccess } from './projections';
import { freshWordProgress, seedIntroduction } from './mastery';
import type { DailyLog, LearningEvent, WordProgress } from '../../types/domain';
import { DAY_MS, dayKey } from '../../utils/time';

const NOW = 1_700_000_000_000;

function event(correct: boolean, ts: number): LearningEvent {
  return {
    id: `e${ts}`, sessionId: 's', wordId: 'w', activity: 'mcq-word-meaning',
    dimension: 'recognition', correct, responseMs: 5000, hintsUsed: 0, audioReplays: 0, timestamp: ts,
  };
}

describe('pace projection', () => {
  it('projects completion from the trailing 7-day rate', () => {
    const daily: Record<string, DailyLog> = {};
    for (let d = 0; d < 7; d++) {
      const date = dayKey(NOW - d * DAY_MS);
      daily[date] = {
        date, newWordsIntroduced: 2, itemsAnswered: 10, itemsCorrect: 8,
        activeMinutes: 12, dimensionsTrained: {},
      };
    }
    const p = paceProjection(daily, NOW, 14, 499);
    expect(p.newPerDay).toBe(2);
    expect(p.remaining).toBe(485);
    expect(p.projectedDate).toBe(NOW + (485 / 2) * DAY_MS);
  });

  it('returns a null date (re-entry prompt, not guilt) when pace is zero', () => {
    const p = paceProjection({}, NOW, 10, 499);
    expect(p.newPerDay).toBe(0);
    expect(p.projectedDate).toBeNull();
  });
});

describe('retention forecast', () => {
  it('counts active words with weakest-link R ≥ 0.8 at the horizon', () => {
    const solid: WordProgress = {
      ...seedIntroduction(freshWordProgress('a', NOW - 30 * DAY_MS), 'meet', NOW - 30 * DAY_MS),
      dimensions: {
        ...seedIntroduction(freshWordProgress('a', NOW), 'meet', NOW).dimensions,
        recognition: {
          strength: 95, streak: 5, lapses: 0, attempts: 5, successes: 5,
          lastReviewedAt: NOW - DAY_MS, nextDueAt: NOW + 30 * DAY_MS, lastIntervalDays: 32, recent: [true, true],
        },
      },
    };
    const f = retentionForecast({ a: solid }, NOW, 7);
    // S = 32×(0.6+95/250) = 31.36; R at 8d = exp(−8/31.36) ≈ 0.775 < 0.8
    expect(f.activeTotal).toBe(1);
    expect(f.likelyRemembered).toBe(0);
    const f0 = retentionForecast({ a: solid }, NOW, 0);
    expect(f0.likelyRemembered).toBe(1);
  });
});

describe('rolling success', () => {
  it('returns null with insufficient data, else the last-window rate', () => {
    expect(rollingSuccess([event(true, 1)])).toBeNull();
    const events = Array.from({ length: 40 }, (_, i) => event(i % 4 !== 0, i));
    expect(rollingSuccess(events)).toBeCloseTo(0.75, 9);
  });
});

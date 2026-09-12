import { describe, expect, it } from 'vitest';
import type { ActivityType, DimensionKey, UserSettings, WordProgress } from '../../types/domain';
import { DIMENSIONS } from '../../types/domain';
import { WORDS } from '../../data/words';
import { DEFAULT_SETTINGS } from '../../services/persistence';
import { freshWordProgress, seedIntroduction } from './mastery';
import { buildSession } from './session-builder';

const NOW = 1_700_000_000_000;
const DAY = 86_400_000;

const SETTINGS: UserSettings = {
  dailyNewTarget: 8, maxActiveWords: 90, sessionLengthTarget: 15,
  bengaliPolicy: 'on-demand', speechRate: 1, theme: 'light', seed: 9,
  sound: DEFAULT_SETTINGS.sound, haptics: DEFAULT_SETTINGS.haptics,
};

/** One introduced word whose only due dimension is `target` at `strength`. */
function singleDue(wordId: string, target: DimensionKey, strength: number, extra: Partial<Record<DimensionKey, number>> = {}): Record<string, WordProgress> {
  const p = seedIntroduction(freshWordProgress(wordId, NOW - 12 * 3_600_000), 'meet', NOW - 12 * 3_600_000);
  const dimensions = { ...p.dimensions };
  const strengths: Partial<Record<DimensionKey, number>> = { [target]: strength, ...extra };
  for (const d of DIMENSIONS) {
    const s = strengths[d];
    if (s === undefined) continue;
    dimensions[d] = {
      ...dimensions[d], strength: s, streak: 2, attempts: 3, successes: 3,
      lastReviewedAt: NOW - 3 * DAY,
      nextDueAt: d === target ? NOW - DAY : NOW + 10 * DAY,
      lastIntervalDays: 2, recent: [true],
    };
  }
  return { [wordId]: { ...p, dimensions } };
}

function activitiesFor(progress: Record<string, WordProgress>, seed: number, confusion: { a: string; b: string; weight: number; lastAt: number; resolvedStreak: number }[] = []): Set<ActivityType> {
  const plan = buildSession({
    words: WORDS, progress, confusion, settings: SETTINGS, seed, now: NOW,
    introducedToday: [], daysSinceActive: 0, rollingSuccess: null, speechAvailable: true,
  });
  return new Set(plan.items.map((i) => i.activity));
}

describe('activity coverage', () => {
  it('reaches every activity type through the adaptive engine', () => {
    const seen = new Set<ActivityType>();
    // Fresh state: meet + both recognition directions.
    for (const a of activitiesFor({}, 1)) seen.add(a);
    // Per-dimension dues (achieve has forms for the forms ladder).
    const cases: [string, DimensionKey, number, Partial<Record<DimensionKey, number>>][] = [
      ['achieve', 'recall', 20, {}],
      ['achieve', 'recall', 60, {}],
      ['achieve', 'context', 30, {}],
      ['achieve', 'listening', 20, {}],
      ['achieve', 'listening', 50, {}],
      ['achieve', 'spelling', 20, {}],
      ['achieve', 'spelling', 50, {}],
      ['achieve', 'spelling', 80, {}],
      ['achieve', 'forms', 30, {}],
      ['achieve', 'collocation', 30, {}],
      ['achieve', 'production', 40, { recall: 45 }],
      ['achieve', 'writing', 30, {}],
    ];
    for (const [w, dim, strength, extra] of cases) {
      for (const a of activitiesFor(singleDue(w, dim, strength, extra), 2)) seen.add(a);
    }
    // High listening strength alternates dictation / minimal-pair across seeds.
    for (let seed = 10; seed < 40; seed++) {
      for (const a of activitiesFor(singleDue('achieve', 'listening', 80, {}), seed)) seen.add(a);
    }
    // Confusion pair drill.
    const at = NOW - 5 * DAY;
    const pairProgress: Record<string, WordProgress> = {
      achieve: seedIntroduction(freshWordProgress('achieve', at), 'meet', at),
      affect: seedIntroduction(freshWordProgress('affect', at), 'meet', at),
    };
    for (const a of activitiesFor(pairProgress, 3, [{ a: 'achieve', b: 'affect', weight: 2.5, lastAt: NOW - DAY, resolvedStreak: 0 }])) {
      seen.add(a);
    }

    const expected: ActivityType[] = [
      'meet', 'mcq-word-meaning', 'mcq-meaning-word', 'listen-meaning', 'listen-spelling',
      'minimal-pair', 'cued-recall', 'free-recall', 'spelling-build', 'flash-type',
      'sentence-dictation', 'context-cloze', 'collocation-select', 'form-transform',
      'sentence-production', 'discrimination', 'writing-task',
    ];
    for (const a of expected) {
      expect(seen.has(a), `activity ${a} should be reachable`).toBe(true);
    }
  });
});

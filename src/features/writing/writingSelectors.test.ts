import { describe, expect, it } from 'vitest';
import type { DimensionKey, DimensionState, LearningEvent, WordProgress } from '../../types/domain';
import { DIMENSIONS } from '../../types/domain';
import { recommendedWritingTargets, recentWriting } from './writingSelectors';
import { clearDraft, loadDraft, saveDraft } from './writingDraft';

const NOW = 1_700_000_000_000;
const DAY = 86_400_000;

function dims(overrides: Partial<Record<DimensionKey, Partial<DimensionState>>>): Record<DimensionKey, DimensionState> {
  const out = {} as Record<DimensionKey, DimensionState>;
  for (const d of DIMENSIONS) {
    out[d] = {
      strength: 0, streak: 0, lapses: 0, attempts: 0, successes: 0,
      lastReviewedAt: 0, nextDueAt: 0, lastIntervalDays: 0, recent: [],
      ...(overrides[d] ?? {}),
    };
  }
  return out;
}

function word(id: string, prod: number, writingAttempts = 0, writingDueInFuture = true): WordProgress {
  return {
    wordId: id, introducedAt: NOW - 30 * DAY, masteryStage: 3,
    dimensions: dims({
      production: { strength: prod, attempts: 3, successes: 3 },
      writing: {
        strength: 10, attempts: writingAttempts, successes: writingAttempts,
        lastReviewedAt: NOW - 20 * DAY,
        nextDueAt: writingDueInFuture ? NOW + DAY : NOW - DAY,
        lastIntervalDays: 1, recent: [true],
      },
    }),
    firstExposureModality: 'meet', errorProfile: {}, updatedAt: NOW,
  };
}

function writingEvent(wordId: string, ts: number, correct = true): LearningEvent {
  return {
    id: `e-${wordId}-${ts}`, sessionId: 's', wordId, activity: 'writing-task',
    dimension: 'writing', correct, responseMs: 60_000, hintsUsed: 0, audioReplays: 0, timestamp: ts,
  };
}

describe('recommendedWritingTargets', () => {
  it('ranks stale production first, then dues, then ready words', () => {
    const progress = {
      achieve: word('achieve', 80), // stale: prod≥50, never written
      affect: word('affect', 30), // ready: prod 20–49, no writing attempts
      analysis: word('analysis', 10, 2, false), // due: writing attempted + overdue
    };
    const targets = recommendedWritingTargets(progress, [], NOW, 3);
    expect(targets.map((t) => t.word.id)).toEqual(['achieve', 'analysis', 'affect']);
    expect(targets[0]!.reason).toContain('never written');
    expect(targets[1]!.reason).toContain('Due');
    expect(targets[2]!.reason).toContain('Ready');
  });

  it('uses the 14-day use-it-or-lose-it rule honestly', () => {
    const progress = { achieve: word('achieve', 80) };
    const recent = [writingEvent('achieve', NOW - 3 * DAY)];
    expect(recommendedWritingTargets(progress, recent, NOW, 3)).toHaveLength(0);
    const old = [writingEvent('achieve', NOW - 18 * DAY)];
    const targets = recommendedWritingTargets(progress, old, NOW, 3);
    expect(targets).toHaveLength(1);
    expect(targets[0]!.reason).toContain('18 days ago');
  });

  it('ignores unintroduced words and caps the count', () => {
    const progress = { achieve: word('achieve', 80), affect: { ...word('affect', 80), introducedAt: 0 } };
    const targets = recommendedWritingTargets(progress, [], NOW, 1);
    expect(targets.map((t) => t.word.id)).toEqual(['achieve']);
  });
});

describe('recentWriting', () => {
  it('returns newest-first writing events, capped, never invented', () => {
    expect(recentWriting([], 5)).toEqual([]);
    const events = [
      writingEvent('achieve', NOW - 3 * DAY),
      { ...writingEvent('affect', NOW - DAY, false), activity: 'free-recall' as const, dimension: 'recall' as const },
      writingEvent('analysis', NOW - 2 * DAY),
    ];
    const recent = recentWriting(events, 5);
    expect(recent.map((r) => r.wordId)).toEqual(['analysis', 'achieve']);
    expect(recent[0]).toMatchObject({ word: 'analysis', correct: true });
    expect(recentWriting(events, 1)).toHaveLength(1);
  });
});

describe('writing drafts', () => {
  it('saves, restores, and clears per word+task', () => {
    localStorage.clear();
    expect(loadDraft('achieve', 'free')).toBeNull();
    saveDraft('achieve', 'free', 'My sentence here.');
    expect(loadDraft('achieve', 'free')?.text).toBe('My sentence here.');
    expect(loadDraft('achieve', 'transform')).toBeNull();
    saveDraft('achieve', 'free', '   ');
    expect(loadDraft('achieve', 'free')).toBeNull();
    saveDraft('achieve', 'free', 'Again.');
    clearDraft('achieve', 'free');
    expect(loadDraft('achieve', 'free')).toBeNull();
  });
});

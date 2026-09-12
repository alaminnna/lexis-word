import type { ActivityType, Confidence, LearningEvent, SessionItem, WordRecord } from '../../types/domain';
import { WORDS, WORD_MAP } from '../../data/words';
import { findNearMissWord, type ConfusionSignal } from '../../core/engine/confusion';
import { classifySpellingError } from '../../core/engine/errors';
import { isHesitation } from '../../core/engine/grading';
import type { ApplyOptions } from '../../core/engine/mastery';
import type { Submission } from './activities/types';

type RawEvent = Omit<LearningEvent, 'id'>;

export interface CommitDeps {
  meetWord: (wordId: string, modality: ActivityType, now: number) => void;
  commitEvent: (event: RawEvent, opts?: ApplyOptions) => void;
  commitEvents: (events: RawEvent[], opts?: ApplyOptions) => void;
  addConfusionSignal: (a: string, b: string, signal: ConfusionSignal, now: number, prior?: boolean) => void;
  resolveConfusion: (a: string, b: string, correct: boolean, now: number) => void;
  recordSpellingError: (wordId: string, kind: string, now: number) => void;
}

export interface CommitArgs {
  item: SessionItem & { isRetry?: boolean };
  word: WordRecord;
  sub: Submission;
  responseMs: number;
  confidence?: Confidence;
  hintsUsed: number;
  replays: number;
  sessionId: string;
  now: number;
}

export function sharesBengaliOrPosStage(a: WordRecord, b: WordRecord): boolean {
  const ab = a.bengali ? (Array.isArray(a.bengali) ? a.bengali : [a.bengali]) : [];
  const bb = b.bengali ? (Array.isArray(b.bengali) ? b.bengali : [b.bengali]) : [];
  if (ab.some((x) => bb.includes(x))) return true;
  return a.pos?.[0] === b.pos?.[0] && a.stage === b.stage;
}

/**
 * Commit one submission: meet seeding, main event, fuzzy near-miss split
 * (recall success + spelling lapse), spelling error profiling, and all
 * confusion signals. Shared by the session runner, labs, and drills —
 * one implementation, no divergence.
 */
export function commitSubmission(deps: CommitDeps, args: CommitArgs): void {
  const { item, word, sub, responseMs, confidence, hintsUsed, replays, sessionId, now } = args;
  const opts: ApplyOptions = { isRetry: item.isRetry ?? false, inSession: true };

  if (item.activity === 'meet') {
    deps.meetWord(item.wordId, 'meet', now);
    return;
  }

  const detail = { typed: sub.typed, chosenOption: sub.chosenOption, target: item.answer, aiVerified: sub.aiVerified, reflection: sub.reflection };

  if (sub.nearMiss && sub.typed) {
    deps.commitEvents([
      {
        sessionId, wordId: item.wordId, activity: item.activity, dimension: item.dimension,
        correct: true, responseMs, confidence, hintsUsed, audioReplays: replays, detail, timestamp: now,
      },
      {
        sessionId, wordId: item.wordId, activity: item.activity, dimension: 'spelling',
        correct: false, responseMs, hintsUsed, audioReplays: 0,
        detail: { typed: sub.typed, target: item.answer }, timestamp: now,
      },
    ], opts);
    deps.recordSpellingError(item.wordId, classifySpellingError(item.answer ?? word.word, sub.typed), now);
    const near = findNearMissWord(sub.typed, item.wordId, WORDS);
    const nearWord = near ? WORD_MAP[near] : undefined;
    if (near && nearWord) {
      deps.addConfusionSignal(item.wordId, near, 'near-miss', now, sharesBengaliOrPosStage(word, nearWord));
    }
  } else {
    deps.commitEvent(
      {
        sessionId, wordId: item.wordId, activity: item.activity, dimension: item.dimension,
        correct: sub.correct, responseMs, confidence, hintsUsed, audioReplays: replays, detail, timestamp: now,
      },
      opts,
    );
    if (!sub.correct && sub.typed && item.answer) {
      deps.recordSpellingError(item.wordId, classifySpellingError(item.answer, sub.typed), now);
      const near = findNearMissWord(sub.typed, item.wordId, WORDS);
      const nearWord = near ? WORD_MAP[near] : undefined;
      if (near && nearWord) {
        deps.addConfusionSignal(item.wordId, near, 'near-miss', now, sharesBengaliOrPosStage(word, nearWord));
      }
    }
  }

  if (item.activity === 'discrimination' && item.pairId) {
    // Drill outcomes resolve edges via streaks — no competing wrong-choice edge.
    deps.resolveConfusion(item.wordId, item.pairId, sub.correct, now);
  } else if (!sub.correct && sub.chosenWordId) {
    const chosen = WORD_MAP[sub.chosenWordId];
    if (chosen) {
      deps.addConfusionSignal(item.wordId, sub.chosenWordId, 'wrong-choice', now,
        sharesBengaliOrPosStage(word, chosen));
    }
  }
  if (!sub.correct && isHesitation(item.activity, responseMs)) {
    const other = sub.chosenWordId ?? (sub.typed ? findNearMissWord(sub.typed, item.wordId, WORDS) : null);
    const otherWord = other ? WORD_MAP[other] : undefined;
    if (other && otherWord) {
      deps.addConfusionSignal(item.wordId, other, 'hesitation', now, sharesBengaliOrPosStage(word, otherWord));
    }
  }
}

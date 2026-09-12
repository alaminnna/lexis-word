import type { Confidence, LearningEvent, SessionItem, WordRecord } from '../../../types/domain';

/** What an activity reports back on submit. Grading happens in the component. */
export interface Submission {
  correct: boolean;
  /** Near-miss typed recall: recall-correct + spelling lapse (§6 fuzzy rule). */
  nearMiss?: boolean;
  typed?: string;
  chosenOption?: string;
  /** Resolved word id when the learner picked a real (wrong) word option. */
  chosenWordId?: string | null;
  aiVerified?: boolean;
  /** Learner's own improvement note (Writing Studio self-review). */
  reflection?: string;
}

export interface ActivityProps {
  item: SessionItem;
  word: WordRecord;
  partnerWord?: WordRecord;
  phase: 'stimulus' | 'feedback';
  submission: Submission | null;
  confidence: Confidence | undefined;
  onConfidence: (c: Confidence | undefined) => void;
  onSubmit: (s: Submission) => void;
  /** Runner-owned counters (signals, never state-setters). */
  hintsUsed: number;
  noteHint: () => void;
  noteReplay: () => void;
  replays: number;
}

export type RunnerPhase = 'loading' | 'stimulus' | 'feedback' | 'complete';

export interface RunnerItem extends SessionItem {
  /** In-session retry or end-of-session recheck (schedules +1 day on success). */
  isRetry?: boolean;
}

/** Base event fields every submission commits (runner fills responseMs/ids). */
export function baseEventFields(
  item: RunnerItem,
  wordId: string,
  sessionId: string,
  timestamp: number,
): Pick<LearningEvent, 'sessionId' | 'wordId' | 'activity' | 'dimension' | 'timestamp' | 'hintsUsed' | 'audioReplays'> {
  return {
    sessionId,
    wordId,
    activity: item.activity,
    dimension: item.dimension,
    timestamp,
    hintsUsed: 0,
    audioReplays: 0,
  };
}

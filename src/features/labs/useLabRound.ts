import { useCallback, useRef, useState } from 'react';
import type { Confidence, SessionItem, WordRecord } from '../../types/domain';
import { uid } from '../../utils/id';
import { useProgress } from '../../store/progress';
import { commitSubmission } from '../session/commit';
import { answerFeedback } from '../../services/feedback';
import type { Submission } from '../session/activities/types';

/**
 * One free-practice round for labs: owns item/phase/counters, commits through
 * the shared commit path (same engine updates + confusion signals as sessions).
 */
export function useLabRound(kind: string) {
  const sessionId = useState(() => uid(`lab-${kind}`))[0];
  const [item, setItem] = useState<SessionItem | null>(null);
  const [word, setWord] = useState<WordRecord | null>(null);
  const [roundKey, setRoundKey] = useState(0);
  const [phase, setPhase] = useState<'stimulus' | 'feedback'>('stimulus');
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [confidence, setConfidence] = useState<Confidence | undefined>(undefined);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [replays, setReplays] = useState(0);
  const [t0, setT0] = useState(Date.now());
  const [tally, setTally] = useState({ correct: 0, total: 0 });
  /** Synchronous double-submit guard (same-race as the session runner). */
  const submittedRef = useRef(false);

  const store = useProgress.getState();

  const start = useCallback((nextItem: SessionItem, nextWord: WordRecord) => {
    submittedRef.current = false;
    setItem(nextItem);
    setWord(nextWord);
    setRoundKey((k) => k + 1);
    setPhase('stimulus');
    setSubmission(null);
    setConfidence(undefined);
    setHintsUsed(0);
    setReplays(0);
    setT0(Date.now());
  }, []);

  const submit = useCallback((sub: Submission) => {
    if (!item || !word || phase !== 'stimulus' || submittedRef.current) return;
    submittedRef.current = true;
    const now = Date.now();
    commitSubmission(
      {
        meetWord: store.meetWord, commitEvent: store.commitEvent, commitEvents: store.commitEvents,
        addConfusionSignal: store.addConfusionSignal, resolveConfusion: store.resolveConfusion,
        recordSpellingError: store.recordSpellingError,
      },
      {
        item, word, sub, responseMs: Math.max(1, now - t0), confidence,
        hintsUsed, replays, sessionId, now,
      },
    );
    setSubmission(sub);
    setTally((t) => ({ correct: t.correct + (sub.correct ? 1 : 0), total: t.total + 1 }));
    setPhase('feedback');
    answerFeedback(sub.correct);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item, word, phase, confidence, hintsUsed, replays, t0, sessionId]);

  const activityProps = item && word ? {
    item, word,
    phase, submission, confidence,
    onConfidence: setConfidence,
    onSubmit: submit,
    hintsUsed,
    noteHint: () => setHintsUsed((n) => n + 1),
    noteReplay: () => setReplays((n) => n + 1),
    replays,
  } : null;

  return {
    item, word, roundKey, phase, activityProps, tally, start,
    noteReplay: () => setReplays((n) => n + 1),
  };
}

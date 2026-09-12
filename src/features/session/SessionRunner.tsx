import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Confidence, SessionItem, SessionPlan } from '../../types/domain';
import { WORDS, WORD_MAP } from '../../data/words';
import { buildOptions, optionText } from '../../core/engine/distractors';
import { mulberry32 } from '../../utils/rng';
import { dayKey } from '../../utils/time';
import { uid } from '../../utils/id';
import { useProgress } from '../../store/progress';
import { useSessionPersist } from '../../store/session';
import { commitSubmission } from './commit';
import { answerFeedback, completeFeedback } from '../../services/feedback';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { ProgressBar } from '../../components/ui/ProgressBar';
import {
  McqActivity, TypedRecallActivity, SpellingBuildActivity, FlashTypeActivity,
  DictationActivity, ProductionActivity, MeetActivity, type ActivityProps, type Submission,
} from './activities/index';
import type { RunnerItem } from './activities/types';

export { type RunnerItem };

/** Easier-variant fallback per activity for lagged in-session retries (§7). */
function easierActivity(a: SessionItem['activity']): SessionItem['activity'] {
  switch (a) {
    case 'free-recall': return 'cued-recall';
    case 'cued-recall': return 'mcq-word-meaning';
    case 'sentence-production':
    case 'writing-task':
    case 'form-transform': return 'cued-recall';
    case 'context-cloze':
    case 'collocation-select': return 'mcq-word-meaning';
    case 'listen-spelling':
    case 'minimal-pair':
    case 'sentence-dictation': return 'listen-meaning';
    case 'flash-type': return 'spelling-build';
    default: return a;
  }
}

function buildRetryItem(original: RunnerItem, queueIndex: number, seed: number): RunnerItem {
  const word = WORD_MAP[original.wordId];
  const activity = easierActivity(original.activity);
  const rand = mulberry32((seed ^ (queueIndex * 2654435761)) >>> 0);
  const base: RunnerItem = {
    ...original,
    activity,
    isRetry: true,
    reason: {
      kind: 'in-session-retry',
      humanText: `Another look — ${word?.word ?? 'this word'} tripped you up a moment ago.`,
    },
  };
  if (!word) return base;
  if (activity === 'mcq-word-meaning' && original.activity !== 'mcq-word-meaning') {
    const options = buildOptions(word, { words: WORDS, byId: new Map(WORDS.map((w) => [w.id, w])) },
      { count: 4, confusionPartners: [], mode: 'meaning', rand });
    return { ...base, dimension: 'recognition', options, answer: optionText(word, 'meaning'), prompt: word.word };
  }
  if (activity === 'listen-meaning' && original.activity !== 'listen-meaning') {
    const options = buildOptions(word, { words: WORDS, byId: new Map(WORDS.map((w) => [w.id, w])) },
      { count: 4, confusionPartners: [], mode: 'meaning', rand });
    return { ...base, dimension: 'listening', options, answer: word.shortDefinition ?? word.word };
  }
  if (activity === 'cued-recall' && original.activity !== 'cued-recall') {
    return { ...base, dimension: 'recall', answer: word.word, prompt: word.shortDefinition ?? word.word };
  }
  return base;
}

function buildRecheck(wordId: string, seed: number, idx: number): RunnerItem {
  const word = WORD_MAP[wordId]!;
  const rand = mulberry32((seed ^ ((idx + 1) * 40503)) >>> 0);
  const options = buildOptions(word, { words: WORDS, byId: new Map(WORDS.map((w) => [w.id, w])) },
    { count: 4, confusionPartners: [], mode: 'meaning', rand });
  return {
    wordId, activity: 'mcq-word-meaning', dimension: 'recognition', difficulty: 1,
    options, answer: optionText(word, 'meaning'), prompt: word.word, isRetry: true,
    reason: { kind: 'in-session-retry', humanText: `Final check — closing the loop on ${word.word}.` },
  };
}

/** Map an MCQ option back to a word id for confusion-edge detection. */
function resolveOptionIds(item: SessionItem): (string | null)[] {
  if (!item.options) return [];
  const byWord = new Map(WORDS.map((w) => [w.word.toLowerCase(), w.id]));
  const byDef = new Map(WORDS.map((w) => [(w.shortDefinition ?? '').toLowerCase(), w.id]));
  const wordMode = item.activity === 'mcq-meaning-word' || item.activity === 'context-cloze' ||
    item.activity === 'minimal-pair' ||
    (item.activity === 'discrimination' && (item.dimension === 'context' || item.dimension === 'listening'));
  return item.options.map((o) => (wordMode ? byWord.get(o.toLowerCase()) : byDef.get(o.toLowerCase())) ?? null);
}

const CONFIDENCE: { v: Confidence; label: string }[] = [
  { v: 'sure', label: 'Sure' },
  { v: 'shaky', label: 'Shaky' },
  { v: 'unsure', label: 'Unsure' },
];

export function SessionRunner({ plan, startIndex = 0, replanned = false }: {
  plan: SessionPlan;
  startIndex?: number;
  replanned?: boolean;
}) {
  const sessionId = useMemo(() => uid('ses'), []);
  const [queue, setQueue] = useState<RunnerItem[]>(plan.items.map((i) => ({ ...i })));
  const [index, setIndex] = useState(Math.min(startIndex, Math.max(0, plan.items.length - 1)));
  const [phase, setPhase] = useState<'stimulus' | 'feedback'>('stimulus');
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [confidence, setConfidence] = useState<Confidence | undefined>(undefined);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [replays, setReplays] = useState(0);
  const [t0, setT0] = useState(() => Date.now());
  const [results, setResults] = useState<{ wordId: string; correct: boolean }[]>([]);
  const [failCounts, setFailCounts] = useState<Record<string, number>>({});
  const [rechecksAppended, setRechecksAppended] = useState(false);
  const [skipped, setSkipped] = useState(0);
  const [done, setDone] = useState(false);
  const [startedAt] = useState(() => Date.now());
  const [liveMsg, setLiveMsg] = useState('');
  const [endedEarly, setEndedEarly] = useState(false);
  const [remainingAtEnd, setRemainingAtEnd] = useState(0);
  const topRef = useRef<HTMLDivElement>(null);
  /** Synchronous double-submit guard (§22): flips in the same tick, unlike phase state. */
  const submittedRef = useRef(false);

  const meetWord = useProgress((s) => s.meetWord);
  const commitEvent = useProgress((s) => s.commitEvent);
  const commitEvents = useProgress((s) => s.commitEvents);
  const addConfusionSignal = useProgress((s) => s.addConfusionSignal);
  const resolveConfusion = useProgress((s) => s.resolveConfusion);
  const recordSpellingError = useProgress((s) => s.recordSpellingError);
  const addActiveMinutes = useProgress((s) => s.addActiveMinutes);
  const saveCursor = useSessionPersist((s) => s.save);
  const clearSaved = useSessionPersist((s) => s.clear);

  const item = queue[index];
  const word = item ? WORD_MAP[item.wordId] : undefined;

  // Persist cursor for resume (§20); scroll into view for mobile keyboards.
  useEffect(() => {
    if (!done && item) saveCursor(plan, index);
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- jsdom and older browsers lack scrollIntoView at runtime
    topRef.current?.scrollIntoView?.({ block: 'start' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, done]);

  // Enter advances from feedback (uniform keyboard flow).
  useEffect(() => {
    if (phase !== 'feedback') return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Enter') {
        e.preventDefault();
        acknowledge();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, index, queue]);

  const resetPerItem = useCallback(() => {
    submittedRef.current = false;
    setPhase('stimulus');
    setSubmission(null);
    setConfidence(undefined);
    setHintsUsed(0);
    setReplays(0);
    setT0(Date.now());
  }, []);

  const advance = useCallback((nextQueue: RunnerItem[], nextIndex: number, nextFails: Record<string, number>, appended: boolean) => {
    if (nextIndex < nextQueue.length) {
      setQueue(nextQueue);
      setIndex(nextIndex);
      setFailCounts(nextFails);
      setRechecksAppended(appended);
      resetPerItem();
      return;
    }
    // End of queue: append one recheck per missed word (delayed recall, §5).
    if (!appended) {
      const missed = Object.keys(nextFails);
      if (missed.length > 0) {
        const rechecks = missed.map((id, i) => buildRecheck(id, plan.seed, i));
        setQueue([...nextQueue, ...rechecks]);
        setIndex(nextQueue.length);
        setFailCounts(nextFails);
        setRechecksAppended(true);
        resetPerItem();
        return;
      }
    }
    setQueue(nextQueue);
    setDone(true);
    clearSaved();
  }, [clearSaved, plan.seed, resetPerItem]);

  const finish = useCallback((mins: number) => {
    addActiveMinutes(dayKey(Date.now()), mins);
    setEndedEarly(true);
    setRemainingAtEnd(Math.max(0, queue.length - index));
    setDone(true);
    clearSaved();
  }, [addActiveMinutes, clearSaved, queue.length, index]);

  const elapsedMin = (): number => Math.max(1, Math.round((Date.now() - startedAt) / 60000));

  const handleSubmit = (sub: Submission): void => {
    // Idempotent: exactly one event per item interaction, even on double
    // keypress/click racing the phase state update (§22).
    if (!item || !word || phase !== 'stimulus' || submittedRef.current) return;
    submittedRef.current = true;
    const now = Date.now();
    const responseMs = Math.max(1, now - t0);

    if (item.activity === 'meet') {
      meetWord(item.wordId, 'meet', now);
      setLiveMsg(`New word added: ${word.word}.`);
      advance(queue, index + 1, failCounts, rechecksAppended);
      return;
    }

    commitSubmission(
      { meetWord, commitEvent, commitEvents, addConfusionSignal, resolveConfusion, recordSpellingError },
      { item, word, sub, responseMs, confidence, hintsUsed, replays, sessionId, now },
    );
    answerFeedback(sub.correct);

    setSubmission(sub);
    setResults((r) => [...r, { wordId: item.wordId, correct: sub.correct }]);
    setLiveMsg(sub.correct
      ? 'Correct.'
      : item.answer ? `Not quite. The answer is ${item.answer}.` : 'Not quite.');

    if (!sub.correct) {
      // Lagged in-session retry 3–6 items later as an easier variant (§7).
      const fails = (failCounts[item.wordId] ?? 0) + 1;
      const nextFails = { ...failCounts, [item.wordId]: fails };
      if (fails === 1) {
        const retry = buildRetryItem(item, queue.length, plan.seed);
        const at = Math.min(queue.length, index + 3 + ((queue.length + fails) % 4));
        const nextQueue = [...queue];
        nextQueue.splice(at, 0, retry);
        setPhase('feedback');
        // stash the extended queue for acknowledge to continue with
        setQueue(nextQueue);
        setFailCounts(nextFails);
        return;
      }
      setFailCounts(nextFails);
    }
    setPhase('feedback');
  };

  const acknowledge = (): void => {
    if (!item || phase !== 'feedback') return;
    advance(queue, index + 1, failCounts, rechecksAppended);
  };

  const skip = (): void => {
    if (!item || phase !== 'stimulus') return;
    setSkipped((n) => n + 1);
    advance(queue, index + 1, failCounts, rechecksAppended);
  };

  if (done) return <SessionSummary plan={plan} results={results} skipped={skipped} minutes={elapsedMin()} replanned={replanned} endedEarly={endedEarly} remaining={remainingAtEnd} />;
  if (!item || !word) return <SessionSummary plan={plan} results={results} skipped={skipped} minutes={elapsedMin()} replanned={replanned} endedEarly={endedEarly} remaining={remainingAtEnd} />;

  const needsConfidence = item.activity === 'free-recall' ||
    item.activity === 'sentence-production' || item.activity === 'writing-task';

  const activityProps: ActivityProps = {
    item, word,
    partnerWord: item.pairId ? WORD_MAP[item.pairId] : undefined,
    phase,
    submission,
    confidence,
    onConfidence: setConfidence,
    onSubmit: handleSubmit,
    hintsUsed,
    noteHint: () => setHintsUsed((n) => n + 1),
    noteReplay: () => setReplays((n) => n + 1),
    replays,
  };

  return (
    <div ref={topRef} className="mx-auto w-full max-w-2xl scroll-mt-4">
      <div aria-live="polite" className="sr-only">{liveMsg}</div>
      {/* Slim progress + exit + saved reassurance (§16). Exit is 2-tap armed:
          no modals over learning content, but no accidental early exits either. */}
      <div className="mb-5 flex items-center gap-3">
        <div className="flex-1">
          <ProgressBar value={index} max={Math.max(1, queue.length)} label={`Item ${Math.min(index + 1, queue.length)} of ${queue.length}`} />
        </div>
        <ExitButton onEnd={() => finish(elapsedMin())} />
      </div>
      {replanned && (
        <p className="mb-3 text-sm text-ink-faint">Listening items skipped — no voice on this device. Progress is saved as you go.</p>
      )}

      <p className="mb-4 flex items-start gap-1.5 text-sm text-ink-faint">
        <Icon name="info" size={15} className="mt-0.5 shrink-0" />
        <span>{item.reason.humanText}</span>
      </p>

      {renderActivity(activityProps)}

      {phase === 'stimulus' && needsConfidence && (
        <div className="mt-4 flex items-center gap-2" role="group" aria-label="How sure are you? (optional)">
          <span className="text-sm text-ink-faint">Confidence:</span>
          {CONFIDENCE.map((c) => (
            <button
              key={c.v}
              onClick={() => setConfidence(confidence === c.v ? undefined : c.v)}
              aria-pressed={confidence === c.v}
              className={`min-h-[36px] cursor-pointer rounded-full border px-3 text-sm transition-calm ${
                confidence === c.v ? 'border-accent bg-accent-soft font-medium text-accent-deep dark:text-accent' : 'border-line text-ink-soft'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}

      <div className="mt-5 flex items-center gap-3">
        {phase === 'feedback' && (
          <Button onClick={acknowledge} autoFocus>
            Continue <Icon name="arrow-right" size={16} />
          </Button>
        )}
        {phase === 'stimulus' && item.activity !== 'meet' && (
          <button onClick={skip} className="cursor-pointer text-sm text-ink-faint hover:text-ink">
            Skip this one
          </button>
        )}
      </div>
    </div>
  );
}

function ExitButton({ onEnd }: { onEnd: () => void }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      onClick={() => (armed ? onEnd() : setArmed(true))}
      aria-label={armed ? 'Tap again to end the session' : 'End session (tap twice)'}
      className={`inline-flex min-h-[44px] cursor-pointer items-center rounded-lg px-3 text-sm transition-calm ${
        armed ? 'bg-bad-soft font-medium text-bad' : 'text-ink-faint hover:text-ink'
      }`}
    >
      {armed ? 'Tap again to end' : 'End session'}
    </button>
  );
}

function renderActivity(props: ActivityProps) {
  const { item } = props;
  if (item.activity === 'meet') return <MeetActivity {...props} />;
  if (item.options && item.options.length > 0) {
    const listening = item.activity === 'listen-meaning' || item.activity === 'listen-spelling' ||
      item.activity === 'minimal-pair' || (item.activity === 'discrimination' && item.dimension === 'listening');
    return (
      <McqActivity
        {...props}
        optionWordIds={resolveOptionIds(item)}
        speakText={listening ? item.answer : undefined}
        autoPlay={listening}
      />
    );
  }
  switch (item.activity) {
    case 'cued-recall': return <TypedRecallActivity {...props} cue />;
    case 'free-recall':
    case 'form-transform':
    case 'discrimination': return <TypedRecallActivity {...props} />;
    case 'spelling-build': return <SpellingBuildActivity {...props} />;
    case 'flash-type': return <FlashTypeActivity {...props} />;
    case 'sentence-dictation': return <DictationActivity {...props} />;
    case 'sentence-production':
    case 'writing-task': return <ProductionActivity {...props} />;
    default: return <TypedRecallActivity {...props} />;
  }
}

function SessionSummary({ plan, results, skipped, minutes, replanned, endedEarly, remaining }: {
  plan: SessionPlan;
  results: { wordId: string; correct: boolean }[];
  skipped: number;
  minutes: number;
  replanned: boolean;
  endedEarly: boolean;
  remaining: number;
}) {
  const answered = results.length;
  const correct = results.filter((r) => r.correct).length;
  const strengthened = new Set(results.filter((r) => r.correct).map((r) => r.wordId)).size;
  const missedWords = [...new Set(results.filter((r) => !r.correct).map((r) => r.wordId))];
  const accuracy = answered === 0 ? 0 : Math.round((correct / answered) * 100);

  // Session-complete flourish, once (StrictMode-safe ref guard).
  const flourishRef = useRef(false);
  useEffect(() => {
    if (!flourishRef.current) {
      flourishRef.current = true;
      completeFeedback();
    }
  }, []);

  // Checkpoint record (UI-level): pass ≥85% seals the stage with its milestone.
  useEffect(() => {
    if (plan.meta?.kind === 'checkpoint' && answered > 0) {
      try {
        localStorage.setItem(`lexis:checkpoint:${plan.meta.stage}`, JSON.stringify({ accuracy, at: Date.now(), pass: accuracy >= 85 }));
      } catch {
        // UI-level record only; safe to skip.
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tomorrow's projected load: words with any dimension due within 24h.
  const words = useProgress((s) => s.words);
  const tomorrowLoad = useMemo(() => {
    const horizon = Date.now() + 86_400_000;
    let n = 0;
    for (const id of Object.keys(words)) {
      const p = words[id]!;
      if (p.introducedAt === 0) continue;
      const dims = Object.values(p.dimensions);
      if (dims.some((d) => d.attempts > 0 && d.nextDueAt <= horizon)) n++;
    }
    return n;
  }, [words]);

  return (
    <div className="mx-auto w-full max-w-2xl">
      <h1 className="font-display text-3xl font-medium tracking-tight">
        {endedEarly ? 'Session ended' : 'Session complete'}
      </h1>
      {answered === 0 ? (
        <p className="mt-2 text-lg text-ink-soft">
          You finished before answering anything — nothing was recorded and nothing was lost.
          {remaining > 0 && <> {remaining} item{remaining === 1 ? '' : 's'} were still waiting.</>}
          {' '}Ready when you are.
        </p>
      ) : (
        <>
          <p className="mt-1 text-ink-soft">
            {answered} answered · {accuracy}% correct · {minutes} min{skipped > 0 ? ` · ${skipped} skipped` : ''}
            {replanned ? ' · listening adapted (no voice)' : ''}
          </p>
          <div className="mt-6 grid grid-cols-3 gap-3 text-center">
            <div className="rounded-xl border border-line p-4">
              <p className="font-display text-3xl">{accuracy}%</p>
              <p className="text-sm text-ink-soft">accuracy</p>
            </div>
            <div className="rounded-xl border border-line p-4">
              <p className="font-display text-3xl">{strengthened}</p>
              <p className="text-sm text-ink-soft">words strengthened</p>
            </div>
            <div className="rounded-xl border border-line p-4">
              <p className="font-display text-3xl">{tomorrowLoad}</p>
              <p className="text-sm text-ink-soft">words due tomorrow</p>
            </div>
          </div>
        </>
      )}
      {missedWords.length > 0 && (
        <div className="mt-6 rounded-xl border border-line p-4">
          <p className="font-medium">To see again tomorrow</p>
          <p className="mt-1 text-ink-soft">
            {missedWords.map((id) => WORD_MAP[id]?.word ?? id).join(' · ')}
          </p>
          <p className="mt-1 text-sm text-ink-faint">Memory fades; spaced returns will fix these.</p>
        </div>
      )}
      {missedWords.length === 0 && answered > 0 && (
        <p className="mt-6 text-lg">Clean run — everything you touched moved forward.</p>
      )}
      <div className="mt-6 flex gap-2">
        <Link to="/" className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-accent px-5 py-2.5 font-medium text-paper">
          Back to Today <Icon name="arrow-right" size={16} />
        </Link>
        <Link to="/roadmap" className="inline-flex min-h-[44px] items-center rounded-lg border border-line-strong px-5 py-2.5">
          View roadmap
        </Link>
      </div>
    </div>
  );
}

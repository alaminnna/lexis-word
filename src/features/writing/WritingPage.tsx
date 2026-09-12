import { useEffect, useMemo, useRef, useState } from 'react';
import type { DictionaryEntry, SessionItem, WordRecord } from '../../types/domain';
import { WORDS } from '../../data/words';
import { progressSnapshot, useProgress } from '../../store/progress';
import { uid } from '../../utils/id';
import { containsWordOrForm } from '../../utils/text';
import { dictionary } from '../../services/dictionary';
import { commitSubmission } from '../session/commit';
import { answerFeedback } from '../../services/feedback';
import {
  AllKeysRejectedError, MultiApiProvider, resolveApiPool,
  DEFAULT_FREE_MODEL, loadProviderConfig, resolveAIProvider,
  saveProviderConfig,
  type AIProviderConfig, type AISource, type RubricScores, type WritingFeedback,
} from '../../services/writing-feedback';
import { Icon } from '../../components/ui/Icon';
import { StudioLanding } from './components/StudioLanding';
import { WordTargetPanel } from './components/WordTargetPanel';
import { TaskSelector } from './components/TaskSelector';
import { WritingEditor } from './components/WritingEditor';
import { FrameResult, FrameTask } from './components/FrameTask';
import { CompareEvaluatePanel, RUBRIC } from './components/CompareEvaluatePanel';
import { AIReviewPanel, type AIAvailability } from './components/AIReviewPanel';
import { CompletionPanel } from './components/CompletionPanel';
import {
  recommendedWritingTargets, recentWriting,
  type WritingTarget, type WritingTaskKind,
} from './writingSelectors';

type Phase = 'landing' | 'write' | 'review' | 'done';

function weakestProduction(): WordRecord[] {
  const { words } = progressSnapshot();
  const introduced = WORDS.filter((w) => words[w.id]?.introducedAt);
  if (introduced.length === 0) return [];
  return [...introduced].sort((a, b) =>
    (words[a.id]?.dimensions.production.strength ?? 0) - (words[b.id]?.dimensions.production.strength ?? 0),
  );
}

function displayModelFor(cfg: AIProviderConfig): string {
  if (cfg.kind === 'custom') return 'custom endpoint';
  return resolveApiPool(cfg)[0]?.entry.model.trim() || DEFAULT_FREE_MODEL;
}

/**
 * Writing Studio orchestrator (§13, redesigned): landing → write → review →
 * done. One core writing event per attempt (self 0.90; AI-verified at save
 * 1.10); the post-save AI panel is display-only and never re-commits.
 */
export default function WritingPage() {
  const sessionId = useMemo(() => uid('wstudio'), []);
  const words = useProgress((s) => s.words);
  const events = useProgress((s) => s.events);
  const store = useProgress.getState();

  const [phase, setPhase] = useState<Phase>('landing');
  const [word, setWord] = useState<WordRecord | null>(null);
  const [task, setTask] = useState<WritingTaskKind>('free');
  const [text, setText] = useState('');
  const [round, setRound] = useState(0);
  const [frameIdx, setFrameIdx] = useState(0);
  const [framePicks, setFramePicks] = useState<string[]>([]);
  const [frameDone, setFrameDone] = useState<{ correct: boolean; target: string } | null>(null);
  const [entry, setEntry] = useState<DictionaryEntry | null | undefined>(undefined);
  const [rubric, setRubric] = useState<RubricScores>({ form: false, collocation: false, register: false, meaning: false });
  const [reflection, setReflection] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedCorrect, setSavedCorrect] = useState<boolean | null>(null);
  const [aiResult, setAiResult] = useState<WritingFeedback | null>(null);
  const [aiFailedMsg, setAiFailedMsg] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [gradeSource, setGradeSource] = useState<{ source: AISource; model: string; apiName: string | null } | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  const targets = useMemo(() => recommendedWritingTargets(words, events, Date.now(), 3), [words, events]);
  const recent = useMemo(() => recentWriting(events, 5), [events]);
  const hasWords = useMemo(() => Object.values(words).some((w) => w.introducedAt > 0), [words]);

  useEffect(() => {
    if (!word) return;
    setEntry(undefined);
    let cancelled = false;
    void dictionary.lookup(word.word).then((r) => {
      if (!cancelled) setEntry(r.entry);
    });
    return () => {
      cancelled = true;
    };
  }, [word]);

  useEffect(() => {
    if (phase === 'done') {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- jsdom/older browsers lack scrollIntoView at runtime
      resultRef.current?.scrollIntoView?.({ block: 'start' });
    }
  }, [phase]);

  const startPractice = (w: WordRecord, t: WritingTaskKind): void => {
    setWord(w);
    setTask(t);
    setText('');
    setFrameIdx(Math.floor(Math.random() * FRAMES_LEN));
    setFramePicks([]);
    setFrameDone(null);
    setRubric({ form: false, collocation: false, register: false, meaning: false });
    setReflection('');
    setSavedCorrect(null);
    setAiResult(null);
    setAiFailedMsg(null);
    setGradeSource(null);
    setRound((r) => r + 1);
    setPhase('write');
  };

  const backToStudio = (): void => {
    setPhase('landing');
  };

  const commitProduction = (
    correct: boolean, activity: SessionItem['activity'], dimension: SessionItem['dimension'],
    detailText: string, aiVerified = false, reflectionText = '',
  ): void => {
    if (!word) return;
    commitSubmission(
      { meetWord: store.meetWord, commitEvent: store.commitEvent, commitEvents: store.commitEvents, addConfusionSignal: store.addConfusionSignal, resolveConfusion: store.resolveConfusion, recordSpellingError: store.recordSpellingError },
      {
        item: {
          wordId: word.id, activity, dimension, difficulty: 3,
          reason: { kind: 'weak-dimension', humanText: 'Writing Studio practice.' },
        },
        word,
        sub: {
          correct, typed: detailText, aiVerified,
          reflection: reflectionText.trim() ? reflectionText.trim().slice(0, 500) : undefined,
        },
        responseMs: 60_000, hintsUsed: 0, replays: 0, sessionId, now: Date.now(),
      },
    );
  };

  const submitFrame = (correct: boolean, target: string, detail: string): void => {
    commitProduction(correct, 'collocation-select', 'collocation', detail);
    answerFeedback(correct);
    setFrameDone({ correct, target });
  };

  const nextFrameWord = (): void => {
    if (!word) return;
    const pool = weakestProduction().filter((w) => w.id !== word.id);
    if (pool.length > 0) startPractice(pool[0]!, 'frame');
    else backToStudio();
  };

  const saveReview = async (): Promise<void> => {
    if (!word || saving) return;
    // Defense-in-depth: the editor locks Submit until the word is present.
    if (!containsWordOrForm(text, word.word, word.forms ?? [])) return;
    const allChecked = RUBRIC.every((r) => rubric[r.k]);
    const cfg = loadProviderConfig();
    const resolved = resolveAIProvider(cfg);
    const displayModel = displayModelFor(cfg);
    setGradeSource({ source: resolved.source, model: displayModel, apiName: null });
    setAiResult(null);
    setAiFailedMsg(null);
    if (resolved.source === 'none') {
      console.info('[Lexis AI] no API configured — self-review counted.');
      commitProduction(allChecked, 'writing-task', 'writing', text, false, reflection);
      answerFeedback(allChecked);
      setSavedCorrect(allChecked);
      setPhase('done');
      return;
    }
    setSaving(true);
    console.info(`[Lexis AI] grading "${word.word}" via ${resolved.source} · ${displayModel} — watch Network for the chat/completions request.`);
    try {
      const fb = await resolved.provider.grade(word.word, text);
      console.info('[Lexis AI] graded OK.');
      setAiResult(fb);
      const used = resolved.provider instanceof MultiApiProvider ? (resolved.provider.lastUsed?.apiName ?? null) : null;
      setGradeSource({ source: resolved.source, model: displayModel, apiName: used });
      const ok = fb.scores.form && fb.scores.collocation && fb.scores.register && fb.scores.meaning;
      commitProduction(ok, 'writing-task', 'writing', text, fb.aiVerified, reflection);
      answerFeedback(ok);
      setSavedCorrect(ok);
    } catch (err) {
      console.warn('[Lexis AI] grade failed:', err instanceof Error ? err.message : err);
      if (err instanceof AllKeysRejectedError) {
        const bad = new Set(err.apiIds);
        const current = loadProviderConfig();
        saveProviderConfig({
          ...current,
          apis: current.apis.map((a) => (bad.has(a.id) ? { ...a, invalid: true } : a)),
        });
        setAiFailedMsg(`Keys rejected on ${err.apiNames.join(', ') || 'the APIs'} — update them in Settings → AI Feedback. This review counts self-review.`);
      } else {
        const reason = err instanceof Error ? err.message : 'unknown error';
        setAiFailedMsg(`AI grading failed (${reason}) — your self-review below still counts fully.`);
      }
      commitProduction(allChecked, 'writing-task', 'writing', text, false, reflection);
      answerFeedback(allChecked);
      setSavedCorrect(allChecked);
    } finally {
      setSaving(false);
      setPhase('done');
    }
  };

  /** Display-only AI fetch after a self-only save. Never commits. */
  const fetchAiDisplay = async (): Promise<void> => {
    if (!word || aiBusy) return;
    const cfg = loadProviderConfig();
    const resolved = resolveAIProvider(cfg);
    if (resolved.source === 'none') return;
    setAiBusy(true);
    setAiFailedMsg(null);
    try {
      const fb = await resolved.provider.grade(word.word, text);
      setAiResult(fb);
      const used = resolved.provider instanceof MultiApiProvider ? (resolved.provider.lastUsed?.apiName ?? null) : null;
      setGradeSource({ source: resolved.source, model: displayModelFor(cfg), apiName: used });
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'unknown error';
      setAiFailedMsg(`AI request failed (${reason}). Your saved review stands.`);
    } finally {
      setAiBusy(false);
    }
  };

  const aiAvailability = (): AIAvailability => {
    const cfg = loadProviderConfig();
    const r = resolveAIProvider(cfg);
    if (!cfg.enabled || r.source === 'none') return { state: 'off' };
    if (aiFailedMsg) return { state: 'failed', message: aiFailedMsg };
    return { state: 'ready', source: r.source, model: displayModelFor(cfg) };
  };

  if (phase === 'landing' || !word) {
    return (
      <StudioLanding
        targets={targets}
        recent={recent}
        hasWords={hasWords}
        onPractice={(t: WritingTarget) => startPractice(t.word, t.task)}
        onMode={(t) => {
          const pool = weakestProduction();
          if (pool[0]) startPractice(pool[0], t);
        }}
      />
    );
  }

  const recallStrength = words[word.id]?.dimensions.recall.strength ?? 0;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <header>
        <button
          onClick={backToStudio}
          className="inline-flex min-h-[44px] cursor-pointer items-center gap-1 text-sm text-ink-soft transition-calm hover:text-ink"
        >
          <Icon name="chevron-left" size={16} /> Writing Studio <span className="text-ink-faint">/ Vocabulary Production</span>
        </button>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h1 className="font-display text-3xl font-medium tracking-tight">Use the word in writing.</h1>
            <p className="mt-1 text-ink-soft">Move from recognizing a word to using it naturally in an academic sentence.</p>
          </div>
          <AiStatusPill availability={aiAvailability()} />
        </div>
        <ol className="mt-3 flex items-center gap-2 text-sm" aria-label="Writing progress">
          {(['Write', 'Review', 'Saved'] as const).map((label, i) => {
            const order = phase === 'write' ? 0 : phase === 'review' ? 1 : 2;
            const done = i < order;
            const current = i === order;
            return (
              <li key={label} className="flex items-center gap-2" aria-current={current ? 'step' : undefined}>
                {i > 0 && <span aria-hidden className="h-px w-6 bg-line-strong" />}
                <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${done ? 'bg-accent text-paper' : current ? 'border-2 border-accent text-accent-deep dark:text-accent' : 'border border-line-strong text-ink-faint'}`}>
                  {done ? '✓' : i + 1}
                </span>
                <span className={current ? 'font-medium' : 'text-ink-soft'}>{label}</span>
              </li>
            );
          })}
        </ol>
      </header>

      <WordTargetPanel word={word} recallStrength={recallStrength} />

      {phase === 'write' && (
        <>
          <TaskSelector value={task} onChange={(t) => startPractice(word, t)} />
          <div className="grid grid-cols-1 gap-6 md:grid-cols-5">
            <div className="md:col-span-3">
              {task === 'frame' ? (
                frameDone ? (
                  <FrameResult
                    correct={frameDone.correct}
                    target={frameDone.target}
                    onNext={nextFrameWord}
                  />
                ) : (
                  <FrameTask
                    word={word}
                    frameIdx={frameIdx}
                    picks={framePicks}
                    onPicks={setFramePicks}
                    onCheck={(correct, target, detail) => submitFrame(correct, target, detail)}
                  />
                )
              ) : (
                <WritingEditor
                  key={`${word.id}:${task}:${round}`}
                  wordId={word.id}
                  task={task}
                  autoFocusKey={`${word.id}:${task}:${round}`}
                  requireWord={{ word: word.word, forms: word.forms ?? [] }}
                  onEscape={backToStudio}
                  onSubmit={(t) => {
                    setText(t);
                    setPhase('review');
                  }}
                  prompt={task === 'transform' ? (
                    <>Rewrite in academic register using “{word.word}”:
                      <span className="mt-1 block rounded-lg bg-paper-deep p-3 text-lg italic">“Things got much worse because of the weather.”</span>
                    </>
                  ) : (
                    <>Write 1–2 original academic sentences using “{word.word}”.
                      <span className="mt-1 block text-[15px] text-ink-soft">Write a sentence that could naturally appear in an IELTS Task 2 essay.</span>
                    </>
                  )}
                  hint="Focus on natural usage, not complexity"
                  placeholder={task === 'transform' ? `Rewrite using “${word.word}”…` : 'Use the target word naturally in an academic sentence.'}
                />
              )}
            </div>
            <aside className="md:col-span-2" aria-label="Writing guidance">
              <div className="rounded-xl border border-line p-4">
                <p className="font-medium">What makes a good answer?</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-[15px] text-ink-soft">
                  <li>Uses “{word.word}” where it sounds natural</li>
                  <li>Could sit in a Task 2 essay</li>
                  <li>Says one clear thing</li>
                </ul>
                {word.forms && word.forms.length > 0 && (
                  <p className="mt-3 text-sm text-ink-soft">
                    <span className="text-ink-faint">Family: </span>{word.forms.join(' · ')}
                  </p>
                )}
                <p className="mt-3 text-sm text-ink-faint">
                  {task === 'frame' && 'Pick the partner that sounds most natural — hear the sentence in your head.'}
                  {task === 'transform' && 'Keep the meaning. Reach for academic verbs and noun phrases.'}
                  {task === 'free' && 'One clear idea first; polish second.'}
                </p>
              </div>
            </aside>
          </div>
        </>
      )}

      {phase === 'review' && (
        <CompareEvaluatePanel
          word={word}
          text={text}
          entry={entry}
          rubric={rubric}
          onRubric={setRubric}
          reflection={reflection}
          onReflection={setReflection}
          onSave={() => void saveReview()}
          saving={saving}
          graderLine={<SaveGraderLine />}
        />
      )}

      {phase === 'done' && (
        <div ref={resultRef}>
          <CompletionPanel
            word={word}
            correct={savedCorrect ?? false}
            takeaway={takeaway()}
            onRetry={() => startPractice(word, task)}
            onStudio={backToStudio}
          />
          <div className="mt-4">
            <AIReviewPanel
              availability={aiAvailability()}
              requested={aiResult !== null}
              busy={aiBusy}
              result={aiResult}
              gradedBy={gradeSource && gradeSource.source !== 'none'
                ? `${gradeSource.source === 'user' ? 'your keys' : 'system keys'}${gradeSource.apiName ? ` · ${gradeSource.apiName}` : ''} · ${gradeSource.model}`
                : null}
              onRequest={() => void fetchAiDisplay()}
            />
          </div>
        </div>
      )}
    </div>
  );

  function takeaway(): string | null {
    if (reflection.trim()) return reflection.trim().slice(0, 200);
    const firstMissed = (['form', 'collocation', 'register', 'meaning'] as const).find((k) => !rubric[k]);
    if (!firstMissed) return null;
    const lines: Record<string, string> = {
      form: 'Double-check the word form next time.',
      collocation: 'Listen for the word’s natural partners.',
      register: 'Aim for essay tone, not chat tone.',
      meaning: 'Re-read for the exact meaning.',
    };
    return lines[firstMissed]!;
  }

  function SaveGraderLine(): React.ReactElement {
    const cfg = loadProviderConfig();
    const r = resolveAIProvider(cfg);
    return (
      <p className="mt-1 text-sm text-ink-soft">
        Grading with: {r.source === 'none' ? 'self-review' : 'self-review + AI on save'} ·{' '}
        <span className="text-ink-faint">one writing event, never doubled.</span>
      </p>
    );
  }

  function AiStatusPill({ availability }: { availability: AIAvailability }): React.ReactElement {
    const label = availability.state === 'ready'
      ? `AI available · ${availability.model}`
      : availability.state === 'failed' ? 'AI failed' : 'AI off';
    return (
      <p className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${availability.state === 'ready' ? 'bg-good-soft text-good' : 'bg-paper-deep text-ink-soft'}`} aria-live="polite">
        {label}
      </p>
    );
  }
}

const FRAMES_LEN = 3;

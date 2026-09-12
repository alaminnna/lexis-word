import { useEffect, useRef, useState } from 'react';
import { useSpeak } from '../../../components/ui/WordHero';
import { useSettings } from '../../../store/settings';
import { gradeTyped } from '../../../core/engine/grading';
import { containsWordOrForm } from '../../../utils/text';
import { Icon } from '../../../components/ui/Icon';
import { TypedFeedback, INPUT_HYGIENE } from './TypedRecallActivity';
import type { ActivityProps } from './types';

/**
 * Sentence dictation (§10): hear the authentic sentence at 0.75×/0.9×/1.0×,
 * type the target word. Replays are logged (weak-listening signal).
 */
export function DictationActivity({ item, word, phase, onSubmit, noteReplay, wordOnly = false }: ActivityProps & {
  /** Spelling-lab step 5: hear the word itself (no sentence shown). */
  wordOnly?: boolean;
}) {
  const answer = item.answer ?? word.word;
  const sentence = wordOnly ? answer : (item.prompt ?? word.sentence);
  const rate = useSettings((s) => s.speechRate);
  const update = useSettings((s) => s.update);
  const { speak, speaking } = useSpeak();
  const [value, setValue] = useState('');
  const [played, setPlayed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setPlayed(true);
    void speak(sentence);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item]);

  useEffect(() => {
    if (!played) return;
    inputRef.current?.focus();
  }, [played]);

  useEffect(() => {
    if (phase !== 'stimulus') return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Enter' && value.trim()) submit();
      else if (e.key === ' ') {
        e.preventDefault();
        void replay();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, value, sentence]);

  const replay = async (): Promise<void> => {
    noteReplay();
    await speak(sentence);
    inputRef.current?.focus();
  };

  const submit = (): void => {
    if (phase !== 'stimulus' || !value.trim()) return;
    const grade = gradeTyped(answer, value);
    onSubmit({ correct: grade.outcome !== 'wrong', nearMiss: grade.outcome === 'near-miss', typed: value });
  };

  return (
    <div>
      <p className="mb-3 text-xl">{wordOnly ? 'Listen to the word, then type it.' : 'Listen to the sentence, then type the missing word.'}</p>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          onClick={() => void replay()}
          aria-label={speaking ? 'Playing sentence' : 'Replay sentence (Space)'}
          className="inline-flex min-h-[52px] cursor-pointer items-center gap-2 rounded-xl border border-line-strong px-5 py-2.5 text-lg transition-calm hover:border-accent hover:text-accent-deep dark:hover:text-accent"
        >
          <Icon name="speaker" size={22} /> {speaking ? 'Playing…' : 'Replay'}
        </button>
        <div role="group" aria-label="Playback speed" className="flex gap-1">
          {([0.75, 0.9, 1] as const).map((r) => (
            <button
              key={r}
              onClick={() => update({ speechRate: r })}
              aria-pressed={rate === r}
              className={`min-h-[44px] cursor-pointer rounded-lg px-3 text-sm transition-calm ${
                rate === r ? 'bg-accent-soft font-medium text-accent-deep dark:text-accent' : 'text-ink-faint hover:text-ink'
              }`}
            >
              {r}×
            </button>
          ))}
        </div>
      </div>
      <label htmlFor="dictation-answer" className="sr-only">Type the word you hear</label>
      <input
        id="dictation-answer"
        ref={inputRef}
        value={value}
        disabled={phase !== 'stimulus'}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Type the word you hear…"
        className="min-h-[52px] w-full rounded-xl border-2 border-line bg-paper px-4 py-3 font-display text-2xl transition-calm placeholder:text-ink-faint focus:border-accent focus:outline-none disabled:opacity-70"
        {...INPUT_HYGIENE}
      />
      <button
        onClick={submit}
        disabled={phase !== 'stimulus' || !value.trim()}
        className="mt-3 inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg bg-accent px-5 py-2.5 font-medium text-paper transition-calm hover:brightness-110 disabled:cursor-not-allowed disabled:bg-line disabled:text-ink-faint"
      >
        Check
      </button>
      {phase === 'feedback' && (
        <div className="mt-3 space-y-2">
          <TypedFeedback answer={answer} typed={value} />
          {!wordOnly && <p className="border-l-2 border-accent pl-3 text-ink-soft">The sentence: “{sentence}”</p>}
        </div>
      )}
    </div>
  );
}

/**
 * Sentence production / writing-task: free Academic sentence(s) with the word.
 * Graded by usage (word or a form present); the Writing Studio adds the rubric.
 */
export function ProductionActivity({ item, word, phase, onSubmit }: ActivityProps) {
  const [value, setValue] = useState('');
  const words = value.trim().split(/\s+/).filter(Boolean).length;

  useEffect(() => {
    if (phase !== 'stimulus') return;
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && words >= 3) submit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, value]);

  const submit = (): void => {
    if (phase !== 'stimulus' || words < 3) return;
    onSubmit({ correct: containsWordOrForm(value, word.word, word.forms ?? []), typed: value });
  };

  return (
    <div>
      <p className="mb-3 text-xl leading-relaxed">{item.prompt ?? `Write an original academic sentence using “${word.word}”.`}</p>
      <label htmlFor="production-answer" className="sr-only">Your sentence</label>
      <textarea
        id="production-answer"
        value={value}
        disabled={phase !== 'stimulus'}
        onChange={(e) => setValue(e.target.value)}
        rows={3}
        autoFocus
        placeholder="Write here…"
        aria-describedby="production-hint"
        className="min-h-[96px] w-full rounded-xl border-2 border-line bg-paper px-4 py-3 text-lg leading-relaxed transition-calm placeholder:text-ink-faint focus:border-accent focus:outline-none disabled:opacity-70"
        {...INPUT_HYGIENE}
      />
      <p id="production-hint" className="mt-1 text-sm text-ink-faint">
        Aim for a sentence you could put in a Task 2 essay. {words} word{words === 1 ? '' : 's'} so far.
      </p>
      <button
        onClick={submit}
        disabled={phase !== 'stimulus' || words < 3}
        className="mt-3 inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg bg-accent px-5 py-2.5 font-medium text-paper transition-calm hover:brightness-110 disabled:cursor-not-allowed disabled:bg-line disabled:text-ink-faint"
      >
        Submit
      </button>
      {phase === 'feedback' && (
        <p className="mt-3 text-lg">
          {containsWordOrForm(value, word.word, word.forms ?? []) ? (
            <span className="text-good">Good — you used “{word.word}” in your own sentence. The Writing Studio will sharpen this further.</span>
          ) : (
            <span>Not yet — your sentence doesn&apos;t include “{word.word}”. Try weaving it in.</span>
          )}
        </p>
      )}
    </div>
  );
}

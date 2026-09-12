import { useEffect, useRef, useState } from 'react';
import { gradeTyped } from '../../../core/engine/grading';
import { Icon } from '../../../components/ui/Icon';
import type { ActivityProps } from './types';

export const INPUT_HYGIENE = {
  autoCorrect: 'off',
  autoCapitalize: 'off',
  spellCheck: false,
  autoComplete: 'off',
} as const;

/**
 * Typed recall: cued-recall (definition + first-letter cue + length),
 * free-recall (definition only), form-transform and discrimination-spell
 * (custom prompt, same fuzzy grading). Fuzzy-graded per §6.
 */
export function TypedRecallActivity({ item, word, phase, onSubmit, noteHint, hintsUsed, cue = false, cueLetters = 1 }: ActivityProps & {
  cue?: boolean;
  /** Spelling-lab step 3 uses two starter letters. */
  cueLetters?: number;
}) {
  const answer = item.answer ?? word.word;
  const prompt = item.prompt ?? word.shortDefinition ?? word.word;
  const [value, setValue] = useState('');
  const [revealed, setRevealed] = useState(0); // extra letters beyond the cue
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, [item]);

  useEffect(() => {
    if (phase !== 'stimulus') return;
    const onKey = (e: KeyboardEvent): void => {
      // Native input Enter already submits via form semantics; this global
      // handler is for keyboard-first operation outside fields. Skip when the
      // event comes from any editable field to avoid double-submit.
      const t = e.target as HTMLElement | null;
      if (t?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      if (e.key === 'Enter' && value.trim()) submit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, value, revealed]);

  const hintLetters = cue ? cueLetters + revealed : revealed;
  const masked = answer.split('').map((ch, i) => (i < hintLetters ? ch : '·')).join(' ');
  const starter = answer.slice(0, Math.max(1, cue ? cueLetters : 0));

  const revealLetter = (): void => {
    if (revealed < answer.length - 1) {
      noteHint();
      setRevealed(revealed + 1);
    }
  };

  const submit = (): void => {
    if (phase !== 'stimulus' || !value.trim()) return;
    const grade = gradeTyped(answer, value);
    onSubmit({
      correct: grade.outcome !== 'wrong',
      nearMiss: grade.outcome === 'near-miss',
      typed: value,
    });
  };

  return (
    <div>
      <p className="mb-1 text-xl leading-relaxed">{prompt}</p>
      {cue && (
        <p className="mb-3 font-mono text-lg tracking-[0.2em] text-ink-soft" aria-label={`${answer.length} letters, starting with ${starter}`}>
          {masked}
          <span className="ml-2 font-sans text-sm tracking-normal text-ink-soft">({answer.length} letters)</span>
        </p>
      )}
      <div className="flex flex-col gap-3">
        <label htmlFor="typed-answer" className="sr-only">Type the word</label>
        <input
          id="typed-answer"
          ref={inputRef}
          value={value}
          disabled={phase !== 'stimulus'}
          onChange={(e) => setValue(e.target.value)}
          placeholder={cue ? `Starts with “${starter}”…` : 'Type the word…'}
          aria-label={`Type the word for: ${prompt}`}
          className="min-h-[52px] w-full rounded-xl border-2 border-line bg-paper px-4 py-3 font-display text-2xl tracking-wide transition-calm placeholder:text-ink-soft focus:border-accent focus:outline-none disabled:opacity-70"
          {...INPUT_HYGIENE}
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={submit}
            disabled={phase !== 'stimulus' || !value.trim()}
            className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg bg-accent px-5 py-2.5 font-medium text-paper transition-calm hover:brightness-110 disabled:cursor-not-allowed disabled:bg-line disabled:text-ink-soft"
          >
            Check
          </button>
          {phase === 'stimulus' && (
            <button
              onClick={revealLetter}
              disabled={revealed >= answer.length - 1}
              className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg border border-line-strong px-4 py-2 text-[15px] text-ink-soft transition-calm hover:border-accent hover:text-accent-deep disabled:opacity-40 dark:hover:text-accent"
            >
              Reveal a letter{hintsUsed > 0 ? ` (${hintsUsed} used)` : ''}
            </button>
          )}
        </div>
        {phase === 'feedback' && <TypedFeedback answer={answer} typed={value} />}
      </div>
    </div>
  );
}

export function TypedFeedback({ answer, typed }: { answer: string; typed: string }) {
  const grade = gradeTyped(answer, typed);
  if (grade.outcome !== 'wrong') {
    return (
      <p className="flex flex-wrap items-center gap-2 text-lg text-good">
        <Icon name="check" size={20} /> Good — that one&apos;s getting solid.
        {grade.outcome === 'near-miss' && (
          <span className="text-ink-soft">(“{typed}” — check the spelling: <strong>{answer}</strong>)</span>
        )}
      </p>
    );
  }
  return (
    <p className="text-lg">
      Not yet. The answer is <strong className="font-display text-xl">{answer}</strong>
    </p>
  );
}

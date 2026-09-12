import { useEffect, useMemo, useState } from 'react';
import { mulberry32, shuffled } from '../../../utils/rng';
import { gradeTyped } from '../../../core/engine/grading';
import { Icon } from '../../../components/ui/Icon';
import { TypedFeedback, INPUT_HYGIENE } from './TypedRecallActivity';
import type { ActivityProps } from './types';

/** Letter-bank assembly (§11 ladder step 2): tap letters in order. */
export function SpellingBuildActivity({ item, word, phase, onSubmit }: ActivityProps) {
  const answer = item.answer ?? word.word;
  const bank = useMemo(
    () => shuffled(answer.split(''), mulberry32(hashStr(word.id))),
    [answer, word.id],
  );
  const [picked, setPicked] = useState<number[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [wrong, setWrong] = useState(false);

  const current = picked.map((i) => bank[i]).join('');

  useEffect(() => {
    if (phase !== 'stimulus') return;
    const onKey = (e: KeyboardEvent): void => {
      const t = e.target as HTMLElement | null;
      if (t?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      if (e.key === 'Backspace' && picked.length > 0) {
        setPicked(picked.slice(0, -1));
        setWrong(false);
      } else if (e.key === 'Enter' && current.length === answer.length) {
        submit();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, picked, bank, answer]);

  const submit = (): void => {
    if (phase !== 'stimulus' || current.length !== answer.length || submitted) return;
    setSubmitted(true);
    setWrong(current.toLowerCase() !== answer.toLowerCase());
    onSubmit({ correct: current.toLowerCase() === answer.toLowerCase(), typed: current });
  };

  return (
    <div>
      <p className="mb-1 text-xl">{word.shortDefinition ?? word.word}</p>
      <p className="mb-4 text-ink-soft">Build the word from its letters, in order.</p>
      <div
        aria-label={`Your assembly, ${current.length} of ${answer.length} letters`}
        className={`mb-4 flex min-h-[64px] flex-wrap items-center gap-1.5 rounded-xl border-2 p-3 font-display text-2xl sm:text-3xl ${wrong ? 'border-bad bg-bad-soft' : 'border-line'}`}
      >
        {picked.length === 0 && <span className="text-ink-soft">Tap letters below…</span>}
        {picked.map((bi, i) => (
          <button
            key={i}
            onClick={() => phase === 'stimulus' && setPicked(picked.filter((_, j) => j !== i))}
            aria-label={`Remove ${bank[bi]}`}
            className="flex h-11 min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-lg bg-accent-soft text-accent-deep dark:text-accent"
          >
            {bank[bi]}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Letter bank">
        {bank.map((ch, i) => {
          const used = picked.includes(i);
          const occurrence = bank.slice(0, i + 1).filter((c) => c === ch).length;
          const totalOfCh = bank.filter((c) => c === ch).length;
          return (
            <button
              key={i}
              disabled={phase !== 'stimulus' || used}
              onClick={() => {
                setPicked([...picked, i]);
                setWrong(false);
              }}
              aria-label={totalOfCh > 1 ? `Add letter ${ch} (${occurrence} of ${totalOfCh})` : `Add letter ${ch}`}
              className="flex h-11 min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-lg border border-line-strong font-display text-2xl transition-calm hover:border-accent disabled:cursor-default disabled:opacity-25"
            >
              {ch}
            </button>
          );
        })}
      </div>
      <div className="mt-4 flex gap-2">
        <button
          onClick={submit}
          disabled={phase !== 'stimulus' || current.length !== answer.length}
          className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg bg-accent px-5 py-2.5 font-medium text-paper transition-calm hover:brightness-110 disabled:cursor-not-allowed disabled:bg-line disabled:text-ink-soft"
        >
          Check
        </button>
        {phase === 'stimulus' && picked.length > 0 && (
          <button
            onClick={() => setPicked([])}
            className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg border border-line-strong px-4 py-2 text-ink-soft"
          >
            Clear
          </button>
        )}
      </div>
      {phase === 'feedback' && (
        <div className="mt-3">
          {wrong ? (
            <p className="flex items-center gap-2 text-lg">
              <Icon name="x" size={20} className="text-bad" /> Not yet. The spelling is{' '}
              <strong className="font-display text-xl">{answer}</strong>
            </p>
          ) : (
            <p className="flex items-center gap-2 text-lg text-good">
              <Icon name="check" size={20} /> Good — that one&apos;s getting solid.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Flash-and-type (§11 ladder step 4): the word flashes ~1.5s, then hides. */
export function FlashTypeActivity({ item, word, phase, onSubmit }: ActivityProps) {
  const answer = item.answer ?? word.word;
  const [visible, setVisible] = useState(true);
  const [value, setValue] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setVisible(false), 1500);
    return () => clearTimeout(t);
  }, [item]);

  useEffect(() => {
    if (phase !== 'stimulus') return;
    const onKey = (e: KeyboardEvent): void => {
      const t = e.target as HTMLElement | null;
      if (t?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      if (e.key === 'Enter' && value.trim()) submit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, value]);

  const submit = (): void => {
    if (phase !== 'stimulus' || !value.trim()) return;
    const grade = gradeTyped(answer, value);
    onSubmit({ correct: grade.outcome !== 'wrong', nearMiss: grade.outcome === 'near-miss', typed: value });
  };

  return (
    <div>
      <div aria-live="polite" className="mb-4 flex min-h-[72px] items-center justify-center rounded-xl border border-line bg-paper-deep">
        {visible ? (
          <span className="font-display text-4xl">{answer}</span>
        ) : (
          <span className="text-ink-soft">Type it from memory…</span>
        )}
      </div>
      {!visible && phase === 'stimulus' && (
        <button
          onClick={() => setVisible(true)}
          className="mb-3 inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg border border-line-strong px-4 py-2 text-sm text-ink-soft transition-calm hover:border-accent hover:text-accent-deep dark:hover:text-accent"
        >
          Show it again
        </button>
      )}
      <label htmlFor="flash-answer" className="sr-only">Type the word you just saw</label>
      <input
        id="flash-answer"
        value={value}
        readOnly={visible}
        onChange={(e) => setValue(e.target.value)}
        placeholder={visible ? 'Watch…' : 'Type…'}
        aria-disabled={visible}
        className="min-h-[52px] w-full rounded-xl border-2 border-line bg-paper px-4 py-3 font-display text-2xl transition-calm placeholder:text-ink-soft focus:border-accent focus:outline-none"
        {...INPUT_HYGIENE}
      />
      <button
        onClick={submit}
        disabled={phase !== 'stimulus' || visible || !value.trim()}
        className="mt-3 inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg bg-accent px-5 py-2.5 font-medium text-paper transition-calm hover:brightness-110 disabled:cursor-not-allowed disabled:bg-line disabled:text-ink-soft"
      >
        Check
      </button>
      {phase === 'feedback' && (
        <div className="mt-3"><TypedFeedback answer={answer} typed={value} /></div>
      )}
    </div>
  );
}

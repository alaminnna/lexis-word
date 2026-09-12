import { useEffect, useMemo, useRef } from 'react';
import { useSpeak } from '../../../components/ui/WordHero';
import { Icon } from '../../../components/ui/Icon';
import type { ActivityProps } from './types';

/**
 * Shared selection activity: mcq-word-meaning, mcq-meaning-word, listen-meaning,
 * listen-spelling, minimal-pair, context-cloze, collocation-select, and the
 * gap/hear discrimination variants. Keyboard-first: 1–5 answers instantly.
 *
 * Single-tap submit: choosing an option IS the answer (no separate Check step —
 * a drill app must not charge three taps per question). Idempotency is enforced
 * upstream by the runner's submittedRef guard.
 */
export function McqActivity(props: ActivityProps & {
  optionWordIds?: (string | null)[];
  speakText?: string;
  autoPlay?: boolean;
}) {
  const { item, phase, submission, onSubmit, noteReplay, optionWordIds, speakText, autoPlay } = props;
  const options = useMemo(() => item.options ?? [], [item.options]);
  // Auto-play once per item: the runner reuses this instance across items,
  // so a mount-only flag would speak the first item and stay silent after.
  const playedItem = useRef<ActivityProps['item'] | null>(null);
  const { speak, speaking } = useSpeak();
  const listRef = useRef<HTMLDivElement>(null);

  const listening = speakText !== undefined;

  useEffect(() => {
    if (autoPlay && listening && speakText && playedItem.current !== item) {
      playedItem.current = item;
      void speak(speakText);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPlay, listening, item]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus();
  }, [item]);

  useEffect(() => {
    if (phase !== 'stimulus') return;
    const onKey = (e: KeyboardEvent): void => {
      const t = e.target as HTMLElement | null;
      if (t?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      // Number keys answer immediately — same as tapping the option.
      if (e.key >= '1' && e.key <= String(Math.min(9, options.length))) {
        const idx = Number(e.key) - 1;
        submit(idx);
      } else if (e.key === ' ' && listening) {
        e.preventDefault();
        void replay();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, options, listening, speakText]);

  const replay = async (): Promise<void> => {
    if (!speakText) return;
    noteReplay();
    await speak(speakText);
  };

  const submit = (idx: number): void => {
    if (phase !== 'stimulus') return;
    const chosen = options[idx];
    onSubmit({
      correct: chosen === item.answer,
      chosenOption: chosen,
      chosenWordId: optionWordIds?.[idx] ?? null,
    });
  };

  const isCorrect = submission?.correct === true;

  return (
    <div>
      {item.prompt && !listening && item.activity === 'mcq-word-meaning' && (
        <div className="mb-4">
          <p className="text-sm text-ink-soft">What does this word mean?</p>
          <p className="font-display text-4xl font-medium tracking-tight">{item.prompt}</p>
        </div>
      )}
      {item.prompt && !listening && item.activity === 'mcq-meaning-word' && (
        <div className="mb-4">
          <p className="text-sm text-ink-soft">Which word means:</p>
          <p className="text-xl leading-relaxed">“{renderPrompt(item.prompt)}”</p>
        </div>
      )}
      {item.prompt && !listening && item.activity !== 'mcq-word-meaning' && item.activity !== 'mcq-meaning-word' && (
        <p className="mb-4 text-xl leading-relaxed">{renderPrompt(item.prompt)}</p>
      )}
      {listening && (
        <div className="mb-5 flex flex-col items-start gap-2">
          <p className="text-sm text-ink-soft">{listenLabel(item.activity)}</p>
          <button
            onClick={() => void replay()}
            disabled={phase !== 'stimulus'}
            aria-label={speaking ? 'Playing audio' : 'Replay audio (Space)'}
            className="inline-flex min-h-[56px] cursor-pointer items-center gap-3 rounded-xl border border-line-strong px-5 py-3 text-lg transition-calm hover:border-accent hover:text-accent-deep dark:hover:text-accent"
          >
            <Icon name="speaker" size={24} />
            {speaking ? 'Playing…' : 'Listen'}
            <kbd className="rounded border border-line px-1.5 text-xs text-ink-soft" aria-hidden>Space</kbd>
          </button>
          {item.prompt && <p className="text-xl leading-relaxed">{renderPrompt(item.prompt)}</p>}
        </div>
      )}
      <div ref={listRef} className="flex flex-col gap-2" role="radiogroup" aria-label="Answer options">
        {options.map((opt, idx) => {
          const isAnswer = opt === item.answer;
          const isPicked = submission?.chosenOption === opt;
          let tone = 'border-line hover:border-accent hover:bg-accent-mist';
          if (phase === 'feedback') {
            if (isAnswer) tone = 'border-good bg-good-soft';
            else if (isPicked) tone = 'border-bad bg-bad-soft animate-shake';
            else tone = 'border-line opacity-60';
          }
          return (
            <button
              key={`${idx}-${opt}`}
              disabled={phase !== 'stimulus'}
              onClick={() => submit(idx)}
              role="radio"
              aria-checked={isPicked && phase === 'feedback'}
              className={`flex min-h-[52px] cursor-pointer items-center gap-3 rounded-xl border-2 px-4 py-3 text-left text-[17px] leading-snug transition-calm disabled:cursor-default ${tone}`}
            >
              <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-paper-deep text-sm text-ink-soft">
                {idx + 1}
              </span>
              <span className="flex-1">{opt}</span>
              {phase === 'feedback' && isAnswer && <Icon name="check" size={20} className="shrink-0 text-good" />}
              {phase === 'feedback' && isPicked && !isAnswer && <Icon name="x" size={20} className="shrink-0 text-bad" />}
            </button>
          );
        })}
      </div>
      {phase === 'feedback' && (
        <p className="mt-4 text-lg" aria-hidden={false}>
          {isCorrect ? (
            <span className="text-good">Good — that one&apos;s getting solid.</span>
          ) : (
            <span>Not yet. <strong className="font-medium">{item.answer}</strong></span>
          )}
        </p>
      )}
    </div>
  );
}

/** Listening stems: the audio is the question, the label says what to do. */
function listenLabel(activity: string): string {
  if (activity === 'listen-spelling') return 'Listen, then choose the correct spelling.';
  if (activity === 'minimal-pair') return 'Which word did you hear?';
  if (activity === 'discrimination') return 'Which word did you hear?';
  return 'Listen, then choose the meaning.';
}

/** Render cloze blanks with clear, screen-reader-friendly gap markers. */
function renderPrompt(prompt: string): React.ReactNode {
  if (!prompt.includes('＿＿＿＿')) return prompt;
  const parts = prompt.split('＿＿＿＿');
  return (
    <>
      {parts.map((part, i) => (
        <span key={i}>
          {part}
          {i < parts.length - 1 && (
            <span aria-label="blank" className="mx-1 inline-block min-w-16 border-b-2 border-accent text-center text-ink-soft">
              ···
            </span>
          )}
        </span>
      ))}
    </>
  );
}

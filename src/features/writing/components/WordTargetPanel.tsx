import type { WordRecord } from '../../../types/domain';
import { useSpeak } from '../../../components/ui/WordHero';
import { BengaliText } from '../../../components/ui/BengaliText';
import { Icon } from '../../../components/ui/Icon';

/**
 * Compact word context hero (§4.B): headword, POS, short definition, Bengali
 * per policy, audio, word family. Important but never half the screen.
 * (No IPA exists in the dataset — omitted rather than fabricated.)
 */
export function WordTargetPanel({ word, recallStrength = 0 }: {
  word: WordRecord;
  recallStrength?: number;
}) {
  const { speak, speaking } = useSpeak();
  return (
    <section aria-label="Target vocabulary" className="rounded-xl border border-line bg-paper-deep/60 p-4 md:p-5">
      <p className="text-xs tracking-wide text-ink-faint uppercase">Target vocabulary</p>
      <div className="mt-1 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-[clamp(1.75rem,4vw,2.25rem)] font-medium leading-tight tracking-tight">
            {word.word}
          </h2>
          {word.pos && word.pos.length > 0 && (
            <p className="mt-0.5 text-sm tracking-wide text-ink-faint uppercase">{word.pos.join(' · ')}</p>
          )}
        </div>
        <button
          onClick={() => void speak(word.word)}
          aria-label={speaking ? 'Playing pronunciation' : `Hear pronunciation of ${word.word}`}
          className="inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full border border-line-strong text-ink-soft transition-calm transition-colors hover:border-accent hover:text-accent-deep dark:hover:text-accent"
        >
          <Icon name="speaker" size={20} />
        </button>
      </div>
      {word.shortDefinition && <p className="mt-1 text-[17px]">{word.shortDefinition}</p>}
      <BengaliText bengali={word.bengali} recallStrength={recallStrength} className="mt-1" />
      {word.forms && word.forms.length > 0 && (
        <p className="mt-2 text-sm text-ink-soft">
          <span className="text-ink-faint">Family: </span>{word.forms.join(' · ')}
        </p>
      )}
      <p className="mt-3 border-t border-line pt-2 text-sm text-ink-soft">
        Your goal is not to force the word into a sentence. Use it where it sounds natural.
      </p>
    </section>
  );
}

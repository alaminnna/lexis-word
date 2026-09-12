import { WordHero } from '../../../components/ui/WordHero';
import { Button } from '../../../components/ui/Button';
import { highlightWord } from './highlight';
import type { ActivityProps } from './types';

/**
 * Meet card (§8 Stage 0): the full introduction — headword hero with audio
 * (auto-plays once), clearest definition, Bengali per policy, one highlighted
 * authentic example, word-family strip. Acknowledged, never tested.
 */
export function MeetActivity({ word, onSubmit }: ActivityProps) {
  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm tracking-wide text-ink-faint uppercase">New word · meet it first</p>
      <WordHero word={word} large autoPlay />
      <div className="rounded-xl border border-line bg-paper-deep p-4">
        <p className="text-[15px] leading-relaxed">{highlightWord(word.sentence, word.word, word.forms ?? [])}</p>
        <p className="mt-1 text-xs text-ink-faint">Study example</p>
      </div>
      {word.forms && word.forms.length > 0 && (
        <div>
          <p className="mb-1 text-sm text-ink-faint">Word family</p>
          <p className="text-[15px] text-ink-soft">{word.forms.join(' · ')}</p>
        </div>
      )}
      <div>
        <Button onClick={() => onSubmit({ correct: true })}>Got it — test me later</Button>
        <p className="mt-2 text-sm text-ink-faint">You&apos;ll be tested on this word shortly, then again tomorrow.</p>
      </div>
    </div>
  );
}

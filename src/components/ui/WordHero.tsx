import { useState } from 'react';
import { useSettings } from '../../store/settings';
import { speech } from '../../services/speech';
import type { WordRecord } from '../../types/domain';
import { Icon } from './Icon';
import { BengaliText } from './BengaliText';

/** Shared speech hook: settings voice/rate, speaking state, per-call counting. */
export function useSpeak() {
  const voiceURI = useSettings((s) => s.preferredVoiceURI);
  const rate = useSettings((s) => s.speechRate);
  const [speaking, setSpeaking] = useState(false);
  const speak = async (text: string): Promise<boolean> => {
    speech.init();
    setSpeaking(true);
    try {
      await speech.speak(text, { voiceURI, rate });
      return true;
    } catch {
      return false;
    } finally {
      setSpeaking(false);
    }
  };
  return { speak, speaking };
}

/** The word as hero: display serif headword, audio, Bengali per policy (§16). */
export function WordHero({ word, recallStrength = 0, autoPlay = false, large = false }: {
  word: WordRecord;
  recallStrength?: number;
  autoPlay?: boolean;
  large?: boolean;
}) {
  const { speak, speaking } = useSpeak();
  const [played, setPlayed] = useState(false);
  if (autoPlay && !played) {
    setPlayed(true);
    void speak(word.word);
  }
  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex w-full items-start justify-between gap-4">
        <h2 className={`font-display font-medium tracking-tight ${large ? 'text-[clamp(2.5rem,7vw,3.5rem)]' : 'text-[clamp(2rem,5vw,2.75rem)]'}`}>
          {word.word}
        </h2>
        <button
          onClick={() => void speak(word.word)}
          aria-label={speaking ? 'Playing pronunciation' : `Hear pronunciation of ${word.word}`}
          aria-pressed={speaking}
          className="mt-2 inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full border border-line-strong text-ink-soft transition-calm transition-colors hover:border-accent hover:text-accent-deep dark:hover:text-accent"
        >
          <Icon name={speaking ? 'refresh' : 'speaker'} size={20} />
        </button>
      </div>
      {word.pos && word.pos.length > 0 && (
        <p className="text-sm tracking-wide text-ink-faint uppercase">{word.pos.join(' · ')}</p>
      )}
      {word.shortDefinition && <p className="text-lg text-ink">{word.shortDefinition}</p>}
      <BengaliText bengali={word.bengali} recallStrength={recallStrength} />
    </div>
  );
}

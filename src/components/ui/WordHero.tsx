import { useEffect, useRef, useState } from 'react';
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
  const stop = (): void => {
    try {
      speech.cancel();
    } finally {
      setSpeaking(false);
    }
  };
  return { speak, speaking, stop };
}

/** The word as hero: display serif headword, audio, Bengali per policy (§16). */
export function WordHero({ word, recallStrength = 0, autoPlay = false, large = false }: {
  word: WordRecord;
  recallStrength?: number;
  autoPlay?: boolean;
  large?: boolean;
}) {
  const { speak, speaking, stop } = useSpeak();
  // Auto-play once per word: the runner reuses this instance across items,
  // so a mount-only flag would speak the first word and stay silent after.
  const playedFor = useRef<string | null>(null);
  useEffect(() => {
    if (autoPlay && playedFor.current !== word.id) {
      playedFor.current = word.id;
      void speak(word.word);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPlay, word]);
  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex w-full items-start justify-between gap-4">
        <h2 className={`font-display font-medium tracking-tight ${large ? 'text-[clamp(2.5rem,7vw,3.5rem)]' : 'text-[clamp(2rem,5vw,2.75rem)]'}`}>
          {word.word}
        </h2>
        <button
          onClick={() => {
            if (speaking) stop();
            else void speak(word.word);
          }}
          aria-label={speaking ? 'Stop pronunciation' : `Hear pronunciation of ${word.word}`}
          className="mt-2 inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full border border-line-strong text-ink-soft transition-calm transition-colors hover:border-accent hover:text-accent-deep dark:hover:text-accent"
        >
          <Icon name={speaking ? 'x' : 'speaker'} size={20} />
        </button>
      </div>
      {word.pos && word.pos.length > 0 && (
        <p className="text-sm tracking-wide text-ink-soft uppercase">{word.pos.join(' · ')}</p>
      )}
      {word.shortDefinition && <p className="text-lg text-ink">{word.shortDefinition}</p>}
      <BengaliText bengali={word.bengali} recallStrength={recallStrength} />
    </div>
  );
}

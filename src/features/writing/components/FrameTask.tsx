import { useMemo } from 'react';
import { WORDS } from '../../../data/words';
import type { WordRecord } from '../../../types/domain';
import { collocationFor } from '../../../core/engine/item-content';
import { mulberry32 } from '../../../utils/rng';
import { Button } from '../../../components/ui/Button';

/**
 * Guided frame task (§4.C): complete the academic sentence with its natural
 * partner from a word bank. Commits a collocation event directly (existing
 * behavior preserved) — the rubric pipeline is for transform/free tasks.
 */
export function FrameTask({ word, frameIdx, picks, onPicks, onCheck }: {
  word: WordRecord;
  frameIdx: number;
  picks: string[];
  onPicks: (picks: string[]) => void;
  onCheck: (correct: boolean, target: string, detail: string) => void;
}) {
  const frame = FRAMES[frameIdx % FRAMES.length]!;
  const bank = useMemo(() => {
    const sameStage = WORDS.filter((w) => w.stage === word.stage && w.id !== word.id);
    const { collocate } = collocationFor(word, sameStage, mulberry32(word.rank));
    const distractors = sameStage.slice(0, 12).flatMap((d) =>
      d.sentence.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter((t) => t.length > 4),
    );
    const uniq = [...new Set(distractors)].filter((d) => d !== collocate).slice(0, 3);
    while (uniq.length < 3) uniq.push(['strong', 'clear', 'major'][uniq.length]!);
    return { target: collocate, options: [collocate, ...uniq].sort() };
  }, [word]);

  return (
    <div>
      <p className="mb-1 text-sm text-ink-faint">Complete the academic sentence naturally:</p>
      <p className="text-xl leading-relaxed">
        {frame.template.split('____').map((part, i, arr) => (
          <span key={i}>
            {part}
            {i < arr.length - 1 && (
              <strong className="mx-1 rounded bg-accent-soft px-2 text-accent-deep dark:text-accent">
                {picks[i] ?? '…'}
              </strong>
            )}
          </span>
        ))}
      </p>
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Word bank">
        {bank.options.map((o) => (
          <button
            key={o}
            onClick={() => picks.length < frame.slots && onPicks([...picks, o])}
            disabled={picks.includes(o)}
            className="min-h-[44px] cursor-pointer rounded-lg border border-line-strong px-4 transition-calm hover:border-accent disabled:opacity-40"
          >
            {o}
          </button>
        ))}
        {picks.length > 0 && (
          <button onClick={() => onPicks([])} className="min-h-[44px] cursor-pointer px-3 text-sm text-ink-faint hover:text-ink">
            Clear
          </button>
        )}
      </div>
      <Button
        className="mt-3"
        disabled={picks.length < frame.slots}
        onClick={() => onCheck(picks[0] === bank.target, bank.target, picks.join(' / '))}
      >
        Check
      </Button>
    </div>
  );
}

export const FRAMES = [
  { template: 'The findings ____ significant implications for ____.', slots: 2 },
  { template: 'There is growing ____ that ____ plays a central role in ____.', slots: 3 },
  { template: 'Policymakers must ____ the long-term ____ of this trend.', slots: 2 },
];

export function FrameResult({ correct, target, onNext }: {
  correct: boolean; target: string; onNext: () => void;
}) {
  return (
    <div className="mt-2">
      <p className="text-lg">
        {correct
          ? <span className="text-good">Natural — that partner fits.</span>
          : <span>Not quite — the natural partner here is <strong>“{target}”</strong>.</span>}
      </p>
      <Button variant="secondary" className="mt-3" onClick={onNext}>Next frame</Button>
    </div>
  );
}

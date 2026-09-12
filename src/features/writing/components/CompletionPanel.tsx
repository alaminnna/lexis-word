import { Link } from 'react-router-dom';
import { Button } from '../../../components/ui/Button';
import { Icon } from '../../../components/ui/Icon';
import type { WordRecord } from '../../../types/domain';

/**
 * Calm completion (§9): what happened, one takeaway, next actions.
 * No celebrations, no gamification, no shame.
 */
export function CompletionPanel({ word, correct, takeaway, onRetry, onStudio }: {
  word: WordRecord;
  correct: boolean;
  takeaway: string | null;
  onRetry: () => void;
  onStudio: () => void;
}) {
  return (
    <div className="mx-auto w-full max-w-xl py-4 text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-good-soft" aria-hidden>
        <Icon name="check" size={24} className="text-good" />
      </span>
      <h2 className="mt-3 font-display text-3xl font-medium tracking-tight">Writing review saved.</h2>
      {correct ? (
        <p className="mt-2 text-lg text-ink-soft">Good. You examined “{word.word}” in context.</p>
      ) : (
        <p className="mt-2 text-lg text-ink-soft">Not quite natural yet. That is useful information — try another sentence.</p>
      )}
      {takeaway && (
        <p className="mx-auto mt-3 max-w-md rounded-xl border border-line bg-paper-deep/60 px-4 py-3 text-[15px]">
          <span className="font-medium">One useful improvement: </span>{takeaway}
        </p>
      )}
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button variant="secondary" onClick={onRetry}>Try another sentence</Button>
        <Button variant="ghost" onClick={onStudio}>Back to Writing Studio</Button>
      </div>
      <p className="mt-4 text-sm text-ink-soft">
        <Link to={`/word/${word.id}`} className="underline">Open “{word.word}” in detail</Link>
      </p>
    </div>
  );
}

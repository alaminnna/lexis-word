import { Link } from 'react-router-dom';
import { Button } from '../../../components/ui/Button';
import { Icon } from '../../../components/ui/Icon';
import type { RubricScores, WritingFeedback } from '../../../services/writing-feedback';

export type AIAvailability =
  | { state: 'off' }
  | { state: 'unavailable'; reason: string }
  | { state: 'ready'; source: 'user' | 'system'; model: string }
  | { state: 'failed'; message: string };

/**
 * AI review panel (§7): strictly separated from native review, explicitly
 * triggered, never blocking. Shows availability, loading, structured result,
 * and honest failure states. Never auto-calls.
 */
export function AIReviewPanel({ availability, requested, busy, result, gradedBy, onRequest }: {
  availability: AIAvailability;
  requested: boolean;
  busy: boolean;
  result: WritingFeedback | null;
  /** e.g. "System keys · api1 · z-ai/glm-5.3-flash" — who produced the result below */
  gradedBy?: string | null;
  onRequest: () => void;
}) {
  return (
    <section aria-labelledby="ai-panel" className="rounded-xl border border-line p-4 md:p-5">
      <h3 id="ai-panel" className="font-display text-xl">AI perspective</h3>
      <p className="mt-0.5 text-[15px] text-ink-soft">
        An additional review of your sentence against the same rubric. A second perspective, not the final authority.
      </p>

      {availability.state === 'off' && (
        <div className="mt-3">
          <p className="text-[15px] text-ink-soft">
            AI feedback is optional. Your writing can still be fully reviewed using authentic examples and the self-evaluation rubric.
          </p>
          <Link to="/settings" className="mt-2 inline-flex min-h-[44px] items-center rounded-lg border border-line-strong px-4 py-2 text-[15px]">
            Configure AI feedback
          </Link>
        </div>
      )}

      {availability.state === 'unavailable' && (
        <p className="mt-3 text-[15px] text-ink-soft">{availability.reason}</p>
      )}

      {(availability.state === 'ready' || availability.state === 'failed') && !result && (
        <div className="mt-3">
          {availability.state === 'failed' && (
            <p role="alert" className="mb-2 text-[15px] text-warn">{availability.message}</p>
          )}
          <Button variant="secondary" onClick={onRequest} loading={busy} disabled={requested && busy}>
            {requested ? 'Try AI feedback again' : 'Get AI feedback'}
          </Button>
          <p className="mt-1 text-xs text-ink-soft">
            {availability.state === 'ready'
              ? `Via ${availability.source === 'user' ? 'your keys' : 'system keys'} · ${availability.model} · analysis only, your saved review stands.`
              : 'Reads but never changes your saved review.'}
          </p>
        </div>
      )}

      {busy && (
        <p className="mt-3 text-[15px] text-ink-soft" role="status" aria-live="polite">
          Asking the model — usually a few seconds…
        </p>
      )}

      {result && <AIResult result={result} gradedBy={gradedBy} />}
    </section>
  );
}

const ROWS: { k: keyof RubricScores; t: string }[] = [
  { k: 'form', t: 'Word form' },
  { k: 'collocation', t: 'Collocation' },
  { k: 'register', t: 'Academic register' },
  { k: 'meaning', t: 'Meaning' },
];

function AIResult({ result, gradedBy }: { result: WritingFeedback; gradedBy?: string | null }) {
  const passed = ROWS.filter((r) => result.scores[r.k]).length;
  return (
    <div className="mt-3 space-y-3" aria-live="polite">
      {gradedBy && <p className="text-xs text-ink-soft">Graded with {gradedBy}.</p>}
      <p className="text-[15px]">
        <strong className="font-medium">Overall:</strong>{' '}
        {passed === 4
          ? 'the word is used well across all four dimensions.'
          : passed >= 2
            ? 'partly there — one or two dimensions need work.'
            : 'several dimensions need work — see below.'}
      </p>
      {result.strength && (
        <p className="text-[15px]"><strong className="font-medium">Strength:</strong> {result.strength}</p>
      )}
      {result.improvement && (
        <p className="text-[15px]"><strong className="font-medium">Most useful improvement:</strong> {result.improvement}</p>
      )}
      <ul className="space-y-1" aria-label="AI rubric">
        {ROWS.map((r) => (
          <li key={r.k} className="flex items-center gap-2 text-[15px]">
            <span aria-hidden className={result.scores[r.k] ? 'text-good' : 'text-warn'}>
              {result.scores[r.k] ? '✓' : '△'}
            </span>
            <span>
              {r.t}
              <span className="sr-only">: {result.scores[r.k] ? 'pass' : 'needs work'}</span>
            </span>
          </li>
        ))}
      </ul>
      {result.revision && (
        <div className="rounded-lg bg-paper-deep p-3">
          <p className="text-sm font-medium text-ink-soft">Suggested revision</p>
          <p className="mt-0.5 text-[15px]">“{result.revision}”</p>
          {result.why && <p className="mt-1 text-sm text-ink-soft"><strong className="font-medium">Why:</strong> {result.why}</p>}
        </div>
      )}
      <blockquote className="border-l-2 border-accent pl-3 text-[15px] italic">
        “{result.comment}”
      </blockquote>
      <p className="flex items-center gap-1.5 text-xs text-ink-soft">
        <Icon name="info" size={14} /> AI feedback is a second perspective, not the final authority.
      </p>
    </div>
  );
}

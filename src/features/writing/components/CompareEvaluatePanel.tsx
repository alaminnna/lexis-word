import { useState } from 'react';
import type { WordRecord } from '../../../types/domain';
import type { DictionaryEntry } from '../../../types/domain';
import { Button } from '../../../components/ui/Button';
import { SkeletonBlock } from '../../../components/ui/Skeleton';
import { highlightWord } from '../../session/activities/highlight';
import type { RubricScores } from '../../../services/writing-feedback';

export const RUBRIC: { k: keyof RubricScores; t: string; d: string }[] = [
  { k: 'form', t: 'Correct word form', d: 'Right inflection for the sentence (plural, tense, -ly…).' },
  { k: 'collocation', t: 'Natural collocation', d: 'The partner words sound natural together.' },
  { k: 'register', t: 'Academic register', d: 'Fits a Task 2 essay, not a chat message.' },
  { k: 'meaning', t: 'Meaning preserved', d: 'The sentence means what you intended.' },
];

/**
 * Compare & Evaluate (§6): your sentence stays primary, authentic usage below
 * it (never dominating), then Yes/No evaluation cards per dimension — boolean,
 * matching the engine model — plus an optional reflection. Nothing here calls
 * AI; that lives in its own panel, on explicit request only.
 */
export function CompareEvaluatePanel({ word, text, entry, rubric, onRubric, reflection, onReflection, onSave, saving, graderLine }: {
  word: WordRecord;
  text: string;
  entry: DictionaryEntry | null | undefined;
  rubric: RubricScores;
  onRubric: (next: RubricScores) => void;
  reflection: string;
  onReflection: (v: string) => void;
  onSave: () => void;
  saving: boolean;
  graderLine: React.ReactNode;
}) {
  const examples = entry?.examples.slice(0, 3) ?? [];
  // The engine model is boolean, but an untouched dimension is undecided, not
  // "No" — track touches locally so nothing looks pre-judged.
  const [touched, setTouched] = useState<Record<keyof RubricScores, boolean>>({
    form: false, collocation: false, register: false, meaning: false,
  });
  const judge = (k: keyof RubricScores, v: boolean): void => {
    setTouched((t) => ({ ...t, [k]: true }));
    onRubric({ ...rubric, [k]: v });
  };
  const judgedCount = RUBRIC.filter((r) => touched[r.k]).length;
  return (
    <div className="space-y-6">
      <section aria-labelledby="ce-yours" className="rounded-xl bg-accent-mist p-4 md:p-5">
        <h3 id="ce-yours" className="text-sm font-medium tracking-wide text-ink-soft uppercase">
          <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-paper" aria-hidden>1</span>
          Your sentence
        </h3>
        <p className="mt-2 font-display text-2xl leading-relaxed">
          {highlightWord(text, word.word, word.forms ?? [])}
        </p>
      </section>

      <section aria-labelledby="ce-authentic">
        <h3 id="ce-authentic" className="text-sm font-medium tracking-wide text-ink-soft uppercase">
          <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full border border-line-strong text-[11px] font-bold text-ink-soft" aria-hidden>2</span>
          Compare with authentic usage
        </h3>
        {entry === undefined && <div className="mt-2"><SkeletonBlock lines={2} /></div>}
        {entry && examples.length > 0 && (
          <ul className="mt-2 space-y-2">
            {examples.map((ex, i) => (
              <li key={i} className="border-l-2 border-line-strong pl-3 text-[15px] text-ink-soft">
                {highlightWord(ex.sentence, word.word, word.forms ?? [])}
                {ex.source && <span className="block text-xs text-ink-soft">{ex.source}</span>}
              </li>
            ))}
          </ul>
        )}
        {(entry === null || (entry && examples.length === 0)) && (
          <p className="mt-2 border-l-2 border-line-strong pl-3 text-[15px] text-ink-soft">
            {highlightWord(word.sentence, word.word, word.forms ?? [])}
            <span className="block text-xs text-ink-soft">Study example</span>
          </p>
        )}
      </section>

      <section aria-labelledby="ce-evaluate">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 id="ce-evaluate" className="font-display text-xl">
            <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full border border-line-strong align-middle text-[11px] font-bold text-ink-soft" aria-hidden>3</span>
            How well did you use the word?
          </h3>
          <p className="text-sm text-ink-soft" aria-live="polite">{judgedCount} of 4 judged</p>
        </div>
        <p className="mt-0.5 text-[15px] text-ink-soft">Compare your sentence with authentic usage before judging it.</p>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2" role="group" aria-label="Self evaluation">
          {RUBRIC.map((r) => {
            const decided = touched[r.k];
            return (
              <div key={r.k} className="rounded-xl border border-line p-3">
                <p className="font-medium">{r.t}</p>
                <p className="text-sm text-ink-soft">{r.d}</p>
                <div className="mt-2 flex gap-1.5" role="group" aria-label={r.t}>
                  <button
                    onClick={() => judge(r.k, true)}
                    aria-pressed={decided && rubric[r.k]}
                    className={`min-h-[44px] flex-1 cursor-pointer rounded-lg border text-sm transition-calm ${decided && rubric[r.k] ? 'border-good bg-good-soft font-medium text-good' : 'border-line text-ink-soft hover:border-line-strong'}`}
                  >
                    Yes
                  </button>
                  <button
                    onClick={() => judge(r.k, false)}
                    aria-pressed={decided && !rubric[r.k]}
                    className={`min-h-[44px] flex-1 cursor-pointer rounded-lg border text-sm transition-calm ${decided && !rubric[r.k] ? 'border-bad bg-bad-soft font-medium text-bad' : 'border-line text-ink-soft hover:border-line-strong'}`}
                  >
                    No
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-sm text-ink-soft">All four “Yes” counts as a full self-review.</p>
      </section>

      <section aria-labelledby="ce-reflection">
        <h3 id="ce-reflection" className="font-display text-xl">
          <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full border border-line-strong align-middle text-[11px] font-bold text-ink-soft" aria-hidden>4</span>
          Your reflection <span className="font-sans text-sm font-normal text-ink-soft">(optional)</span>
        </h3>
        <label htmlFor="ws-reflection" className="sr-only">What would you improve in this sentence?</label>
        <textarea
          id="ws-reflection"
          value={reflection}
          onChange={(e) => onReflection(e.target.value.slice(0, 500))}
          rows={2}
          placeholder="What would you improve in this sentence?"
          className="mt-2 min-h-[64px] w-full rounded-xl border border-line bg-paper px-4 py-2.5 text-[16px] transition-calm placeholder:text-ink-soft focus:border-accent focus:outline-none"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          autoComplete="off"
        />
        <p className="mt-1 text-xs text-ink-soft" aria-live="polite">{reflection.length} / 500</p>
      </section>

      <div>
        {graderLine}
        <Button className="mt-2" onClick={onSave} loading={saving}>Save writing review</Button>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { SessionItem, WordRecord } from '../../types/domain';
import { WORDS } from '../../data/words';
import { aggregateErrorProfile, SPELLING_ERROR_LABELS, type SpellingErrorKind } from '../../core/engine/errors';
import { useProgress } from '../../store/progress';
import { PageHeader } from '../../app/layout';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { BengaliText } from '../../components/ui/BengaliText';
import { Icon } from '../../components/ui/Icon';
import {
  DictationActivity, SpellingBuildActivity, FlashTypeActivity, TypedRecallActivity,
} from '../session/activities/index';
import { useLabRound } from './useLabRound';
import { mulberry32, shuffled } from '../../utils/rng';

const STEPS = [
  'Chunks', 'Letters', 'Type + hint', 'Flash type', 'Dictation', 'Meaning → spell',
] as const;

const STEP_META: { short: string; desc: string; range: string }[] = [
  { short: 'Chunks', desc: 'Order the parts', range: '< 15' },
  { short: 'Letters', desc: 'Tap letters in order', range: '15–29' },
  { short: 'Type + hint', desc: '2 starter letters', range: '30–44' },
  { short: 'Flash type', desc: '1.5s glance, then type', range: '45–59' },
  { short: 'Dictation', desc: 'Hear it, type it', range: '60–74' },
  { short: 'Meaning → spell', desc: 'Definition only', range: '75+' },
];

/** Naive syllable-ish splitter (documented heuristic for the ladder, not linguistics). */
export function chunksOf(word: string): string[] {
  const lower = word.toLowerCase();
  const isV = (c: string): boolean => 'aeiouy'.includes(c);
  const cuts: number[] = [];
  for (let i = 0; i < lower.length; i++) {
    // V C C V → cut after first C (com-mis-sion); V C V → cut before C.
    if (isV(lower[i]!) && !isV(lower[i + 1] ?? '') && lower.slice(i + 2).split('').some(isV)) {
      if (!isV(lower[i + 2] ?? '') && lower.slice(i + 3).split('').some(isV)) cuts.push(i + 2);
      else cuts.push(i + 1);
    }
  }
  const uniq = [...new Set(cuts)].filter((c) => c > 0 && c < lower.length).sort((a, b) => a - b);
  if (uniq.length === 0) {
    const mid = Math.max(1, Math.floor(word.length / 2));
    return [word.slice(0, mid), word.slice(mid)];
  }
  const parts: string[] = [];
  let prev = 0;
  for (const c of uniq) {
    parts.push(word.slice(prev, c));
    prev = c;
  }
  parts.push(word.slice(prev));
  return parts.filter((p) => p.length > 0);
}

/** Step 1: syllable-chunk reorder — assemble the word from shuffled chunks. */
function ChunkActivity({ word, onDone }: { word: WordRecord; onDone: (correct: boolean, typed: string) => void }) {
  const chunks = useMemo(() => chunksOf(word.word), [word]);
  const bank = useMemo(() => shuffled(chunks.map((_, i) => i), mulberry32(hashStr(word.id))), [chunks, word.id]);
  const [picked, setPicked] = useState<number[]>([]);
  const [result, setResult] = useState<boolean | null>(null);

  const submit = (): void => {
    if (picked.length !== chunks.length || result !== null) return;
    const built = picked.map((i) => chunks[bank[i]!]!).join('');
    const ok = built.toLowerCase() === word.word.toLowerCase();
    setResult(ok);
    onDone(ok, built);
  };

  return (
    <div>
      <p className="mb-3 text-lg leading-relaxed text-balance sm:text-xl">Rebuild <strong>{word.word.length}-letter</strong> word from its chunks, in order.</p>
      <div className="mb-3 flex min-h-[72px] flex-wrap gap-2 rounded-xl border-2 border-line p-3 font-display text-2xl" aria-label="Your assembly">
        {picked.length === 0 && <span className="text-ink-faint">Tap chunks below…</span>}
        {picked.map((bi, i) => (
          <button key={i} onClick={() => result === null && setPicked(picked.filter((_, j) => j !== i))}
            aria-label={`Remove ${chunks[bank[bi]!]}`}
            className="min-h-[48px] cursor-pointer rounded-lg bg-accent-soft px-3 py-1 text-accent-deep transition-calm active:scale-95 dark:text-accent">
            {chunks[bank[bi]!]}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Chunk bank">
        {bank.map((ci, i) => (
          <button key={i} disabled={picked.includes(i) || result !== null}
            onClick={() => setPicked([...picked, i])}
            className="min-h-[52px] min-w-[56px] cursor-pointer rounded-xl border border-line-strong px-4 font-display text-2xl transition-calm hover:border-accent active:scale-[0.98] disabled:cursor-default disabled:opacity-25">
            {chunks[ci]}
          </button>
        ))}
      </div>
      <Button className="mt-4 w-full sm:w-auto" disabled={picked.length !== chunks.length || result !== null} onClick={submit}>Check</Button>
      {result !== null && (
        <p className={`mt-3 text-lg ${!result ? 'animate-shake' : ''}`}>{result
          ? <span className="text-good">Good — chunks in the right order.</span>
          : <span>Not yet — the word is <strong className="font-display">{word.word}</strong> ({chunks.join(' · ')}).</span>}</p>
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

/** Tailored hint: emphasize the learner's actual error class for this word. */
function TailoredTip({ wordId, word }: { wordId: string; word: string }) {
  const profile = useProgress((s) => s.words[wordId]?.errorProfile);
  const top = profile ? (Object.entries(profile).sort((a, b) => b[1] - a[1])[0]?.[0] as SpellingErrorKind | undefined) : undefined;
  if (!top) return null;
  return (
    <p className="flex gap-2 rounded-xl border border-warn/20 bg-warn-soft px-3 py-2 text-[15px] leading-relaxed">
      <Icon name="alert" size={18} className="mt-0.5 shrink-0 text-warn" />
      <span>Your pattern here: <strong>{SPELLING_ERROR_LABELS[top]}</strong> — {emphasize(word, top)}</span>
    </p>
  );
}

function emphasize(word: string, kind: SpellingErrorKind): React.ReactNode {
  const bold = (re: RegExp): React.ReactNode => {
    const m = word.match(re);
    if (!m || m.index === undefined) return word;
    return (<>{word.slice(0, m.index)}<strong>{m[0]}</strong>{word.slice(m.index + m[0].length)}</>);
  };
  switch (kind) {
    case 'dropped-double': return (<>watch the doubles: {bold(/(.)\1/)} </>);
    case 'vowel-substitution': return (<>vowels carry it: {bold(/[aeiou]+/)} </>);
    case 'silent-letter': return (<>a quiet letter hides in: {bold(/^(k|w|p|g|b)|gh|mb/)} </>);
    case 'suffix': return (<>mind the ending: {bold(/(tion|sion|ing|ed|es|ly|ous|able|ible|ment|ness)$/)} </>);
    case 'transposition': return 'slow down — order matters more than speed.';
    case 'truncation': return 'finish the word — the tail counts.';
    default: return 'one careful pass, letter by letter.';
  }
}

function weakestSpelling(): WordRecord[] {
  const words = useProgress.getState().words;
  return WORDS.filter((w) => words[w.id]?.introducedAt)
    .sort((a, b) => (words[a.id]?.dimensions.spelling.strength ?? 0) - (words[b.id]?.dimensions.spelling.strength ?? 0));
}

function stepFor(strength: number): number {
  if (strength < 15) return 0;
  if (strength < 30) return 1;
  if (strength < 45) return 2;
  if (strength < 60) return 3;
  if (strength < 75) return 4;
  return 5;
}

function LadderButton({ index, active, onSelect, layout }: {
  index: number; active: boolean; onSelect: () => void; layout: 'row' | 'col';
}) {
  const meta = STEP_META[index]!;
  if (layout === 'row') {
    return (
      <button
        role="radio"
        aria-checked={active}
        onClick={onSelect}
        className={`min-h-[48px] shrink-0 snap-start rounded-xl border px-4 py-2 text-left transition-calm ${
          active
            ? 'border-accent bg-accent-soft font-medium text-accent-deep dark:text-accent'
            : 'border-line text-ink-soft hover:border-line-strong hover:text-ink'
        }`}
      >
        <span className="text-[15px] whitespace-nowrap">{index + 1}. {meta.short}</span>
      </button>
    );
  }
  return (
    <button
      role="radio"
      aria-checked={active}
      aria-current={active ? 'step' : undefined}
      onClick={onSelect}
      className={`w-full rounded-xl border p-3 text-left transition-calm ${
        active
          ? 'border-accent bg-accent-soft'
          : 'border-line hover:border-line-strong'
      }`}
    >
      <span className="flex items-center gap-3">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-display text-lg ${
          active ? 'bg-accent text-paper' : 'bg-paper-deep text-ink-soft'
        }`} aria-hidden>{index + 1}</span>
        <span>
          <span className={`block text-[15px] font-medium ${active ? 'text-accent-deep dark:text-accent' : 'text-ink'}`}>{meta.short}</span>
          <span className="block text-[13px] text-ink-soft">{meta.desc} · {meta.range}</span>
        </span>
      </span>
    </button>
  );
}

/**
 * Spelling Lab (§11): the six-rung ladder ordered by spelling strength, the
 * learner's error-pattern profile, and hints tailored to actual error classes.
 * Responsive: PC 3-col (ladder | stage | insights), phone stacked + sticky actions.
 */
export default function SpellingPage() {
  const lab = useLabRound('spelling');
  const [step, setStep] = useState<number | null>(null);
  const [wordIdx, setWordIdx] = useState(0);
  // Re-sorted after every round so practice always targets the current weakest word.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const pool = useMemo(() => weakestSpelling(), [lab.tally.total]);
  const allProfiles = useProgress((s) => s.words);
  const learnerProfile = useMemo(
    () => aggregateErrorProfile(Object.fromEntries(Object.entries(allProfiles).map(([id, p]) => [id, p.errorProfile]))),
    [allProfiles],
  );

  useEffect(() => {
    if (pool.length === 0 || lab.item) return;
    const first = pool[0]!;
    const strength = useProgress.getState().words[first.id]?.dimensions.spelling.strength ?? 0;
    nextWord(step ?? stepFor(strength));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool.length]);

  const startWord = (word: WordRecord, s: number): void => {
    setStep(s);
    const base = {
      wordId: word.id, difficulty: 2 as const,
      reason: { kind: 'weak-dimension' as const, humanText: `Spelling Lab — rung ${s + 1} of 6 for ${word.word}.` },
    };
    const items: SessionItem[] = [
      { ...base, activity: 'spelling-build', dimension: 'spelling', answer: word.word },
      { ...base, activity: 'spelling-build', dimension: 'spelling', answer: word.word },
      { ...base, activity: 'cued-recall', dimension: 'spelling', answer: word.word, prompt: word.shortDefinition ?? word.word },
      { ...base, activity: 'flash-type', dimension: 'spelling', answer: word.word },
      { ...base, activity: 'sentence-dictation', dimension: 'listening', answer: word.word, prompt: word.word },
      {
        ...base, activity: 'free-recall', dimension: 'spelling', answer: word.word,
        prompt: word.shortDefinition ?? word.word,
      },
    ];
    lab.start(items[s]!, word);
  };

  const nextWord = (s: number): void => {
    if (pool.length === 0) return;
    const word = pool[wordIdx % pool.length]!;
    setWordIdx((i) => i + 1);
    startWord(word, s);
  };

  const jumpToWord = (id: string, s: number): void => {
    const at = pool.findIndex((w) => w.id === id);
    if (at < 0) return;
    setWordIdx(at + 1);
    startWord(pool[at]!, s);
  };

  if (pool.length === 0) {
    return (
      <div>
        <PageHeader title="Spelling Lab" sub="Build it letter by letter." />
        <EmptyState
          title="Meet some words first"
          body="The Spelling Lab works on words you've already met. Start a session to unlock it."
          action={<Link to="/learn" className="inline-flex min-h-[44px] items-center rounded-lg bg-accent px-5 py-2.5 font-medium text-paper">Begin session</Link>}
        />
      </div>
    );
  }

  const word = lab.word;
  const activeStep = step ?? 0;
  const currentStrength = word ? (allProfiles[word.id]?.dimensions.spelling.strength ?? 0) : 0;
  const accuracy = lab.tally.total > 0 ? Math.round((lab.tally.correct / lab.tally.total) * 100) : null;

  return (
    <div>
      <Link to="/labs" className="inline-flex min-h-[44px] items-center gap-1 text-sm text-ink-soft transition-calm hover:text-ink">
        <Icon name="chevron-left" size={16} /> Labs
      </Link>
      <PageHeader
        title="Spelling Lab"
        sub={lab.tally.total > 0
          ? <span className="tabular-nums">{lab.tally.correct}/{lab.tally.total} correct this visit{accuracy !== null ? ` · ${accuracy}%` : ''}</span>
          : 'Build it letter by letter.'}
      />

      {lab.tally.total > 0 && (
        <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-paper-deep" role="progressbar" aria-valuenow={lab.tally.correct} aria-valuemin={0} aria-valuemax={lab.tally.total} aria-label="Session accuracy">
          <div className="h-full rounded-full bg-accent transition-calm" style={{ width: `${(lab.tally.correct / Math.max(1, lab.tally.total)) * 100}%` }} />
        </div>
      )}

      {/* Phone: horizontal stepper */}
      <div role="radiogroup" aria-label="Ladder rung" className="mb-4 flex gap-2 overflow-x-auto pb-2 lg:hidden">
        {STEPS.map((t, i) => (
          <LadderButton key={t} index={i} layout="row" active={i === activeStep} onSelect={() => word && nextWord(i)} />
        ))}
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[240px_minmax(0,1fr)_280px]">
        {/* PC: vertical ladder */}
        <nav aria-label="Ladder rungs" className="hidden lg:block">
          <div role="radiogroup" aria-label="Ladder rung" className="flex flex-col gap-2">
            {STEPS.map((t, i) => (
              <LadderButton key={t} index={i} layout="col" active={i === activeStep} onSelect={() => word && nextWord(i)} />
            ))}
          </div>
          <p className="mt-3 px-1 text-[13px] leading-relaxed text-ink-faint">
            Rung auto-matches spelling strength. Tap any rung to drill it.
          </p>
        </nav>

        {/* Stage */}
        {word && lab.activityProps && (
          <Card key={lab.roundKey} className="p-5 sm:p-6 lg:p-8">
            <p className="mb-1 text-[13px] font-medium tracking-wide text-ink-faint uppercase">
              Rung {activeStep + 1} of 6 · {STEP_META[activeStep]!.short}
            </p>
            <h2 className="mb-3 font-display text-2xl font-medium tracking-tight text-balance sm:text-3xl">
              {activeStep === 0 ? 'Rebuild in chunks' : activeStep === 5 ? 'Spell from meaning' : word.word.length <= 12 ? `Spell “${word.word}”` : 'Spell the word'}
            </h2>
            {activeStep === 5 && (
              <div className="mb-3">
                <p className="text-lg leading-relaxed sm:text-xl">{word.shortDefinition}</p>
                <BengaliText bengali={word.bengali} recallStrength={0} />
              </div>
            )}
            <TailoredTip wordId={word.id} word={word.word} />
            <div className="mt-4">
              {activeStep === 0 && (
                <ChunkActivity word={word} onDone={(correct, typed) => lab.activityProps?.onSubmit({ correct, typed })} />
              )}
              {activeStep === 1 && <SpellingBuildActivity {...lab.activityProps} />}
              {activeStep === 2 && <TypedRecallActivity {...lab.activityProps} cue cueLetters={2} />}
              {activeStep === 3 && <FlashTypeActivity {...lab.activityProps} />}
              {activeStep === 4 && <DictationActivity {...lab.activityProps} wordOnly />}
              {activeStep === 5 && <TypedRecallActivity {...lab.activityProps} />}
            </div>
            {lab.phase === 'feedback' && (
              <div className="sticky bottom-[76px] z-20 mt-5 md:static">
                <Button className="w-full sm:w-auto" onClick={() => nextWord(activeStep)} autoFocus>Next</Button>
              </div>
            )}
          </Card>
        )}

        {/* Insights rail */}
        <aside className="space-y-4 lg:sticky lg:top-4">
          {word && (
            <Card className="p-4">
              <p className="text-[13px] font-medium tracking-wide text-ink-faint uppercase">Now practicing</p>
              <p className="mt-1 font-display text-2xl tracking-tight">{word.word}</p>
              <p className="mt-1 text-sm text-ink-soft tabular-nums">
                {word.word.length} letters · strength {Math.round(currentStrength)}
              </p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-paper-deep" aria-hidden>
                <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, Math.max(4, currentStrength))}%` }} />
              </div>
            </Card>
          )}

          <Card className="p-4">
            <h2 className="mb-2 font-display text-lg">Up next</h2>
            <ul className="space-y-1">
              {pool.slice(0, 5).map((w) => {
                const s = allProfiles[w.id]?.dimensions.spelling.strength ?? 0;
                const isCurrent = w.id === word?.id;
                return (
                  <li key={w.id}>
                    <button
                      onClick={() => jumpToWord(w.id, activeStep)}
                      aria-current={isCurrent ? 'true' : undefined}
                      className={`flex min-h-[44px] w-full cursor-pointer items-center justify-between gap-2 rounded-lg border px-3 py-1.5 text-left text-[15px] transition-calm ${
                        isCurrent ? 'border-accent bg-accent-soft font-medium text-accent-deep dark:text-accent' : 'border-transparent hover:border-line hover:bg-paper-deep'
                      }`}
                    >
                      <span className="truncate">{w.word}</span>
                      <span className="shrink-0 text-[13px] text-ink-faint tabular-nums">{Math.round(s)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 text-[13px] text-ink-faint">{pool.length} word{pool.length === 1 ? '' : 's'} weakest-first.</p>
          </Card>

          {learnerProfile.length > 0 && (
            <Card className="p-4">
              <h2 className="mb-1 font-display text-lg">Your error patterns</h2>
              <ul className="space-y-2 text-[15px] text-ink-soft">
                {learnerProfile.slice(0, 4).map((p) => (
                  <li key={p.kind}>
                    <span className="flex items-baseline justify-between gap-2">
                      <strong className="font-medium text-ink">{SPELLING_ERROR_LABELS[p.kind]}</strong>
                      <span className="text-[13px] text-ink-faint tabular-nums">{p.count} slip{p.count === 1 ? '' : 's'}</span>
                    </span>
                    <span className="block truncate text-[13px] text-ink-faint">{p.words.slice(0, 3).map((id) => WORDS.find((w) => w.id === id)?.word ?? id).join(', ')}{p.words.length > 3 ? '…' : ''}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}

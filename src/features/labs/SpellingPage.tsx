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

const STEP_META: { short: string; title: string; desc: string; range: string }[] = [
  { short: 'Chunks', title: 'Rebuild in chunks', desc: 'Order the parts of the word', range: 'strength < 15' },
  { short: 'Letters', title: 'Build from letters', desc: 'Tap the letters in order', range: 'strength 15–29' },
  { short: 'Type + hint', title: 'Type with a hint', desc: 'Two starter letters, then you', range: 'strength 30–44' },
  { short: 'Flash type', title: 'Watch, then type', desc: 'A 1.5s glance, then memory', range: 'strength 45–59' },
  { short: 'Dictation', title: 'Hear it, type it', desc: 'Listen, then spell', range: 'strength 60–74' },
  { short: 'Meaning → spell', title: 'Spell from meaning', desc: 'Definition only, no letters', range: 'strength 75+' },
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
      <p className="mb-3 text-lg leading-relaxed text-balance">
        Rebuild the <strong>{word.word.length}-letter</strong> word from its chunks, in order.
      </p>
      <div className="mb-3 flex min-h-[68px] flex-wrap gap-2 rounded-xl border-2 border-line bg-paper-deep/50 p-3 font-display text-2xl" aria-label="Your assembly">
        {picked.length === 0 && <span className="text-base text-ink-faint">Tap chunks below…</span>}
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
    <p className="flex gap-2 rounded-xl bg-warn-soft px-3 py-2.5 text-[15px] leading-relaxed">
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

/**
 * Spelling Lab (§11): six-rung ladder, weakest-first, error-pattern aware.
 * One calm centered column — the ladder is a slim stepper, the stage has
 * focus, and supporting info sits quietly underneath on every screen size.
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
  const meta = STEP_META[activeStep]!;
  const currentStrength = word ? Math.round(allProfiles[word.id]?.dimensions.spelling.strength ?? 0) : 0;

  return (
    <div>
      <Link to="/labs" className="inline-flex min-h-[44px] items-center gap-1 text-sm text-ink-soft transition-calm hover:text-ink">
        <Icon name="chevron-left" size={16} /> Labs
      </Link>
      <PageHeader
        title="Spelling Lab"
        sub={lab.tally.total > 0
          ? <span className="tabular-nums">{lab.tally.correct}/{lab.tally.total} correct this visit</span>
          : 'Build it letter by letter.'}
      />

      {/* Ladder stepper — one row of rungs on every screen size */}
      <div role="radiogroup" aria-label="Ladder rung" className="mb-1 flex items-center">
        {STEP_META.map((m, i) => {
          const active = i === activeStep;
          return (
            <div key={m.short} className="flex flex-1 items-center last:flex-none">
              <button
                role="radio"
                aria-checked={active}
                aria-label={`Rung ${i + 1}: ${m.short} — ${m.desc}`}
                title={`${m.short} (${m.range})`}
                onClick={() => word && nextWord(i)}
                className={`flex min-h-[44px] min-w-[44px] cursor-pointer flex-col items-center justify-center gap-0.5 rounded-xl px-1 transition-calm ${
                  active ? 'bg-accent-soft' : 'hover:bg-paper-deep'
                }`}
              >
                <span className={`flex h-7 w-7 items-center justify-center rounded-full text-[13px] font-medium tabular-nums transition-calm ${
                  active ? 'bg-accent text-paper' : 'bg-paper-deep text-ink-soft'
                }`} aria-hidden>{i + 1}</span>
                <span className={`hidden text-[11px] leading-none whitespace-nowrap sm:block ${
                  active ? 'font-medium text-accent-deep dark:text-accent' : 'text-ink-faint'
                }`} aria-hidden>{m.short}</span>
              </button>
              {i < STEP_META.length - 1 && (
                <div aria-hidden className={`mx-0.5 h-px min-w-2 flex-1 ${i < activeStep ? 'bg-accent' : 'bg-line'}`} />
              )}
            </div>
          );
        })}
      </div>
      <p className="mb-4 px-1 text-[13px] text-ink-faint">
        Rung {activeStep + 1} of 6 · {meta.desc} ({meta.range})
      </p>

      {/* Stage */}
      {word && lab.activityProps && (
        <Card key={lab.roundKey} className="p-5 sm:p-6">
          <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-2xl font-medium tracking-tight text-balance">{meta.title}</h2>
            <p className="shrink-0 text-[13px] text-ink-faint tabular-nums">
              {word.word.length} letters · strength {currentStrength}
            </p>
          </div>
          {activeStep === 5 && (
            <div className="mt-2 mb-1">
              <p className="text-lg leading-relaxed">{word.shortDefinition}</p>
              <BengaliText bengali={word.bengali} recallStrength={0} />
            </div>
          )}
          <div className="mt-2">
            <TailoredTip wordId={word.id} word={word.word} />
          </div>
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

      {/* Quiet supporting info — same content on PC and phone */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Card className="p-4">
          <h2 className="mb-2 text-[15px] font-medium">Up next <span className="font-normal text-ink-faint">· weakest first</span></h2>
          <ul className="space-y-0.5">
            {pool.slice(0, 4).map((w) => {
              const s = Math.round(allProfiles[w.id]?.dimensions.spelling.strength ?? 0);
              const isCurrent = w.id === word?.id;
              return (
                <li key={w.id}>
                  <button
                    onClick={() => jumpToWord(w.id, activeStep)}
                    aria-current={isCurrent ? 'true' : undefined}
                    className={`flex min-h-[44px] w-full cursor-pointer items-center justify-between gap-2 rounded-lg px-2.5 text-left text-[15px] transition-calm ${
                      isCurrent ? 'bg-accent-soft font-medium text-accent-deep dark:text-accent' : 'hover:bg-paper-deep'
                    }`}
                  >
                    <span className="truncate">{w.word}</span>
                    <span className="h-1 w-16 shrink-0 overflow-hidden rounded-full bg-paper-deep" aria-hidden>
                      <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.min(100, Math.max(6, s))}%` }} />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card className="p-4">
          <h2 className="mb-2 text-[15px] font-medium">Your error patterns</h2>
          {learnerProfile.length === 0 ? (
            <p className="text-[14px] leading-relaxed text-ink-soft">
              No slips recorded yet — make a few and this becomes your personal hit-list.
            </p>
          ) : (
            <ul className="space-y-2 text-[14px]">
              {learnerProfile.slice(0, 3).map((p) => (
                <li key={p.kind} className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0">
                    <strong className="font-medium">{SPELLING_ERROR_LABELS[p.kind]}</strong>
                    <span className="block truncate text-[13px] text-ink-faint">
                      {p.words.slice(0, 3).map((id) => WORDS.find((w) => w.id === id)?.word ?? id).join(', ')}
                    </span>
                  </span>
                  <span className="shrink-0 text-[13px] text-ink-faint tabular-nums">{p.count}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

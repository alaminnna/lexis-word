import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ConfusionEdge, SessionItem, WordRecord } from '../../types/domain';
import { WORD_MAP } from '../../data/words';
import { clozePrompt } from '../../core/engine/item-content';
import { getSpeechAvailable } from '../../services/speech';
import { useProgress } from '../../store/progress';
import { PageHeader } from '../../app/layout';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { BengaliText } from '../../components/ui/BengaliText';
import { McqActivity, TypedRecallActivity } from '../session/activities/index';
import { highlightWord } from '../session/activities/highlight';
import { useLabRound } from './useLabRound';

function relTime(ts: number): string {
  const days = Math.round((Date.now() - ts) / 86_400_000);
  if (days <= 0) return 'today';
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

function signature(a: WordRecord, b: WordRecord): string {
  const posNote = a.pos?.[0] === b.pos?.[0]
    ? `Both are ${a.pos?.[0] ?? 'words'}s — only the meaning separates them.`
    : `Different jobs: ${a.word} is a ${a.pos?.[0] ?? 'word'}, ${b.word} is a ${b.pos?.[0] ?? 'word'}.`;
  return `“${a.word}” = ${a.shortDefinition ?? ''} — while “${b.word}” = ${b.shortDefinition ?? ''}. ${posNote}`;
}

/** Six interleaved rapid-fire questions alternating across the pair. */
function buildDrill(a: WordRecord, b: WordRecord, speech: boolean): { item: SessionItem; word: WordRecord }[] {
  const out: { item: SessionItem; word: WordRecord }[] = [];
  const variants = (['gap', 'hear', 'spell', 'gap', 'hear', 'spell'] as const);
  variants.forEach((variant, i) => {
    const target = i % 2 === 0 ? a : b;
    const other = target.id === a.id ? b : a;
    const base = {
      wordId: target.id, difficulty: 2 as const, pairId: other.id,
      reason: { kind: 'confusion-pair' as const, humanText: `Drill ${i + 1} of 6 — separating ${a.word} / ${b.word}.` },
    };
    if (variant === 'gap') {
      const prompt = clozePrompt(target) ?? `Which word fits here: ______. (${target.shortDefinition ?? ''})`;
      out.push({
        word: target,
        item: {
          ...base, activity: 'discrimination', dimension: 'context',
          options: [target.word, other.word], answer: target.word, prompt,
        },
      });
    } else if (variant === 'hear' && speech) {
      out.push({
        word: target,
        item: {
          ...base, activity: 'discrimination', dimension: 'listening',
          options: [a.word, b.word], answer: target.word,
        },
      });
    } else {
      out.push({
        word: target,
        item: {
          ...base, activity: 'discrimination', dimension: 'spelling',
          answer: target.word, prompt: `Spell the word that means: “${target.shortDefinition ?? target.word}”.`,
        },
      });
    }
  });
  return out;
}

/**
 * Discrimination Trainer (§14): top confusion pairs with drill history,
 * side-by-side comparison cards, and interleaved rapid-fire drills.
 */
export default function DiscriminationPage() {
  const confusion = useProgress((s) => s.confusion);
  const lab = useLabRound('discrimination');
  const [drill, setDrill] = useState<{ edge: ConfusionEdge; items: { item: SessionItem; word: WordRecord }[]; idx: number } | null>(null);
  const [drillDone, setDrillDone] = useState(false);

  const pairs = useMemo(
    () => [...confusion].filter((e) => e.weight >= 1).sort((x, y) => y.weight - x.weight),
    [confusion],
  );

  const startDrill = async (edge: ConfusionEdge): Promise<void> => {
    const a = WORD_MAP[edge.a];
    const b = WORD_MAP[edge.b];
    if (!a || !b) return;
    const speech = await getSpeechAvailable();
    const items = buildDrill(a, b, speech);
    setDrillDone(false);
    setDrill({ edge, items, idx: 0 });
    lab.start(items[0]!.item, items[0]!.word);
  };

  const drillAdvance = (): void => {
    if (!drill) return;
    if (drill.idx + 1 < drill.items.length) {
      const ni = drill.idx + 1;
      setDrill({ ...drill, idx: ni });
      lab.start(drill.items[ni]!.item, drill.items[ni]!.word);
    } else {
      setDrillDone(true);
    }
  };

  if (drill && lab.item && lab.word && lab.activityProps) {
    const a = WORD_MAP[drill.edge.a]!;
    const b = WORD_MAP[drill.edge.b]!;
    const current = drill.items[drill.idx]!;
    return (
      <div>
        <PageHeader title={`${a.word} / ${b.word}`} sub={`Drill ${drill.idx + 1} of ${drill.items.length}`} />
        <Card key={lab.roundKey}>
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {([a, b] as const).map((w) => (
              <div key={w.id} className="rounded-lg border border-line p-3">
                <p className="font-display text-2xl">{w.word}</p>
                <p className="text-[15px]">{w.shortDefinition}</p>
                <BengaliText bengali={w.bengali} />
                <p className="mt-1 text-sm text-ink-soft">{highlightWord(w.sentence, w.word, w.forms ?? [])}</p>
              </div>
            ))}
          </div>
          <p className="mb-4 rounded-lg bg-accent-soft px-3 py-2 text-[15px]">
            <strong>Signature distinction:</strong> {signature(a, b)}
          </p>
          {current.item.dimension === 'spelling' || !current.item.options ? (
            <TypedRecallActivity {...lab.activityProps} />
          ) : (
            <McqActivity
              {...lab.activityProps}
              optionWordIds={(current.item.options ?? []).map((o) => (o === a.word ? a.id : o === b.word ? b.id : null))}
              speakText={current.item.dimension === 'listening' ? current.item.answer : undefined}
              autoPlay={current.item.dimension === 'listening'}
            />
          )}
          {lab.phase === 'feedback' && !drillDone && (
            <Button className="mt-4" onClick={drillAdvance} autoFocus>
              {drill.idx + 1 < drill.items.length ? 'Next' : 'Finish drill'}
            </Button>
          )}
          {drillDone && lab.phase === 'feedback' && (
            <div className="mt-4">
              <p className="text-lg">Drill complete — {lab.tally.correct}/{lab.tally.total} correct. Three clean drills in a row halve this confusion.</p>
              <div className="mt-2 flex gap-2">
                <Button variant="secondary" onClick={() => { setDrill(null); }}>Back to pairs</Button>
                <Button variant="secondary" onClick={() => void startDrill(drill.edge)}>Drill again</Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Discrimination Trainer" sub="Separate the words you mix up." />
      {pairs.length === 0 ? (
        <EmptyState
          title="No confusion pairs yet"
          body="When you mix two words up — a wrong choice, a near-miss spelling — they'll appear here with a targeted drill. Clean answering keeps this list empty."
        />
      ) : (
        <ul className="space-y-2">
          {pairs.map((e) => {
            const a = WORD_MAP[e.a];
            const b = WORD_MAP[e.b];
            if (!a || !b) return null;
            return (
              <li key={`${e.a}-${e.b}`}>
                <Card className="flex flex-wrap items-center gap-3">
                  <p className="font-display text-xl">{a.word} <span className="text-ink-soft">/</span> {b.word}</p>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${e.weight >= 2 ? 'bg-warn-soft text-warn' : 'bg-paper-deep text-ink-soft'}`}>
                    {e.weight >= 2 ? 'needs a drill' : 'watching'}
                  </span>
                  <span className="text-sm text-ink-soft">last mixed {relTime(e.lastAt)}{e.resolvedStreak > 0 ? ` · ${e.resolvedStreak}/3 clean` : ''}</span>
                  <span className="ml-auto flex gap-2">
                    <Link to={`/word/${a.id}`} className="inline-flex min-h-[44px] items-center text-sm text-accent-deep underline dark:text-accent">Compare</Link>
                    <Button variant="secondary" onClick={() => void startDrill(e)}>Drill</Button>
                  </span>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

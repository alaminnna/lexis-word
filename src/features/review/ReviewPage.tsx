import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { WORDS, WORD_MAP } from '../../data/words';
import { buildSession } from '../../core/engine/session-builder';
import { progressSnapshot, useProgress } from '../../store/progress';
import { settingsSnapshot } from '../../store/settings';
import { useSessionPersist } from '../../store/session';
import { atRiskWordIds, dueCounts, todayInputs } from '../../store/selectors';
import { PageHeader } from '../../app/layout';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { Icon } from '../../components/ui/Icon';

/**
 * Review Hub: due counts by type with targeted review sessions (§17).
 * Targeted plans reuse the adaptive builder on a constrained word subset.
 */
export default function ReviewPage() {
  const navigate = useNavigate();
  const words = useProgress((s) => s.words);
  const launchPlan = useSessionPersist((s) => s.launchPlan);
  const now = Date.now();

  const counts = useMemo(() => dueCounts(words, now), [words, now]);
  const atRisk = useMemo(() => atRiskWordIds(words, now), [words, now]);

  const startReview = (filter: string, ids: string[]): void => {
    const subset = ids.map((id) => WORD_MAP[id]).filter((w): w is (typeof WORDS)[number] => !!w);
    if (subset.length === 0) return;
    const full = progressSnapshot();
    const settings = settingsSnapshot();
    const { introducedToday, daysSinceActive, rolling } = todayInputs(full, Date.now());
    const speechAvailable = typeof window !== 'undefined' && 'speechSynthesis' in window;
    const plan = buildSession({
      words: subset, progress: full.words, confusion: full.confusion, settings,
      seed: settings.seed + Math.floor(Date.now() / 86_400_000) + filter.length * 97 + (Date.now() % 997),
      now: Date.now(), introducedToday, daysSinceActive, rollingSuccess: rolling,
      speechAvailable,
    });
    if (plan.items.length === 0) return;
    plan.id = `rev_${filter}_${Date.now().toString(36)}`;
    plan.meta = { kind: 'review', filter };
    launchPlan(plan);
    navigate('/learn');
  };

  const dueIds = useMemo(() => {
    const ids: string[] = [];
    for (const id of Object.keys(words)) {
      const p = words[id]!;
      if (p.introducedAt === 0) continue;
      if (Object.values(p.dimensions).some((d) => d.attempts > 0 && d.nextDueAt <= now)) ids.push(id);
    }
    return ids;
  }, [words, now]);

  const dimIds = (dim: 'recall' | 'listening' | 'spelling'): string[] =>
    dueIds.filter((id) => {
      const st = words[id]!.dimensions[dim];
      return st.attempts > 0 && st.nextDueAt <= now;
    });

  const cards = [
    { key: 'all', title: 'All due reviews', count: counts.all, ids: dueIds, blurb: 'Everything due, weakest first.' },
    { key: 'recall', title: 'Recall', count: counts.recall, ids: dimIds('recall'), blurb: 'Produce the word from memory.' },
    { key: 'listening', title: 'Listening', count: counts.listening, ids: dimIds('listening'), blurb: 'Hear it, pin it down.' },
    { key: 'spelling', title: 'Spelling', count: counts.spelling, ids: dimIds('spelling'), blurb: 'Letter-perfect production.' },
    { key: 'atrisk', title: 'At-risk words', count: counts.atRisk, ids: atRisk, blurb: 'Predicted to fade — catch them now.' },
  ];

  if (dueIds.length === 0 && atRisk.length === 0) {
    return (
      <div>
        <PageHeader title="Review" sub="Targeted sessions for what needs you most." />
        <EmptyState
          title="Nothing due"
          body="Your memory model is quiet — every introduced word is holding. New words arrive with your daily budget."
          action={<Button onClick={() => navigate('/learn')}>Study anyway</Button>}
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Review" sub="Targeted sessions for what needs you most." />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {cards.map((c) => (
          <Card key={c.key} className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <h2 className="font-display text-xl">{c.title}</h2>
              <span className="font-display text-3xl text-accent-deep dark:text-accent">{c.count}</span>
            </div>
            <p className="text-sm text-ink-soft">{c.blurb}</p>
            <div className="mt-auto pt-2">
              <Button variant="secondary" disabled={c.ids.length === 0} onClick={() => startReview(c.key, c.ids)}>
                Start review <Icon name="arrow-right" size={16} />
              </Button>
            </div>
          </Card>
        ))}
      </div>
      {dueIds.length > 0 && (
        <p className="mt-4 text-sm text-ink-soft">
          Due now includes: {dueIds.slice(0, 8).map((id) => WORD_MAP[id]?.word ?? id).join(' · ')}
          {dueIds.length > 8 ? ` · +${dueIds.length - 8} more` : ''} — <Link to="/library" className="underline">browse all</Link>
        </p>
      )}
    </div>
  );
}

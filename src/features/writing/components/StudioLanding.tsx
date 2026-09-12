import { Link } from 'react-router-dom';
import { PageHeader } from '../../../app/layout';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Icon } from '../../../components/ui/Icon';
import type { RecentWriting, WritingTarget, WritingTaskKind } from '../writingSelectors';

const MODE_CARDS: { task: WritingTaskKind; title: string; body: string; minutes: string; icon: 'type' | 'swap' | 'pen' }[] = [
  { task: 'frame', title: 'Guided Frame', body: 'Complete an academic sentence with the natural partner word.', minutes: '≈ 3 min', icon: 'type' },
  { task: 'transform', title: 'Register Transformation', body: 'Rewrite an informal sentence in academic register.', minutes: '≈ 4 min', icon: 'swap' },
  { task: 'free', title: 'Free Production', body: 'Write original sentences you could use in Task 2.', minutes: '≈ 5 min', icon: 'pen' },
];

/**
 * Writing Studio landing (§10): recommended targets from real progress,
 * writing modes, and recent attempts. Never a wall of words, never invented.
 */
export function StudioLanding({ targets, recent, hasWords, onPractice, onMode }: {
  targets: WritingTarget[];
  recent: RecentWriting[];
  hasWords: boolean;
  onPractice: (target: WritingTarget) => void;
  onMode: (task: WritingTaskKind) => void;
}) {
  return (
    <div className="space-y-5">
      <PageHeader
        title="Writing Studio"
        sub="Turn vocabulary knowledge into usable academic language."
      />

      {!hasWords ? (
        <EmptyState
          title="Meet some words first"
          body="The Studio builds writing tasks from words you've already met. Start a session to unlock it."
          action={<Link to="/learn" className="inline-flex min-h-[44px] items-center rounded-lg bg-accent px-5 py-2.5 font-medium text-paper">Begin session</Link>}
        />
      ) : (
        <>
          <section aria-labelledby="ws-recommended">
            <h2 id="ws-recommended" className="mb-2 font-display text-xl">Recommended for you</h2>
            {targets.length === 0 ? (
              <p className="text-ink-soft">Nothing pressing — pick a mode below to keep words active.</p>
            ) : (
              <ul className="grid grid-cols-1 gap-3 md:grid-cols-3">
                {targets.map((t, i) => (
                  <li key={t.word.id}>
                    <Card className="flex h-full flex-col gap-1">
                      <p className="text-xs font-medium tracking-wide text-ink-faint uppercase">Target {i + 1}</p>
                      <p className="font-display text-2xl">{t.word.word}</p>
                      <p className="text-sm text-ink-soft">{t.word.shortDefinition}</p>
                      <p className="text-sm">{t.reason}</p>
                      <p className="text-xs text-ink-faint">{t.task === 'frame' ? 'Guided frame' : t.task === 'transform' ? 'Register transformation' : 'Free production'} · {t.minutes} min</p>
                      <div className="mt-auto pt-2">
                        <Button variant="secondary" onClick={() => onPractice(t)}>
                          Practice this word <Icon name="arrow-right" size={16} />
                        </Button>
                      </div>
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="ws-modes">
            <h2 id="ws-modes" className="mb-2 font-display text-xl">Writing modes</h2>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {MODE_CARDS.map((m) => (
                <button
                  key={m.task}
                  onClick={() => onMode(m.task)}
                  className="group flex items-start gap-3 rounded-xl border border-line p-5 text-left transition-calm hover:border-accent"
                >
                  <Icon name={m.icon} size={24} className="mt-0.5 shrink-0 text-ink-soft group-hover:text-accent-deep dark:group-hover:text-accent" />
                  <span>
                    <span className="block font-display text-xl">{m.title}</span>
                    <span className="mt-1 block text-[15px] text-ink-soft">{m.body}</span>
                    <span className="mt-1 block text-xs text-ink-faint">{m.minutes}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section aria-labelledby="ws-recent">
            <h2 id="ws-recent" className="mb-2 font-display text-xl">Recent writing</h2>
            {recent.length === 0 ? (
              <p className="text-ink-soft">No writing yet — your attempts will appear here.</p>
            ) : (
              <ul className="divide-y divide-line rounded-xl border border-line">
                {recent.map((r, i) => (
                  <li key={`${r.wordId}-${r.timestamp}-${i}`} className="flex items-center gap-2 px-4 py-2.5 text-[15px]">
                    <Icon name={r.correct ? 'check' : 'x'} size={16} className={r.correct ? 'text-good' : 'text-bad'} />
                    <Link to={`/word/${r.wordId}`} className="font-medium underline-offset-2 hover:underline">{r.word}</Link>
                    <span className="ml-auto text-sm text-ink-faint">
                      {new Date(r.timestamp).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

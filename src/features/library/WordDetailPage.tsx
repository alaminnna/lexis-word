import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { DictionaryEntry } from '../../types/domain';
import { WORD_MAP, WORDS } from '../../data/words';
import { dictionary } from '../../services/dictionary';
import { useProgress } from '../../store/progress';
import { useSessionPersist } from '../../store/session';
import { buildSession } from '../../core/engine/session-builder';
import { progressSnapshot } from '../../store/progress';
import { settingsSnapshot } from '../../store/settings';
import { todayInputs } from '../../store/selectors';
import { DIMENSIONS } from '../../types/domain';
import { retentionOf } from '../../core/engine/mastery';
import { computeStage, STAGE_NAMES } from '../../core/engine/stages';
import { SPELLING_ERROR_LABELS, type SpellingErrorKind } from '../../core/engine/errors';
import { dayKey } from '../../utils/time';
import { WordHero } from '../../components/ui/WordHero';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { SkeletonBlock } from '../../components/ui/Skeleton';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { Icon } from '../../components/ui/Icon';
import { highlightWord } from '../session/activities/highlight';
import { topicOf } from '../../core/topics';
import { wordStageName } from '../roadmap/RoadmapPage';

function relTime(ts: number, now: number): string {
  if (!ts) return 'never';
  const mins = Math.round((now - ts) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

function dueText(ts: number, now: number): string {
  if (!ts) return 'not scheduled yet';
  if (ts <= now) return 'due now';
  const hours = Math.round((ts - now) / 3_600_000);
  if (hours < 24) return `due in ${hours} h`;
  const days = Math.round(hours / 24);
  return `due in ${days} day${days === 1 ? '' : 's'}`;
}

/**
 * Word Detail: the complete word workspace — hero, enrichment (with skeletons
 * + offline fallback), forms, examples with sources, mastery panel, confusion
 * links, error profile, history, and focused practice.
 */
export default function WordDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const word = id ? WORD_MAP[id] : undefined;
  const progress = useProgress((s) => (id ? s.words[id] : undefined));
  const events = useProgress((s) => s.events);
  const confusion = useProgress((s) => s.confusion);
  const launchPlan = useSessionPersist((s) => s.launchPlan);
  const [entry, setEntry] = useState<DictionaryEntry | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const now = Date.now();

  useEffect(() => {
    if (!word) return;
    setEntry(undefined);
    setFailed(false);
    let cancelled = false;
    void dictionary.lookup(word.word).then((r) => {
      if (cancelled) return;
      setEntry(r.entry);
      setFailed(r.source === 'failed');
    });
    return () => {
      cancelled = true;
    };
  }, [word]);

  if (!word) {
    return (
      <EmptyState
        title="Word not found"
        body="This word isn't in the 499-word list."
        action={<Button onClick={() => navigate('/library')}>Back to library</Button>}
      />
    );
  }

  const stage = progress ? computeStage(progress) : 0;
  const history = events.filter((e) => e.wordId === word.id).slice(-8).reverse();
  const edges = confusion.filter((e) => e.a === word.id || e.b === word.id);
  const errorEntries = progress
    ? (Object.entries(progress.errorProfile) as [SpellingErrorKind, number][]).sort((a, b) => b[1] - a[1])
    : [];

  const practice = (): void => {
    const full = progressSnapshot();
    const settings = settingsSnapshot();
    const { introducedToday, daysSinceActive, rolling } = todayInputs(full, Date.now());
    const plan = buildSession({
      words: [word], progress: full.words, confusion: full.confusion, settings,
      seed: settings.seed + word.rank, now: Date.now(), introducedToday,
      daysSinceActive, rollingSuccess: rolling, speechAvailable: true,
    });
    plan.id = `prac_${word.id}_${Date.now().toString(36)}`;
    plan.meta = { kind: 'practice', wordId: word.id };
    // A brand-new word starts with its Meet card inside the focused session.
    launchPlan(plan);
    navigate('/learn');
  };

  return (
    <div className="space-y-5">
      <button onClick={() => navigate(-1)} className="inline-flex min-h-[44px] cursor-pointer items-center gap-1 text-sm text-ink-soft hover:text-ink">
        <Icon name="chevron-left" size={16} /> Back
      </button>

      <WordHero word={word} recallStrength={progress?.dimensions.recall.strength ?? 0} large />
      <p className="text-sm text-ink-faint">
        {wordStageName(word.stage)} · word {word.rank} of {WORDS.length} · Topic: {topicOf(word)}
      </p>

      <div>
        <Button onClick={practice}><Icon name="play" size={16} /> Practice this word now</Button>
      </div>

      {/* Enrichment: skeletons first, local fallback when offline */}
      <Card>
        <h2 className="mb-2 font-display text-xl">Definitions</h2>
        {entry === undefined && <SkeletonBlock lines={3} />}
        {entry === null && (
          <div>
            <p className="text-ink-soft">
              {failed
                ? 'No enriched data — the dictionary is offline. Your local definition still works fully:'
                : 'No enriched data for this word yet. Your local definition:'}
            </p>
            <p className="mt-1">{word.shortDefinition}</p>
            {failed && (
              <Button variant="secondary" className="mt-2" onClick={() => {
                setEntry(undefined);
                void dictionary.retry(word.word).then((r) => {
                  setEntry(r.entry);
                  setFailed(r.source === 'failed');
                });
              }}>
                <Icon name="refresh" size={16} /> Retry
              </Button>
            )}
          </div>
        )}
        {entry && (
          <div className="space-y-4">
            {entry.defs.length === 0 && (
              <p className="text-ink-soft">No enriched definitions — your local one: <strong className="text-ink">{word.shortDefinition}</strong></p>
            )}
            {entry.defs.map((d, i) => (
              <div key={i}>
                {d.forms.length > 0 && <p className="text-sm text-ink-faint">Family: {d.forms.join(' · ')}</p>}
                {d.definitions.map((def, j) => (
                  <div key={j} className="mt-2">
                    <p>
                      {def.pos && <span className="mr-2 text-sm tracking-wide text-ink-faint uppercase">{def.pos}</span>}
                      {def.def}
                    </p>
                    {def.examples.slice(0, 2).map((ex, k) => (
                      <p key={k} className="mt-1 border-l-2 border-accent pl-3 text-[15px] text-ink-soft">
                        “{ex.sentence}”{ex.source && <span className="block text-xs text-ink-faint">{ex.source}</span>}
                      </p>
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <h2 className="mb-2 font-display text-xl">In context</h2>
        <p className="text-[15px] leading-relaxed">{highlightWord(word.sentence, word.word, word.forms ?? [])}</p>
        <p className="mt-1 text-xs text-ink-faint">Study example</p>
        {entry && entry.examples.length > 0 && (
          <div className="mt-3 space-y-2">
            {entry.examples.slice(0, 3).map((ex, k) => (
              <p key={k} className="border-l-2 border-line-strong pl-3 text-[15px] text-ink-soft">
                “{ex.sentence}”{ex.source && <span className="block text-xs text-ink-faint">{ex.source}</span>}
              </p>
            ))}
          </div>
        )}
      </Card>

      {/* Mastery panel: per-dimension strength, last review, next due, stage */}
      <Card>
        <h2 className="mb-1 font-display text-xl">Mastery</h2>
        <p className="mb-3 text-ink-soft">Stage: <strong className="text-ink">{STAGE_NAMES[stage]}</strong></p>
        {!progress || progress.introducedAt === 0 ? (
          <p className="text-ink-soft">Not introduced yet — meet it in a session to begin tracking.</p>
        ) : (
          <div className="space-y-3">
            {DIMENSIONS.map((d) => {
              const st = progress.dimensions[d];
              const r = retentionOf(st, now);
              return (
                <div key={d}>
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="font-medium capitalize">{d}</span>
                    <span className="text-ink-faint">
                      {Math.round(st.strength)}/100 · {st.attempts === 0 ? 'not tried' : `last ${relTime(st.lastReviewedAt, now)} · ${dueText(st.nextDueAt, now)}`}
                      {r.atRisk && st.attempts > 0 ? ' · fading' : ''}
                    </span>
                  </div>
                  <ProgressBar value={st.strength} label={`${d} strength`} className="[&>div:first-child]:hidden" />
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {edges.length > 0 && (
        <Card>
          <h2 className="mb-2 font-display text-xl">Easily confused with</h2>
          <ul className="space-y-1">
            {edges.map((e) => {
              const otherId = e.a === word.id ? e.b : e.a;
              const other = WORD_MAP[otherId];
              if (!other) return null;
              return (
                <li key={`${e.a}-${e.b}`}>
                  <Link to={`/word/${otherId}`} className="text-accent-deep underline dark:text-accent">
                    {other.word}
                  </Link>{' '}
                  <span className="text-sm text-ink-faint">
                    — mixed up {e.weight >= 2 ? 'often; a drill is scheduled' : 'before'}{' '}
                    (<Link to="/labs/discrimination" className="underline">open trainer</Link>)
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {errorEntries.length > 0 && (
        <Card>
          <h2 className="mb-2 font-display text-xl">Your spelling slips</h2>
          <ul className="list-disc pl-5 text-[15px] text-ink-soft">
            {errorEntries.map(([kind, n]) => (
              <li key={kind}>{SPELLING_ERROR_LABELS[kind]} — {n} time{n === 1 ? '' : 's'}</li>
            ))}
          </ul>
          <Link to="/labs/spelling" className="mt-2 inline-block text-sm text-accent-deep underline dark:text-accent">
            Fix these in the Spelling Lab
          </Link>
        </Card>
      )}

      {history.length > 0 && (
        <Card>
          <h2 className="mb-2 font-display text-xl">Recent attempts</h2>
          <ul className="space-y-1 text-sm text-ink-soft">
            {history.map((e) => (
              <li key={e.id} className="flex items-center gap-2">
                <Icon name={e.correct ? 'check' : 'x'} size={15} className={e.correct ? 'text-good' : 'text-bad'} />
                {e.activity} · {e.dimension} · {new Date(e.timestamp).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                {e.detail?.typed ? ` · “${e.detail.typed}”` : ''}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-ink-faint">Logged {dayKey(history[0]!.timestamp) === dayKey(now) ? 'today' : 'earlier'} · full history powers Insights.</p>
        </Card>
      )}
    </div>
  );
}

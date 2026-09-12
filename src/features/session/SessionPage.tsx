import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { SessionPlan } from '../../types/domain';
import { WORDS } from '../../data/words';
import { buildSession } from '../../core/engine/session-builder';
import { getSpeechAvailable } from '../../services/speech';
import { progressSnapshot } from '../../store/progress';
import { settingsSnapshot, useSettings } from '../../store/settings';
import { useSessionPersist } from '../../store/session';
import { todayInputs } from '../../store/selectors';
import { SessionRunner } from './SessionRunner';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { SkeletonBlock } from '../../components/ui/Skeleton';

type Entry =
  | { kind: 'plan'; plan: SessionPlan; startIndex: number; replanned: boolean }
  | { kind: 'resume' }
  | { kind: 'empty' };

async function buildFresh(): Promise<SessionPlan> {
  const snap = progressSnapshot();
  const settings = settingsSnapshot();
  const { introducedToday, daysSinceActive, rolling } = todayInputs(snap, Date.now());
  const speech = await getSpeechAvailable();
  const seed = settings.seed + Math.floor(Date.now() / 86_400_000) + (Date.now() % 997);
  return buildSession({
    words: WORDS, progress: snap.words, confusion: snap.confusion, settings,
    seed, now: Date.now(), introducedToday, daysSinceActive,
    rollingSuccess: rolling, speechAvailable: speech,
  });
}

/**
 * /learn entry: launched plan (checkpoint / review / lab / word practice) →
 * saved resume → fresh adaptive plan. Launches are consumed inside a guarded
 * effect — consuming during render broke under StrictMode's double pass and
 * silently discarded checkpoints and word-practice plans.
 */
export default function SessionPage() {
  const navigate = useNavigate();
  const clearSaved = useSessionPersist((s) => s.clear);
  const displayName = useSettings((s) => s.displayName);
  const [entry, setEntry] = useState<Entry | null>(null);
  const [loading, setLoading] = useState(true);
  const startedRef = useRef(false);

  useEffect(() => {
    // StrictMode double-passes effects on the same instance; the ref keeps the
    // first (authoritative) decision from being overwritten by a null re-read.
    if (startedRef.current) return;
    startedRef.current = true;
    const store = useSessionPersist.getState();
    const launch = store.launch;
    if (launch && launch.items.length > 0) {
      store.clearLaunch();
      // Launches (review/lab/word practice) may have been built assuming voice.
      // Replan the same way resume does when voice is gone.
      void getSpeechAvailable().then((speech) => {
        const hasListening = launch.items.some((i) => i.dimension === 'listening');
        if (hasListening && !speech) {
          buildFresh()
            .then((plan) => applyPlan(plan, { replanned: true }))
            .catch(() => setEntry({ kind: 'empty' }))
            .finally(() => setLoading(false));
        } else {
          setEntry({ kind: 'plan', plan: launch, startIndex: 0, replanned: false });
          setLoading(false);
        }
      });
      return;
    }
    const saved = store.saved;
    if (saved && saved.plan.items.length > 0) {
      setEntry({ kind: 'resume' });
      setLoading(false);
      return;
    }
    setEntry({ kind: 'empty' });
    buildFresh()
      .then((plan) => applyPlan(plan))
      .catch(() => setEntry({ kind: 'empty' }))
      .finally(() => setLoading(false));
  }, []);

  // Leaving /learn without consuming a launch must not leak it into a later visit.
  useEffect(() => () => { useSessionPersist.getState().clearLaunch(); }, []);

  const applyPlan = (plan: SessionPlan, opts: { startIndex?: number; replanned?: boolean } = {}): void => {
    // A 0-item plan must never reach the runner (it would flash an empty
    // "Session complete" summary). The builder guarantees items in every
    // reachable state; this guard is the last line of defense.
    if (plan.items.length === 0) {
      setEntry({ kind: 'empty' });
      return;
    }
    setEntry({ kind: 'plan', plan, startIndex: opts.startIndex ?? 0, replanned: opts.replanned ?? false });
  };

  const startFreshFrom = (afterClear: () => void, replanned = false): void => {
    afterClear();
    setLoading(true);
    setEntry(null);
    buildFresh()
      .then((plan) => applyPlan(plan, { replanned }))
      .catch(() => setEntry({ kind: 'empty' }))
      .finally(() => setLoading(false));
  };

  if (loading || entry === null) {
    return (
      <div aria-label="Planning your session">
        <SkeletonBlock lines={4} />
      </div>
    );
  }

  if (entry.kind === 'resume') {
    const saved = useSessionPersist.getState().saved;
    if (!saved) {
      // Desync (saved cleared elsewhere): offer the standard actions instead.
      return (
        <EmptyState
          title="All caught up"
          body="Nothing is scheduled this second — you can run an optional practice round."
          action={<Button onClick={() => startFreshFrom(() => undefined)}>Start a practice session</Button>}
        />
      );
    }
    const left = saved.plan.items.length - saved.index;
      return (
        <div className="mx-auto w-full max-w-xl py-8">
          <h1 className="font-display text-3xl font-medium tracking-tight">Welcome back{displayName ? `, ${displayName}` : ''}</h1>
          <p className="mt-2 text-lg text-ink-soft">
            Your last session was interrupted with {left} item{left === 1 ? '' : 's'} left.
            Everything you answered is already saved.
          </p>
          <div className="mt-6 flex gap-2">
            <Button
              onClick={() => {
                void getSpeechAvailable().then((speech) => {
                  const hasListening = saved.plan.items.some((i) => i.dimension === 'listening');
                  if (hasListening && !speech) {
                    // Voice disappeared since the plan was built — rebuild without it.
                    startFreshFrom(() => undefined, true);
                  } else {
                    applyPlan(saved.plan, {
                      startIndex: Math.min(saved.index, saved.plan.items.length - 1),
                    });
                  }
                });
              }}
            >
              Resume session
            </Button>
            <Button variant="secondary" onClick={() => startFreshFrom(clearSaved)}>
              Start fresh instead
            </Button>
          </div>
        </div>
      );
  }

  if (entry.kind === 'empty') {
    return (
      <EmptyState
        title="All caught up"
        body="Nothing is scheduled this second — new words arrive with your daily budget and reviews return on time. You can still run an optional practice round on what you've already seen."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={() => startFreshFrom(() => undefined)}>Start a practice session</Button>
            <Button variant="secondary" onClick={() => navigate('/library')}>Browse words</Button>
          </div>
        }
      />
    );
  }

  return <SessionRunner plan={entry.plan} startIndex={entry.startIndex} replanned={entry.replanned} />;
}

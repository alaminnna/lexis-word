import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { SessionPlan } from '../../types/domain';
import { WORDS } from '../../data/words';
import { buildSession } from '../../core/engine/session-builder';
import { getSpeechAvailable } from '../../services/speech';
import { dictionary } from '../../services/dictionary';
import { progressSnapshot, useProgress } from '../../store/progress';
import { settingsSnapshot, useSettings } from '../../store/settings';
import { useSessionPersist } from '../../store/session';
import { activeWordIds, dueCounts, prefetchWordIds, stageGates, todayInputs } from '../../store/selectors';
import { dayKey } from '../../utils/time';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Icon } from '../../components/ui/Icon';
import { SkeletonBlock } from '../../components/ui/Skeleton';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

/**
 * Today (home): only the next useful action — never the 500-word wall (§0).
 * Greeting, plan summary, one CTA, lab entries, overdue warning, quiet stats.
 */
export default function TodayPage() {
  const navigate = useNavigate();
  const words = useProgress((s) => s.words);
  const daily = useProgress((s) => s.daily);
  const settings = useSettings();
  const saved = useSessionPersist((s) => s.saved);
  const launchPlan = useSessionPersist((s) => s.launchPlan);
  const [preview, setPreview] = useState<SessionPlan | null>(null);
  const runToken = useRef(0);

  const snap = useMemo(
    () => ({ words, daily }),
    [words, daily],
  );

  useEffect(() => {
    runToken.current += 1;
    const myRun = runToken.current;
    void (async () => {
      const full = progressSnapshot();
      const st = settingsSnapshot();
      const { introducedToday, daysSinceActive, rolling } = todayInputs(full, Date.now());
      const speech = await getSpeechAvailable();
      if (runToken.current !== myRun) return;
      const plan = buildSession({
        words: WORDS, progress: full.words, confusion: full.confusion, settings: st,
        seed: st.seed + Math.floor(Date.now() / 86_400_000), now: Date.now(),
        introducedToday, daysSinceActive, rollingSuccess: rolling, speechAvailable: speech,
      });
      if (runToken.current === myRun) setPreview(plan);
    })();
    // Background prefetch of tomorrow's enrichment (§4 session isolation).
    const full = progressSnapshot();
    dictionary.prefetch(prefetchWordIds(full.words, settingsSnapshot(), Date.now()).map(
      (id) => WORDS.find((w) => w.id === id)?.word ?? id,
    ));
    return () => {
      runToken.current += 1;
    };
  }, [words, daily, settings.sessionLengthTarget, settings.dailyNewTarget, settings.maxActiveWords, settings.seed]);

  const now = Date.now();
  const fullState = { ...progressSnapshot(), words: snap.words, daily: snap.daily };
  const counts = dueCounts(snap.words, now);
  const active = activeWordIds(snap.words);
  const gates = stageGates(snap.words);
  const currentStage = gates.find((g) => !g.sealed) ?? gates[gates.length - 1]!;
  const todayLog = snap.daily[dayKey(now)];
  const overdue = useMemo(() => {
    let n = 0;
    for (const id of Object.keys(snap.words)) {
      const p = snap.words[id]!;
      if (p.introducedAt === 0) continue;
      const dims = Object.values(p.dimensions);
      if (dims.some((d) => d.attempts > 0 && (now - d.nextDueAt) / 86_400_000 > 2)) n++;
    }
    return n;
  }, [snap.words, now]);
  void fullState;

  const newCount = preview?.items.filter((i) => i.activity === 'meet').length ?? 0;
  const reviewCount = (preview?.items.length ?? 0) - newCount;
  const minutes = Math.max(1, Math.round((preview?.items.length ?? settings.sessionLengthTarget) * 0.8));

  const begin = (): void => {
    // Launch the previewed plan when it's ready; /learn always builds its own
    // otherwise — the CTA must never be a dead button while planning.
    if (preview && preview.items.length > 0) launchPlan(preview);
    navigate('/learn');
  };

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-display text-[clamp(1.75rem,5vw,2.5rem)] font-medium tracking-tight">
          {greeting()}{settings.displayName ? `, ${settings.displayName}` : ''}.
        </h1>
        {preview ? (
          <p className="mt-1 text-lg text-ink-soft">
            {newCount > 0 && <><strong className="font-medium text-ink">{newCount} new</strong> · </>}
            {reviewCount} review{reviewCount === 1 ? '' : 's'} · ≈ {minutes} min today.
          </p>
        ) : (
          <div className="mt-2 max-w-xs"><SkeletonBlock lines={1} /></div>
        )}
      </header>

      {saved && saved.plan.items.length > 0 && (
        <Card>
          <p className="font-medium">Interrupted session waiting</p>
          <p className="text-ink-soft">{saved.plan.items.length - saved.index} items left — your answers are saved.</p>
          <Button className="mt-3" variant="secondary" onClick={() => navigate('/learn')}>Resume</Button>
        </Card>
      )}

      <Button onClick={begin} className="w-full py-3.5 text-lg sm:w-auto">
        Begin session <Icon name="arrow-right" size={18} />
      </Button>

      {overdue > 0 && (
        <div className="rounded-xl border border-warn/30 bg-warn-soft p-4">
          <p>
            <strong className="font-medium">{overdue} review{overdue === 1 ? '' : 's'} {overdue === 1 ? 'is' : 'are'} overdue</strong>
            {' '}— memory fades; let&apos;s catch up.{' '}
            <Link to="/review" className="font-medium text-accent-deep underline dark:text-accent">Open Review</Link>
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-x-8 gap-y-2 border-t border-line pt-4 text-[15px] text-ink-soft">
        <span><strong className="font-medium text-ink">{active.length}</strong> words in active memory</span>
        <span>Stage <strong className="font-medium text-ink">{currentStage.stage + 1}</strong> of 10</span>
        {todayLog && todayLog.itemsAnswered > 0 && (
          <span><strong className="font-medium text-ink">{todayLog.itemsAnswered}</strong> answered today</span>
        )}
      </div>

      <nav aria-label="Practice spaces" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {([
          { to: '/labs/listening', icon: 'headphones', t: 'Listening Lab', d: 'Hear it, pin it down' },
          { to: '/labs/spelling', icon: 'type', t: 'Spelling Lab', d: 'Build it letter by letter' },
          { to: '/writing', icon: 'pen', t: 'Writing Studio', d: 'Use words in essays' },
        ] as const).map((l) => (
          <Link
            key={l.to}
            to={l.to}
            className="group flex items-center gap-3 rounded-xl border border-line p-4 transition-calm hover:border-accent"
          >
            <Icon name={l.icon} size={22} className="shrink-0 text-ink-soft group-hover:text-accent-deep dark:group-hover:text-accent" />
            <span>
              <span className="block font-medium">{l.t}</span>
              <span className="block text-sm text-ink-soft">{l.d}</span>
            </span>
          </Link>
        ))}
      </nav>

      {counts.atRisk > 0 && (
        <p className="text-sm text-ink-faint">
          {counts.atRisk} word{counts.atRisk === 1 ? '' : 's'} fading — {counts.all} due in total.{' '}
          <Link to="/review" className="underline">Review now</Link>
        </p>
      )}
    </div>
  );
}

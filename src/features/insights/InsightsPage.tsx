import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import type { ActivityType, DimensionKey } from '../../types/domain';
import { DIMENSIONS } from '../../types/domain';
import { WORDS, WORD_MAP } from '../../data/words';
import { retentionForecast, paceProjection } from '../../core/engine/projections';
import { stageDistribution } from '../../core/engine/stages';
import { STAGE_NAMES } from '../../core/engine/stages';
import { aggregateErrorProfile, SPELLING_ERROR_LABELS } from '../../core/engine/errors';
import { activeWordIds, dimensionAverages } from '../../store/selectors';
import { useProgress } from '../../store/progress';
import { PageHeader } from '../../app/layout';
import { Card } from '../../components/ui/Card';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { Icon } from '../../components/ui/Icon';
import { DAY_MS } from '../../utils/time';
import { formatDayMonth } from '../../utils/time';

const COLLECTING = 'Collecting data — answer a little more and this insight will appear.';

/**
 * Progress & Insights (§21): meaningful metrics only, computed from the event
 * log. No vanity statistics. Insufficient data renders as "Collecting data…".
 */
export default function InsightsPage() {
  const words = useProgress((s) => s.words);
  const events = useProgress((s) => s.events);
  const daily = useProgress((s) => s.daily);
  const confusion = useProgress((s) => s.confusion);
  const now = Date.now();

  const forecast = useMemo(() => retentionForecast(words, now, 7), [words, now]);
  const dist = useMemo(() => stageDistribution(words), [words]);
  const atRisk = useMemo(() => {
    let n = 0;
    for (const id of Object.keys(words)) {
      const p = words[id]!;
      if (p.introducedAt > 0 && p.masteryStage < 5 &&
        Object.values(p.dimensions).some((d) => d.attempts > 0 && d.strength < 60)) n++;
    }
    return n;
  }, [words]);

  const byActivity = useMemo(() => {
    const map = new Map<ActivityType, { n: number; ok: number }>();
    for (const e of events) {
      const cur = map.get(e.activity) ?? { n: 0, ok: 0 };
      cur.n++;
      if (e.correct) cur.ok++;
      map.set(e.activity, cur);
    }
    return [...map.entries()]
      .filter(([, v]) => v.n >= 5)
      .map(([a, v]) => ({ activity: a, rate: v.ok / v.n, n: v.n }))
      .sort((x, y) => y.rate - x.rate);
  }, [events]);

  const exposure = useMemo(() => {
    // First practice modality per word (earliest event), vs 7-day recall success.
    const first = new Map<string, ActivityType>();
    for (const e of events) {
      if (!first.has(e.wordId)) first.set(e.wordId, e.activity);
    }
    const groups = new Map<ActivityType, { n: number; ok: number }>();
    for (const e of events) {
      if (e.dimension !== 'recall' || e.timestamp < now - 7 * DAY_MS) continue;
      const g = first.get(e.wordId);
      if (!g) continue;
      const cur = groups.get(g) ?? { n: 0, ok: 0 };
      cur.n++;
      if (e.correct) cur.ok++;
      groups.set(g, cur);
    }
    return [...groups.entries()]
      .filter(([, v]) => v.n >= 20)
      .map(([a, v]) => ({ activity: a, rate: v.ok / v.n, n: v.n }));
  }, [events, now]);

  const calibration = useMemo(() => {
    const levels = (['sure', 'shaky', 'unsure'] as const).map((level) => {
      const subset = events.filter((e) => e.confidence === level);
      return {
        level,
        n: subset.length,
        rate: subset.length === 0 ? 0 : subset.filter((e) => e.correct).length / subset.length,
      };
    });
    const total = levels.reduce((n, l) => n + l.n, 0);
    return { levels, total };
  }, [events]);

  const errors = useMemo(
    () => aggregateErrorProfile(Object.fromEntries(Object.entries(words).map(([id, p]) => [id, p.errorProfile]))),
    [words],
  );

  const hotspots = useMemo(() => [...confusion].sort((a, b) => b.weight - a.weight).slice(0, 5), [confusion]);
  const active = useMemo(() => activeWordIds(words), [words]);
  const pace = useMemo(() => paceProjection(daily, now, active.length, WORDS.length), [daily, now, active.length]);
  const averages = useMemo(() => dimensionAverages(words), [words]);
  const totalMinutes = useMemo(
    () => Object.values(daily).reduce((n, d) => n + d.activeMinutes, 0),
    [daily],
  );
  const calendar = useMemo(() => {
    const days: { date: string; minutes: number; answered: number }[] = [];
    for (let d = 29; d >= 0; d--) {
      const date = new Date(now - d * DAY_MS);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      const log = daily[key];
      days.push({ date: key, minutes: log?.activeMinutes ?? 0, answered: log?.itemsAnswered ?? 0 });
    }
    return days;
  }, [daily, now]);
  const maxDay = Math.max(1, ...calendar.map((c) => c.answered));

  return (
    <div className="space-y-4">
      <PageHeader title="Insights" sub="What your answers say about your memory. Honest numbers only." />

      <Card>
        <h2 className="font-display text-xl">Retention forecast</h2>
        {forecast.activeTotal === 0 ? (
          <p className="mt-1 text-ink-soft">Meet your first words and this forecast will come alive.</p>
        ) : (
          <p className="mt-1 text-lg">
            In 7 days you&apos;ll likely remember{' '}
            <strong>~{Math.round(forecast.pct * 100)}%</strong> of your {forecast.activeTotal} active words
            <span className="text-ink-soft"> ({forecast.likelyRemembered} of {forecast.activeTotal} holding at 80%+).</span>
          </p>
        )}
      </Card>

      <Card>
        <h2 className="font-display text-xl">Mastery distribution</h2>
        <div className="mt-2 space-y-1.5">
          {([0, 1, 2, 3, 4, 5] as const).map((s) => (
            <div key={s} className="flex items-center gap-3 text-[15px]">
              <span className="w-28 shrink-0 text-ink-soft">{STAGE_NAMES[s]}</span>
              <div className="flex-1"><ProgressBar value={dist[s]} max={Math.max(1, ...Object.values(dist))} label={`${STAGE_NAMES[s]}: ${dist[s]}`} className="[&>div:first-child]:hidden" /></div>
              <span className="w-10 text-right font-medium">{dist[s]}</span>
            </div>
          ))}
        </div>
        {atRisk > 0 && <p className="mt-2 text-sm text-warn">{atRisk} words could use attention soon.</p>}
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <h2 className="font-display text-xl">What works best for you</h2>
          {events.length < 20 ? (
            <p className="mt-1 text-ink-soft">{COLLECTING}</p>
          ) : byActivity.length === 0 ? (
            <p className="mt-1 text-ink-soft">{COLLECTING}</p>
          ) : (
            <ul className="mt-2 space-y-1.5 text-[15px]">
              {byActivity.slice(0, 6).map((r) => (
                <li key={r.activity} className="flex items-baseline justify-between gap-2">
                  <span className="text-ink-soft">{activityLabel(r.activity)}</span>
                  <span><strong>{Math.round(r.rate * 100)}%</strong> <span className="text-ink-faint">({r.n})</span></span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="font-display text-xl">First practice matters</h2>
          {exposure.length < 2 ? (
            <p className="mt-1 text-ink-soft">{COLLECTING}</p>
          ) : (
            <ExposureLine exposure={exposure} />
          )}
        </Card>

        <Card>
          <h2 className="font-display text-xl">Confidence calibration</h2>
          {calibration.total < 20 ? (
            <p className="mt-1 text-ink-soft">{COLLECTING}</p>
          ) : (
            <div className="mt-1 space-y-1 text-[15px]">
              {calibration.levels.map((l) => (
                <p key={l.level}>
                  When you say <strong>‘{l.level}’</strong>, you&apos;re right{' '}
                  <strong>{Math.round(l.rate * 100)}%</strong> of the time <span className="text-ink-faint">({l.n})</span>.
                </p>
              ))}
              {calibration.levels[0] && calibration.levels[0].rate < 0.8 && calibration.levels[0].n >= 20 && (
                <p className="flex items-center gap-1.5 text-warn"><Icon name="alert" size={15} /> You run hot on ‘sure’ — slow down on hard recalls.</p>
              )}
            </div>
          )}
        </Card>

        <Card>
          <h2 className="font-display text-xl">Spelling patterns</h2>
          {errors.length === 0 ? (
            <p className="mt-1 text-ink-soft">No spelling slips recorded yet — the lab will profile them here.</p>
          ) : (
            <ul className="mt-1 space-y-1 text-[15px]">
              {errors.slice(0, 4).map((e) => (
                <li key={e.kind}>
                  <strong>{SPELLING_ERROR_LABELS[e.kind]}</strong> — {e.count}×
                  <span className="text-ink-faint"> ({e.words.slice(0, 3).map((id) => WORD_MAP[id]?.word ?? id).join(', ')})</span>
                </li>
              ))}
            </ul>
          )}
          <Link to="/labs/spelling" className="mt-2 inline-block text-sm text-accent-deep underline dark:text-accent">Open Spelling Lab</Link>
        </Card>

        <Card>
          <h2 className="font-display text-xl">Confusion hotspots</h2>
          {hotspots.length === 0 ? (
            <p className="mt-1 text-ink-soft">Nothing confused yet. Mix-ups will surface here with drills.</p>
          ) : (
            <ul className="mt-1 space-y-1 text-[15px]">
              {hotspots.map((e) => (
                <li key={`${e.a}-${e.b}`}>
                  <Link to={`/word/${e.a}`} className="underline">{WORD_MAP[e.a]?.word}</Link>
                  {' / '}
                  <Link to={`/word/${e.b}`} className="underline">{WORD_MAP[e.b]?.word}</Link>
                  <span className="text-ink-faint"> — weight {Math.round(e.weight * 10) / 10}</span>
                </li>
              ))}
            </ul>
          )}
          <Link to="/labs/discrimination" className="mt-2 inline-block text-sm text-accent-deep underline dark:text-accent">Open trainer</Link>
        </Card>

        <Card>
          <h2 className="font-display text-xl">Pace & projection</h2>
          {pace.newPerDay <= 0 ? (
            <p className="mt-1 text-ink-soft">No new words this week. When you&apos;re ready, a short session restarts the count — no guilt, just physics.</p>
          ) : (
            <p className="mt-1 text-[15px]">
              <strong>{pace.newPerDay.toFixed(1)}</strong> new words/day over the last week.
              {pace.projectedDate ? <> All {WORDS.length} in active memory by <strong>{formatDayMonth(pace.projectedDate)}</strong>.</> : ' Keep going.'}
            </p>
          )}
        </Card>
      </div>

      <Card>
        <h2 className="font-display text-xl">Time invested</h2>
        <p className="mt-1 text-[15px]"><strong>{Math.round(totalMinutes)}</strong> active minutes in total.</p>
        <div className="mt-3 flex items-end gap-1" role="img" aria-label="Study activity over the last 30 days">
          {calendar.map((c) => (
            <div
              key={c.date}
              title={`${c.date}: ${c.answered} answered`}
              className={`flex-1 rounded-sm ${c.answered > 0 ? 'bg-accent' : 'bg-line'}`}
              style={{ height: `${Math.max(4, (c.answered / maxDay) * 40)}px` }}
            />
          ))}
        </div>
        <p className="mt-1 text-xs text-ink-faint">Last 30 days · darker means more answers.</p>
      </Card>

      <Card>
        <h2 className="font-display text-xl">Dimension averages</h2>
        <div className="mt-2 grid grid-cols-1 gap-x-6 sm:grid-cols-2">
          {DIMENSIONS.filter((d) => averages[d] !== undefined).map((d: DimensionKey) => (
            <div key={d} className="flex items-center gap-3 text-[15px]">
              <span className="w-28 shrink-0 capitalize text-ink-soft">{d}</span>
              <div className="flex-1"><ProgressBar value={averages[d]!} label={`${d} average strength`} className="[&>div:first-child]:hidden" /></div>
              <span className="w-10 text-right">{Math.round(averages[d]!)}</span>
            </div>
          ))}
        </div>
        {Object.keys(averages).length === 0 && <p className="mt-1 text-ink-soft">{COLLECTING}</p>}
      </Card>
    </div>
  );
}

function ExposureLine({ exposure }: { exposure: { activity: ActivityType; rate: number; n: number }[] }) {
  const top = exposure[0];
  const second = exposure[1];
  if (!top) return null;
  return (
    <p className="mt-1 text-[15px]">
      Words you first practiced through <strong>{activityLabel(top.activity)}</strong> are recalled at{' '}
      <strong>{Math.round(top.rate * 100)}%</strong> after a week
      {second ? <> vs <strong>{Math.round(second.rate * 100)}%</strong> via {activityLabel(second.activity)}</> : ''}.
    </p>
  );
}

function activityLabel(a: ActivityType): string {  const labels: Record<ActivityType, string> = {
    'meet': 'Meeting words', 'mcq-word-meaning': 'Word → meaning', 'mcq-meaning-word': 'Meaning → word',
    'listen-meaning': 'Listen → meaning', 'listen-spelling': 'Listen → spelling', 'minimal-pair': 'Minimal pairs',
    'cued-recall': 'Cued recall', 'free-recall': 'Free recall', 'spelling-build': 'Letter assembly',
    'flash-type': 'Flash typing', 'sentence-dictation': 'Dictation', 'context-cloze': 'Cloze',
    'collocation-select': 'Collocations', 'form-transform': 'Word forms', 'sentence-production': 'Sentence writing',
    'discrimination': 'Discrimination', 'writing-task': 'Writing tasks',
  };
  return labels[a];
}

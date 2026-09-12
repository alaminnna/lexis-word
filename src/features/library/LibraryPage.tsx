import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { MasteryStage } from '../../types/domain';
import { WORDS } from '../../data/words';
import { topicOf, TOPICS } from '../../core/topics';
import { useProgress } from '../../store/progress';
import { atRiskWordIds } from '../../store/selectors';
import { useSessionPersist } from '../../store/session';
import { buildSession } from '../../core/engine/session-builder';
import { progressSnapshot } from '../../store/progress';
import { settingsSnapshot } from '../../store/settings';
import { todayInputs } from '../../store/selectors';
import { PageHeader } from '../../app/layout';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { Icon } from '../../components/ui/Icon';
import { STAGE_NAMES } from '../../core/engine/stages';

const ROW_H = 60;

/** Fixed-row virtualized list (499 rows render in a window with overscan). */
function VirtualList({ ids, renderRow }: { ids: string[]; renderRow: (id: string) => React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ top: 0, height: 600 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = (): void => setViewport({ top: el.scrollTop, height: el.clientHeight });
    update();
    el.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      el.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);
  const start = Math.max(0, Math.floor(viewport.top / ROW_H) - 4);
  const end = Math.min(ids.length, Math.ceil((viewport.top + viewport.height) / ROW_H) + 4);
  return (
    <div ref={ref} className="max-h-[60vh] overflow-y-auto rounded-xl border border-line" role="list" aria-label="Words">
      <div style={{ height: ids.length * ROW_H, position: 'relative' }}>
        {ids.slice(start, end).map((id, i) => (
          <div key={id} role="listitem" style={{ position: 'absolute', top: (start + i) * ROW_H, left: 0, right: 0, height: ROW_H }}>
            {renderRow(id)}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Library: search-as-you-type + stage / topic / POS / mastery / at-risk
 * filters over all 499 words. Local data renders instantly.
 */
export default function LibraryPage() {
  const navigate = useNavigate();
  const words = useProgress((s) => s.words);
  const launchPlan = useSessionPersist((s) => s.launchPlan);
  const [query, setQuery] = useState('');
  const [stage, setStage] = useState<number | null>(null);
  const [topic, setTopic] = useState<string | null>(null);
  const [pos, setPos] = useState<string | null>(null);
  const [mastery, setMastery] = useState<MasteryStage | null>(null);
  const [atRiskOnly, setAtRiskOnly] = useState(false);
  const now = Date.now();
  const atRisk = useMemo(() => new Set(atRiskWordIds(words, now)), [words, now]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return WORDS.filter((w) => {
      if (q && !(w.word.includes(q) || (w.shortDefinition ?? '').toLowerCase().includes(q) ||
        (typeof w.bengali === 'string' ? w.bengali.includes(query.trim()) : false))) return false;
      if (stage !== null && w.stage !== stage) return false;
      if (topic !== null && topicOf(w) !== topic) return false;
      if (pos !== null && w.pos?.[0] !== pos) return false;
      if (mastery !== null && (words[w.id]?.masteryStage ?? 0) !== mastery) return false;
      if (atRiskOnly && !atRisk.has(w.id)) return false;
      return true;
    }).map((w) => w.id);
  }, [query, stage, topic, pos, mastery, atRiskOnly, atRisk, words]);

  const poses = useMemo(() => [...new Set(WORDS.map((w) => w.pos?.[0] ?? 'other'))].sort(), []);

  const startTopicQuiz = (): void => {
    const ids = filtered.slice(0, 60);
    if (ids.length === 0) return;
    const subset = ids.map((id) => WORDS.find((w) => w.id === id)!).filter(Boolean);
    const full = progressSnapshot();
    const settings = settingsSnapshot();
    const { introducedToday, daysSinceActive, rolling } = todayInputs(full, Date.now());
    const plan = buildSession({
      words: subset, progress: full.words, confusion: full.confusion, settings,
      seed: settings.seed + Math.floor(Date.now() / 86_400_000) + 7,
      now: Date.now(), introducedToday, daysSinceActive, rollingSuccess: rolling, speechAvailable: true,
    });
    plan.id = `rev_topic_${Date.now().toString(36)}`;
    plan.meta = { kind: 'review', filter: topic ?? 'mixed' };
    launchPlan(plan);
    navigate('/learn');
  };

  return (
    <div>
      <PageHeader title="Library" sub={`${WORDS.length} words · search, filter, open any word.`} />
      <div className="mb-3 flex gap-2">
        <label htmlFor="library-search" className="sr-only">Search words, meanings, or Bengali</label>
        <div className="relative flex-1">
          <Icon name="search" size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-faint" />
          <input
            id="library-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search a word, meaning, or বাংলা…"
            autoComplete="off"
            className="min-h-[48px] w-full rounded-xl border border-line-strong bg-paper pr-3 pl-10 text-[16px] transition-calm placeholder:text-ink-faint focus:border-accent focus:outline-none"
          />
        </div>
      </div>
      <div className="mb-3 flex flex-wrap gap-2" aria-label="Filters">
        <FilterSelect label="Roadmap stage" value={stage === null ? '' : String(stage)}
          onChange={(v) => setStage(v === '' ? null : Number(v))}
          options={[{ v: '', t: 'All stages' }, ...Array.from({ length: 10 }, (_, i) => ({ v: String(i), t: `Stage ${i + 1}` }))]} />
        <FilterSelect label="Topic" value={topic ?? ''}
          onChange={(v) => setTopic(v === '' ? null : v)}
          options={[{ v: '', t: 'All topics' }, ...TOPICS.map((t) => ({ v: t, t })), { v: 'General', t: 'General' }]} />
        <FilterSelect label="Part of speech" value={pos ?? ''}
          onChange={(v) => setPos(v === '' ? null : v)}
          options={[{ v: '', t: 'All' }, ...poses.map((p) => ({ v: p, t: p }))]} />
        <FilterSelect label="Mastery" value={mastery === null ? '' : String(mastery)}
          onChange={(v) => setMastery(v === '' ? null : (Number(v) as MasteryStage))}
          options={[{ v: '', t: 'Any' }, ...([0, 1, 2, 3, 4, 5] as MasteryStage[]).map((m) => ({ v: String(m), t: STAGE_NAMES[m] }))]} />
        <button
          onClick={() => setAtRiskOnly(!atRiskOnly)}
          aria-pressed={atRiskOnly}
          className={`min-h-[44px] cursor-pointer rounded-lg border px-3 text-sm transition-calm ${atRiskOnly ? 'border-accent bg-accent-soft font-medium text-accent-deep dark:text-accent' : 'border-line text-ink-soft'}`}
        >
          At-risk only
        </button>
      </div>
      {(topic || query || stage !== null) && filtered.length > 0 && (
        <div className="mb-3">
          <Button variant="secondary" onClick={startTopicQuiz}>
            <Icon name="play" size={16} /> Quiz these {filtered.length} words
          </Button>
        </div>
      )}
      <p className="mb-2 text-sm text-ink-faint" aria-live="polite">{filtered.length} word{filtered.length === 1 ? '' : 's'}</p>
      {filtered.length === 0 ? (
        <EmptyState title="No matches" body="Try a shorter search or clear a filter." />
      ) : (
        <VirtualList
          ids={filtered}
          renderRow={(id) => {
            const w = WORDS.find((x) => x.id === id)!;
            const st = words[id]?.masteryStage ?? 0;
            return (
              <button
                onClick={() => navigate(`/word/${id}`)}
                className="flex h-full w-full cursor-pointer items-center gap-3 border-b border-line px-4 text-left transition-calm hover:bg-paper-deep"
              >
                <span className="font-display text-lg">{w.word}</span>
                <span className="flex-1 truncate text-sm text-ink-soft">{w.shortDefinition}</span>
                {atRisk.has(id) && <span className="shrink-0 rounded-full bg-warn-soft px-2 py-0.5 text-xs text-warn">fading</span>}
                <span className="shrink-0 text-xs text-ink-faint">{STAGE_NAMES[st]}</span>
              </button>
            );
          }}
        />
      )}
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: { v: string; t: string }[];
}) {
  return (
    <label className="inline-flex items-center gap-1.5 text-sm text-ink-soft">
      <span className="sr-only">{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-[44px] cursor-pointer rounded-lg border border-line bg-paper px-2"
      >
        {options.map((o) => (
          <option key={o.v || label} value={o.v}>{o.t}</option>
        ))}
      </select>
    </label>
  );
}

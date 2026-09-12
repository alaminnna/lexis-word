import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { WORDS } from '../../data/words';
import { buildSession } from '../../core/engine/session-builder';
import { progressSnapshot, useProgress } from '../../store/progress';
import { settingsSnapshot } from '../../store/settings';
import { useSessionPersist } from '../../store/session';
import { stageGates, todayInputs } from '../../store/selectors';
import { paceProjection } from '../../core/engine/projections';
import { activeWordIds } from '../../store/selectors';
import { formatDayMonth } from '../../utils/time';
import { PageHeader } from '../../app/layout';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { ProgressRing } from '../../components/ui/ProgressBar';
import { WordCell, MasteryLegend } from '../../components/ui/WordCell';
import { Icon } from '../../components/ui/Icon';

const STAGE_SUBTITLES = [
  'Core academic foundation', 'Analysis & argument', 'Systems & processes', 'Evidence & evaluation',
  'Change & impact', 'People & society', 'Quantity & comparison', 'Time & sequence',
  'Power & institutions', 'Nuance & precision',
];

function checkpointKey(stage: number): string {
  return `lexis:checkpoint:${stage}`;
}

export interface CheckpointRecord {
  accuracy: number;
  at: number;
  pass: boolean;
}

export function readCheckpoint(stage: number): CheckpointRecord | null {
  try {
    const raw = localStorage.getItem(checkpointKey(stage));
    return raw ? (JSON.parse(raw) as CheckpointRecord) : null;
  } catch {
    return null;
  }
}

/**
 * 500-word Roadmap (§15): 10 stages × 50 in file order, unlock gates, rings,
 * per-stage word grids, checkpoint quizzes, honest pace projection, quiet
 * milestones (50/100/250/500) as typographic moments.
 */
export default function RoadmapPage() {
  const navigate = useNavigate();
  const words = useProgress((s) => s.words);
  const daily = useProgress((s) => s.daily);
  const launchPlan = useSessionPersist((s) => s.launchPlan);
  const [openStage, setOpenStage] = useState<number | null>(null);
  const [milestone, setMilestone] = useState<{ n: number; label: string } | null>(null);

  const gates = useMemo(() => stageGates(words), [words]);
  const now = Date.now();
  const active = useMemo(() => activeWordIds(words), [words]);
  const introduced = useMemo(
    () => Object.values(words).filter((w) => w.introducedAt > 0).length,
    [words],
  );
  const pace = useMemo(
    () => paceProjection(daily, now, active.length, WORDS.length),
    [daily, now, active.length],
  );

  // Quiet milestones: first time crossing 50/100/250/500 introductions.
  useEffect(() => {
    const marks = [50, 100, 250, 500];
    for (const n of marks) {
      const key = `lexis:milestone:${n}`;
      if (introduced >= n && !localStorage.getItem(key)) {
        localStorage.setItem(key, String(Date.now()));
        setMilestone({
          n,
          label: n === 500
            ? 'Every word encountered. Now the long game: keeping them.'
            : `${n} words encountered, ${active.length} in active memory.`,
        });
        break;
      }
    }
  }, [introduced, active.length]);

  // Newly sealed stages → quiet seal moment.
  useEffect(() => {
    for (const g of gates) {
      const key = `lexis:sealed:${g.stage}`;
      if (g.sealed && !localStorage.getItem(key)) {
        localStorage.setItem(key, String(Date.now()));
        setMilestone({ n: (g.stage + 1) * 50, label: `Stage ${g.stage + 1} sealed — ${g.atActiveOrAbove} of ${g.total} words active.` });
        break;
      }
    }
  }, [gates]);

  const startCheckpoint = (stage: number): void => {
    const stageWords = WORDS.filter((w) => w.stage === stage && words[w.id]?.introducedAt);
    if (stageWords.length === 0) return;
    const full = progressSnapshot();
    const settings = settingsSnapshot();
    const { introducedToday, daysSinceActive, rolling } = todayInputs(full, Date.now());
    const baseSeed = settings.seed + Math.floor(Date.now() / 86_400_000) + stage * 131;
    const halves = [0, 1].map((h) =>
      buildSession({
        words: stageWords, progress: full.words, confusion: full.confusion,
        settings: { ...settings, sessionLengthTarget: 15 },
        seed: baseSeed + h, now: Date.now(), introducedToday, daysSinceActive,
        rollingSuccess: rolling, speechAvailable: true,
      }),
    );
    const items = [...halves[0]!.items, ...halves[1]!.items].slice(0, 30);
    launchPlan({
      id: `chk_${stage}_${Date.now().toString(36)}`, createdAt: Date.now(),
      seed: baseSeed, items, meta: { kind: 'checkpoint', stage },
    });
    navigate('/learn');
  };

  return (
    <div>
      <PageHeader
        title="Roadmap"
        sub={
          pace.projectedDate
            ? <>At your current pace: all {WORDS.length} words in active memory by <strong>{formatDayMonth(pace.projectedDate)}</strong>.</>
            : <>Answer a few sessions and your pace projection will appear here.</>
        }
      />

      {milestone && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-paper/95 p-6" role="dialog" aria-modal="true" aria-label="Milestone">
          <div className="text-center">
            <p className="font-display text-[clamp(3rem,12vw,6rem)] leading-none">{milestone.n}</p>
            <p className="mx-auto mt-3 max-w-md text-lg text-ink-soft">{milestone.label}</p>
            <Button className="mt-6" onClick={() => setMilestone(null)}>Continue</Button>
          </div>
        </div>
      )}

      <ol className="space-y-3">
        {gates.map((g) => {
          const stageWords = WORDS.filter((w) => w.stage === g.stage);
          const pct = g.total === 0 ? 0 : g.atActiveOrAbove / g.total;
          const check = readCheckpoint(g.stage);
          return (
            <li key={g.stage}>
              <Card className={!g.unlocked ? 'opacity-70' : ''}>
                <div className="flex items-center gap-4">
                  <ProgressRing value={pct} label={`Stage ${g.stage + 1}: ${g.atActiveOrAbove} of ${g.total} words active`} />
                  <div className="min-w-0 flex-1">
                    <h2 className="font-display text-xl">
                      Stage {g.stage + 1} · {STAGE_SUBTITLES[g.stage]}
                    </h2>
                    <p className="text-sm text-ink-soft">
                      Words {g.stage * 50 + 1}–{g.stage * 50 + g.total} · {g.atActiveOrAbove}/{g.total} active
                      {!g.unlocked && ' · unlocks at 80% of the previous stage'}
                      {g.sealed && ' · sealed'}
                      {check && (check.pass ? ` · checkpoint ${check.accuracy}%` : ` · checkpoint ${check.accuracy}% — re-review advised`)}
                    </p>
                  </div>
                  <button
                    onClick={() => setOpenStage(openStage === g.stage ? null : g.stage)}
                    aria-expanded={openStage === g.stage}
                    aria-label={`${openStage === g.stage ? 'Hide' : 'Show'} words in stage ${g.stage + 1}`}
                    className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-line-strong"
                  >
                    <Icon name="chevron-right" size={20} className={`transition-calm ${openStage === g.stage ? 'rotate-90' : ''}`} />
                  </button>
                </div>
                {openStage === g.stage && (
                  <div className="mt-4 border-t border-line pt-4">
                    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 md:grid-cols-4">
                      {stageWords.map((w) => (
                        <WordCell
                          key={w.id}
                          word={w.word}
                          stage={words[w.id]?.masteryStage ?? 0}
                          onOpen={() => navigate(`/word/${w.id}`)}
                        />
                      ))}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Button
                        variant="secondary"
                        disabled={!g.unlocked || stageWords.every((w) => !words[w.id]?.introducedAt)}
                        onClick={() => startCheckpoint(g.stage)}
                      >
                        <Icon name="flag" size={16} /> Checkpoint quiz (30)
                      </Button>
                      {check && !check.pass && (
                        <span className="text-sm text-ink-soft">Last attempt {check.accuracy}% — targeted review will rebuild these words.</span>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            </li>
          );
        })}
      </ol>
      <div className="mt-4"><MasteryLegend /></div>
      <p className="mt-3 text-sm text-ink-faint">
        Reviews continue cumulatively from all unlocked stages — no stage is ever done and discarded.{' '}
        <Link to="/library" className="underline">Browse every word</Link>
      </p>
    </div>
  );
}

export function wordStageName(stage: number): string {
  return `Stage ${stage + 1} · ${STAGE_SUBTITLES[stage] ?? ''}`;
}

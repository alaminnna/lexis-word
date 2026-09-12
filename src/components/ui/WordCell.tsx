import type { MasteryStage } from '../../types/domain';
import { STAGE_NAMES } from '../../core/engine/stages';

/** 6-step neutral→teal mastery color for word grids (§16). */
const STAGE_BG: Record<MasteryStage, string> = {
  0: 'bg-m0 text-ink-soft',
  1: 'bg-m1 text-ink',
  2: 'bg-m2 text-ink',
  3: 'bg-m3 text-ink',
  // m4 (#4D9487) with white is 3.56:1 — use ink text (≈5.9:1) for AA.
  4: 'bg-m4 text-ink',
  5: 'bg-m5 text-paper',
};

/** One word cell in Roadmap/Library grids, colored by mastery stage. */
export function WordCell({ word, stage, onOpen }: {
  word: string;
  stage: MasteryStage;
  onOpen?: () => void;
}) {
  return (
    <button
      onClick={onOpen}
      title={`${word} — ${STAGE_NAMES[stage]}`}
      aria-label={`${word}, ${STAGE_NAMES[stage]}`}
      className={`min-h-[44px] cursor-pointer truncate rounded-md px-2 py-1.5 text-left text-sm transition-calm hover:ring-2 hover:ring-accent ${STAGE_BG[stage]}`}
    >
      {word}
    </button>
  );
}

export function MasteryLegend() {
  const stages: MasteryStage[] = [0, 1, 2, 3, 4, 5];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-ink-soft" aria-label="Mastery legend">
      {stages.map((s) => (
        <span key={s} className="inline-flex items-center gap-1.5">
          <span className={`inline-block h-3 w-3 rounded-sm ${STAGE_BG[s].split(' ')[0]}`} aria-hidden />
          {STAGE_NAMES[s]}
        </span>
      ))}
    </div>
  );
}

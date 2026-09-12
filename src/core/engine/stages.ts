// Mastery stage ladder (§6): recognition-to-production progression.
// Stage = highest rung whose conditions (and all lower rungs) hold.

import type { DimensionKey, MasteryStage, WordProgress } from '../../types/domain';
import { CORE_DIMENSIONS } from './constants';
import { longestIntervalDays, overallMastery } from './mastery';

export const STAGE_NAMES: Record<MasteryStage, string> = {
  0: 'New',
  1: 'Introduced',
  2: 'Recognized',
  3: 'Active',
  4: 'Expressive',
  5: 'Mastered',
};

const get = (p: WordProgress, d: DimensionKey): number => p.dimensions[d].strength;

function rungConditions(p: WordProgress, rung: MasteryStage): boolean {
  switch (rung) {
    case 0: return true;
    case 1: return p.introducedAt > 0;
    case 2: return get(p, 'recognition') >= 60 && get(p, 'context') >= 40;
    case 3: return get(p, 'recall') >= 50 && get(p, 'listening') >= 40 && get(p, 'spelling') >= 40;
    case 4: return get(p, 'production') >= 50 && get(p, 'collocation') >= 50;
    case 5: {
      if (overallMastery(p.dimensions) < 85) return false;
      if (get(p, 'recall') < 80 || get(p, 'spelling') < 75 || get(p, 'production') < 70) return false;
      if (longestIntervalDays(p) < 21) return false;
      // Zero lapses in the last two attempts of every core dimension.
      for (const d of CORE_DIMENSIONS) {
        const recent = p.dimensions[d].recent;
        if (recent.some((ok) => !ok)) return false;
      }
      return true;
    }
  }
}

export function computeStage(p: WordProgress): MasteryStage {
  if (p.introducedAt === 0) return 0;
  let stage: MasteryStage = 1;
  const rungs: MasteryStage[] = [2, 3, 4, 5];
  for (const rung of rungs) {
    if (rungConditions(p, rung)) stage = rung;
    else break; // progression ladder: higher rungs require all lower ones
  }
  return stage;
}

/** Count of words at each mastery stage (for Roadmap + Insights). */
export function stageDistribution(progress: Record<string, WordProgress>): Record<MasteryStage, number> {
  const dist: Record<MasteryStage, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const id of Object.keys(progress)) {
    const w = progress[id];
    if (w) dist[w.masteryStage] += 1;
  }
  return dist;
}

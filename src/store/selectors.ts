// Derived selectors: everything the UI and the session builder need from raw
// progress, computed on demand (no duplicated state). Pure functions.

import type {
  DimensionKey, PersistedProgress, UserSettings, WordProgress,
} from '../types/domain';
import { DIMENSIONS } from '../types/domain';
import { WORDS } from '../data/words';
import { retentionOf } from '../core/engine/mastery';
import { rollingSuccess } from '../core/engine/projections';
import { DAY_MS, dayKey } from '../utils/time';

export interface DueCounts {
  all: number; // words with any attempted dim due
  recall: number;
  listening: number;
  spelling: number;
  atRisk: number;
}

/** Review Hub counts: due words by type + at-risk words (§17). */
export function dueCounts(progress: Record<string, WordProgress>, now: number): DueCounts {
  const sets = { all: new Set<string>(), recall: new Set<string>(), listening: new Set<string>(), spelling: new Set<string>(), atRisk: new Set<string>() };
  for (const id of Object.keys(progress)) {
    const p = progress[id]!;
    if (p.introducedAt === 0) continue;
    for (const d of DIMENSIONS) {
      const st = p.dimensions[d];
      if (st.attempts === 0) continue;
      if (st.nextDueAt <= now) {
        sets.all.add(id);
        if (d === 'recall') sets.recall.add(id);
        if (d === 'listening') sets.listening.add(id);
        if (d === 'spelling') sets.spelling.add(id);
      }
      if (retentionOf(st, now).atRisk) sets.atRisk.add(id);
    }
  }
  return { all: sets.all.size, recall: sets.recall.size, listening: sets.listening.size, spelling: sets.spelling.size, atRisk: sets.atRisk.size };
}

/** Word ids with any attempted dimension currently at risk. */
export function atRiskWordIds(progress: Record<string, WordProgress>, now: number): string[] {
  const out: string[] = [];
  for (const id of Object.keys(progress)) {
    const p = progress[id]!;
    if (p.introducedAt === 0) continue;
    for (const d of DIMENSIONS) {
      const st = p.dimensions[d];
      if (st.attempts > 0 && retentionOf(st, now).atRisk) {
        out.push(id);
        break;
      }
    }
  }
  return out;
}

/** Words in active memory (introduced, stages 1–4). */
export function activeWordIds(progress: Record<string, WordProgress>): string[] {
  return Object.keys(progress).filter((id) => {
    const p = progress[id]!;
    return p.introducedAt > 0 && p.masteryStage >= 1 && p.masteryStage <= 4;
  });
}

export interface TodayInputs {
  introducedToday: string[];
  daysSinceActive: number;
  rolling: number | null;
}

/** Builder inputs derived from the event log + daily logs. */
export function todayInputs(state: PersistedProgress, now: number): TodayInputs {
  const today = dayKey(now);
  const introducedToday = state.introducedToday.date === today ? state.introducedToday.wordIds : [];
  let daysSinceActive = 0;
  const dates = Object.keys(state.daily).filter((d) => (state.daily[d]?.itemsAnswered ?? 0) > 0).sort();
  if (dates.length > 0) {
    const last = dates[dates.length - 1]!;
    const lastMs = new Date(`${last}T12:00:00`).getTime();
    daysSinceActive = Math.max(0, Math.floor((now - lastMs) / DAY_MS));
  }
  return { introducedToday, daysSinceActive, rolling: rollingSuccess(state.events) };
}

/** Per-dimension average strength across attempted dims (Insights card). */
export function dimensionAverages(progress: Record<string, WordProgress>): Partial<Record<DimensionKey, number>> {
  const sums = {} as Record<DimensionKey, { total: number; n: number }>;
  for (const d of DIMENSIONS) sums[d] = { total: 0, n: 0 };
  for (const id of Object.keys(progress)) {
    const p = progress[id]!;
    for (const d of DIMENSIONS) {
      const st = p.dimensions[d];
      if (st.attempts > 0) {
        sums[d].total += st.strength;
        sums[d].n += 1;
      }
    }
  }
  const out: Partial<Record<DimensionKey, number>> = {};
  for (const d of DIMENSIONS) {
    if (sums[d].n > 0) out[d] = sums[d].total / sums[d].n;
  }
  return out;
}

export interface StageGate {
  stage: number; // 0–9
  total: number;
  atActiveOrAbove: number; // masteryStage ≥ 3
  unlocked: boolean;
  sealed: boolean; // ≥80% at stage ≥3 (unlock gate for the NEXT stage)
}

/** Roadmap gates (§15): next stage unlocks at ≥80% of current stage at Active+. */
export function stageGates(progress: Record<string, WordProgress>): StageGate[] {
  const gates: StageGate[] = [];
  for (let stage = 0; stage < 10; stage++) {
    const ids = WORDS.filter((w) => w.stage === stage).map((w) => w.id);
    const atActiveOrAbove = ids.filter((id) => (progress[id]?.masteryStage ?? 0) >= 3).length;
    const sealed = ids.length > 0 && atActiveOrAbove / ids.length >= 0.8;
    gates.push({
      stage, total: ids.length, atActiveOrAbove,
      unlocked: stage === 0 || (gates[stage - 1]?.sealed ?? false),
      sealed,
    });
  }
  return gates;
}

/** Next un-introduced word ids by rank (for prefetch + Today estimates). */
export function nextNewWordIds(progress: Record<string, WordProgress>, count: number): string[] {
  return WORDS.filter((w) => !progress[w.id] || progress[w.id]!.introducedAt === 0)
    .slice(0, count)
    .map((w) => w.id);
}

/** Tomorrow's likely work: due-soon words + next new words (prefetch targets). */
export function prefetchWordIds(progress: Record<string, WordProgress>, settings: UserSettings, now: number): string[] {
  const dueSoon: { id: string; due: number }[] = [];
  for (const id of Object.keys(progress)) {
    const p = progress[id]!;
    if (p.introducedAt === 0) continue;
    let earliest = Infinity;
    for (const d of DIMENSIONS) {
      const st = p.dimensions[d];
      if (st.attempts > 0 && st.nextDueAt < earliest) earliest = st.nextDueAt;
    }
    if (earliest <= now + DAY_MS) dueSoon.push({ id, due: earliest });
  }
  dueSoon.sort((a, b) => a.due - b.due);
  const ids = dueSoon.slice(0, 8).map((d) => d.id);
  return [...ids, ...nextNewWordIds(progress, settings.dailyNewTarget)].slice(0, 12);
}

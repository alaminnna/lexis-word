import type { LearningEvent, WordProgress, WordRecord } from '../../types/domain';
import { WORDS, WORD_MAP } from '../../data/words';

export type WritingTaskKind = 'frame' | 'transform' | 'free';

const DAY_MS = 86_400_000;

export interface WritingTarget {
  word: WordRecord;
  reason: string;
  task: WritingTaskKind;
  minutes: number;
  lastWrittenAt: number | null;
}

/**
 * Recommended writing targets from real progress (never invented):
 * stale production words first, then writing dues, then production-ready words.
 */
export function recommendedWritingTargets(
  progress: Record<string, WordProgress>,
  events: LearningEvent[],
  now: number,
  count = 3,
): WritingTarget[] {
  const lastWriting = new Map<string, number>();
  for (const e of events) {
    if (e.dimension !== 'writing') continue;
    lastWriting.set(e.wordId, Math.max(lastWriting.get(e.wordId) ?? 0, e.timestamp));
  }
  const ranked: { target: WritingTarget; rank: number; order: number }[] = [];
  for (const w of WORDS) {
    const p = progress[w.id];
    if (!p || p.introducedAt === 0) continue;
    const prod = p.dimensions.production.strength;
    const last = lastWriting.get(w.id) ?? null;
    if (prod >= 50 && (last === null || now - last >= 14 * DAY_MS)) {
      ranked.push({
        target: {
          word: w,
          reason: last === null
            ? 'Reached production strength — never written yet.'
            : `Last written ${Math.floor((now - last) / DAY_MS)} days ago — use it or lose it.`,
          task: 'free',
          minutes: 5,
          lastWrittenAt: last,
        },
        rank: 0,
        order: w.rank,
      });
    } else if (p.dimensions.writing.attempts > 0 && p.dimensions.writing.nextDueAt <= now) {
      ranked.push({
        target: { word: w, reason: 'Due for a writing check.', task: 'free', minutes: 4, lastWrittenAt: last },
        rank: 1,
        order: w.rank,
      });
    } else if (prod >= 20 && prod < 50 && p.dimensions.writing.attempts === 0) {
      ranked.push({
        target: { word: w, reason: 'Ready to try in writing.', task: 'frame', minutes: 3, lastWrittenAt: last },
        rank: 2,
        order: w.rank,
      });
    }
  }
  ranked.sort((a, b) => a.rank - b.rank || a.order - b.order);
  return ranked.slice(0, Math.max(0, count)).map((r) => r.target);
}

export interface RecentWriting {
  wordId: string;
  word: string;
  correct: boolean;
  timestamp: number;
}

/** Last writing attempts, newest first. Empty when the learner never wrote. */
export function recentWriting(events: LearningEvent[], count = 5): RecentWriting[] {
  return events
    .filter((e) => e.dimension === 'writing')
    .slice(-Math.max(0, count))
    .reverse()
    .map((e) => ({
      wordId: e.wordId,
      word: WORD_MAP[e.wordId]?.word ?? e.wordId,
      correct: e.correct,
      timestamp: e.timestamp,
    }));
}

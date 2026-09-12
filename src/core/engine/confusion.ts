// Confusion graph (§14): error signals create edges; drills resolve them.
// Pure functions over ConfusionEdge[] (store owns persistence).

import type { ConfusionEdge } from '../../types/domain';
import { levenshtein, normalizeAnswer } from '../../utils/text';

/** Canonical key for an unordered word pair. */
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}::${b}` : `${b}::${a}`;
}

export type ConfusionSignal = 'wrong-choice' | 'near-miss' | 'hesitation';

const SIGNAL_WEIGHT: Record<ConfusionSignal, number> = {
  'wrong-choice': 1,
  'near-miss': 1,
  'hesitation': 0.5,
};

export const DRILL_THRESHOLD = 2;

/**
 * Apply an error signal between two words. `prior` marks the weak 0.25 prior for
 * pairs sharing a Bengali meaning or POS+stage — only activated by a real event (§14).
 */
export function applyConfusionSignal(
  edges: ConfusionEdge[],
  a: string,
  b: string,
  signal: ConfusionSignal,
  now: number,
  prior = false,
): ConfusionEdge[] {
  if (a === b) return edges;
  const [first, second] = a < b ? [a, b] : [b, a];
  const idx = edges.findIndex((e) => e.a === first && e.b === second);
  const increment = SIGNAL_WEIGHT[signal];
  if (idx < 0) {
    const base = prior ? 0.25 : 0;
    return [...edges, { a: first, b: second, weight: base + increment, lastAt: now, resolvedStreak: 0 }];
  }
  const next = [...edges];
  const edge = next[idx]!;
  next[idx] = { ...edge, weight: edge.weight + increment, lastAt: now, resolvedStreak: 0 };
  return next;
}

/**
 * Record one discrimination outcome. Three consecutive correct answers decay the
 * edge weight by half (§14). A miss resets the resolution streak, keeps weight.
 */
export function recordDiscrimination(
  edges: ConfusionEdge[],
  a: string,
  b: string,
  correct: boolean,
  now: number,
): ConfusionEdge[] {
  if (a === b) return edges;
  const [first, second] = a < b ? [a, b] : [b, a];
  const idx = edges.findIndex((e) => e.a === first && e.b === second);
  if (idx < 0) return edges;
  const next = [...edges];
  const edge = next[idx]!;
  if (!correct) {
    next[idx] = { ...edge, resolvedStreak: 0, lastAt: now };
    return next;
  }
  const streak = edge.resolvedStreak + 1;
  if (streak >= 3) {
    next[idx] = { ...edge, weight: edge.weight / 2, resolvedStreak: 0, lastAt: now };
  } else {
    next[idx] = { ...edge, resolvedStreak: streak, lastAt: now };
  }
  return next;
}

/** Edges eligible for discrimination drills (weight ≥ 2), heaviest first. */
export function drillableEdges(edges: ConfusionEdge[]): ConfusionEdge[] {
  return edges.filter((e) => e.weight >= DRILL_THRESHOLD).sort((x, y) => y.weight - x.weight);
}

/**
 * Near-miss typing against a *different* known word (Levenshtein ≤ 2, §14).
 * Returns the confused word id, or null.
 */
export function findNearMissWord(
  typed: string,
  targetId: string,
  vocabulary: { id: string; word: string }[],
): string | null {
  const u = normalizeAnswer(typed);
  if (u.length < 3) return null;
  let best: string | null = null;
  let bestDist = 3;
  for (const v of vocabulary) {
    if (v.id === targetId) continue;
    const d = levenshtein(u, normalizeAnswer(v.word));
    // d = 0 (exactly a different known word) is the strongest confusion signal.
    if (d < bestDist) {
      bestDist = d;
      best = v.id;
    }
  }
  return bestDist <= 2 ? best : null;
}

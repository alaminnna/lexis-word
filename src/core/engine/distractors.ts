// MCQ distractor selection (§7): confusion partners → same-stage same-POS →
// same Bengali → random same-stage. Deterministic via the session seed.

import type { WordRecord } from '../../types/domain';
import { pickN } from '../../utils/rng';

export interface DistractorPool {
  words: WordRecord[];
  byId: Map<string, WordRecord>;
}

export function makePool(words: WordRecord[]): DistractorPool {
  return { words, byId: new Map(words.map((w) => [w.id, w])) };
}

export interface DistractorOptions {
  count: number; // total options INCLUDING the answer (3 easy / 4 default / 5 hard)
  confusionPartners: string[]; // word ids, heaviest first
  mode: 'meaning' | 'word';
  rand: () => number;
}

/** Render a word as an option in the given mode (meaning text or headword). */
export function optionText(word: WordRecord, mode: 'meaning' | 'word'): string {
  if (mode === 'word') return word.word;
  return word.shortDefinition ?? word.word;
}

/**
 * Build a shuffled option list containing the answer exactly once.
 * Filters relax progressively so the requested count is always met.
 */
export function buildOptions(target: WordRecord, pool: DistractorPool, opts: DistractorOptions): string[] {
  const { count, confusionPartners, mode, rand } = opts;
  const need = Math.max(2, count) - 1;
  const chosen: WordRecord[] = [];
  const usedIds = new Set<string>([target.id]);
  const usedTexts = new Set<string>([optionText(target, mode).toLowerCase()]);

  const tryAdd = (candidates: WordRecord[]): void => {
    for (const c of pickN(candidates, candidates.length, rand)) {
      if (chosen.length >= need) return;
      if (usedIds.has(c.id)) continue;
      const text = optionText(c, mode).toLowerCase();
      if (mode === 'meaning' && usedTexts.has(text)) continue; // never duplicate a meaning
      usedIds.add(c.id);
      usedTexts.add(text);
      chosen.push(c);
    }
  };

  const targetPos = target.pos?.[0];
  const sameStage = pool.words.filter((w) => w.stage === target.stage && w.id !== target.id);

  // 1. Registered confusion partners (as full records, in weight order).
  const partners: WordRecord[] = [];
  for (const id of confusionPartners) {
    const w = pool.byId.get(id);
    if (w && w.id !== target.id) partners.push(w);
  }
  tryAdd(partners);
  // 2. Same-stage, same-POS.
  if (targetPos) tryAdd(sameStage.filter((w) => w.pos?.[0] === targetPos));
  // 3. Same Bengali meaning (but a different English definition).
  if (target.bengali) {
    const bn = Array.isArray(target.bengali) ? target.bengali : [target.bengali];
    tryAdd(sameStage.filter((w) => {
      const wb = w.bengali ? (Array.isArray(w.bengali) ? w.bengali : [w.bengali]) : [];
      return wb.some((b) => bn.includes(b));
    }));
  }
  // 4. Random same-stage words.
  tryAdd(sameStage);
  // 5. Anything (cross-stage fallback — count must always be met).
  tryAdd(pool.words.filter((w) => !usedIds.has(w.id)));

  const options = [optionText(target, mode), ...chosen.map((c) => optionText(c, mode))];
  // Deterministic shuffle.
  const arr = [...options];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

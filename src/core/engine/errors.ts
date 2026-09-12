// Spelling error-pattern engine (§11): align typed input against the target and
// classify the error. Powers per-word errorProfile hints and the learner profile.

import { normalizeAnswer } from '../../utils/text';

export type SpellingErrorKind =
  | 'dropped-double'
  | 'vowel-substitution'
  | 'silent-letter'
  | 'suffix'
  | 'transposition'
  | 'truncation'
  | 'other';

export const SPELLING_ERROR_LABELS: Record<SpellingErrorKind, string> = {
  'dropped-double': 'dropped double letter',
  'vowel-substitution': 'vowel substitution',
  'silent-letter': 'silent-letter omission',
  'suffix': 'suffix / inflection error',
  'transposition': 'letter transposition',
  'truncation': 'truncated ending',
  'other': 'other spelling slip',
};

const VOWELS = new Set(['a', 'e', 'i', 'o', 'u', 'y']);
/** Letters frequently silent in English onsets/codas (heuristic, documented). */
const SILENT_PRONE = new Set(['k', 'w', 'h', 'p', 'g', 'b', 't', 'l', 'n']);
const SUFFIXES = ['tion', 'sion', 'ing', 'ied', 'ies', 'ed', 'es', 'ly', 'er', 'est', 'al', 'ic', 'ous', 'ment', 'ness', 'ful', 'less', 'able', 'ible'];

function collapseDoubles(s: string): string {
  return s.replace(/(.)\1+/g, '$1');
}

function commonPrefixLen(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

export function classifySpellingError(target: string, typed: string): SpellingErrorKind {
  const t = normalizeAnswer(target).replace(/[^a-z-]/g, '');
  const u = normalizeAnswer(typed).replace(/[^a-z-]/g, '');
  if (t === u || t.length === 0 || u.length === 0) return 'other';

  // Single adjacent transposition.
  if (t.length === u.length) {
    let first = -1;
    for (let i = 0; i < t.length; i++) {
      if (t[i] !== u[i]) { first = i; break; }
    }
    if (
      first >= 0 && first + 1 < t.length &&
      t[first] === u[first + 1] && t[first + 1] === u[first] &&
      t.slice(first + 2) === u.slice(first + 2)
    ) {
      return 'transposition';
    }
  }

  // Truncation: typed is a strict prefix of the target, missing ≥ 2 chars.
  if (t.startsWith(u) && t.length - u.length >= 2) return 'truncation';

  // Dropped double letter: equal once doubles are collapsed, target had one.
  if (collapseDoubles(t) === collapseDoubles(u) && t !== u) return 'dropped-double';

  // Vowel substitution: same length, every diff is vowel↔vowel.
  if (t.length === u.length) {
    let diffs = 0;
    let allVowel = true;
    for (let i = 0; i < t.length; i++) {
      if (t[i] !== u[i]) {
        diffs++;
        if (!VOWELS.has(t[i]!) || !VOWELS.has(u[i]!)) allVowel = false;
      }
    }
    if (diffs > 0 && allVowel) return 'vowel-substitution';
  }

  // Suffix / inflection: long shared stem, difference confined to the tail.
  {
    const pre = commonPrefixLen(t, u);
    if (pre >= 4 && pre >= Math.min(t.length, u.length) - 3) {
      const tailT = t.slice(pre);
      const tailU = u.slice(pre);
      if (SUFFIXES.some((s) => tailT.endsWith(s) || tailU.endsWith(s) || tailT === 's' || tailU === 's')) {
        return 'suffix';
      }
    }
  }

  // Silent-letter omission: single deleted consonant from the silent-prone set.
  if (t.length === u.length + 1) {
    let i = 0;
    while (i < u.length && t[i] === u[i]) i++;
    if (t.slice(i + 1) === u.slice(i) && SILENT_PRONE.has(t[i]!)) return 'silent-letter';
  }

  return 'other';
}

/** Aggregate per-word error profiles into a learner-level ranking (§11, §21). */
export function aggregateErrorProfile(
  profiles: Record<string, Record<string, number>>,
): { kind: SpellingErrorKind; count: number; words: string[] }[] {
  const totals = new Map<SpellingErrorKind, { count: number; words: Set<string> }>();
  for (const [wordId, profile] of Object.entries(profiles)) {
    for (const [kind, count] of Object.entries(profile)) {
      const k = kind as SpellingErrorKind;
      let entry = totals.get(k);
      if (!entry) {
        entry = { count: 0, words: new Set<string>() };
        totals.set(k, entry);
      }
      entry.count += count;
      entry.words.add(wordId);
    }
  }
  return [...totals.entries()]
    .map(([kind, v]) => ({ kind, count: v.count, words: [...v.words] }))
    .sort((a, b) => b.count - a.count);
}

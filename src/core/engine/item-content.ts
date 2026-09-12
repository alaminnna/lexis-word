// Deterministic item-content builders: spelling variants, cloze prompts,
// collocation options, form-transform targets, minimal pairs. Pure functions.

import type { WordRecord } from '../../types/domain';
import { blankTarget, contentWords } from '../../utils/text';
import { pickN, shuffled } from '../../utils/rng';

/** Generate `count` plausible-but-wrong spellings of a word (listen-spelling options). */
export function spellingVariants(word: string, count: number, rand: () => number): string[] {
  const out: string[] = [];
  const seen = new Set<string>([word.toLowerCase()]);
  const push = (s: string): void => {
    const k = s.toLowerCase();
    if (k !== word.toLowerCase() && !seen.has(k) && /^[a-z-]+$/.test(k)) {
      seen.add(k);
      out.push(s);
    }
  };
  const w = word;
  const vowels = ['a', 'e', 'i', 'o', 'u'];

  // 1. Double ↔ single swaps.
  for (let i = 0; i < w.length - 1; i++) {
    if (w[i] === w[i + 1]) push(w.slice(0, i) + w.slice(i + 1)); // commission → comission
  }
  for (let i = 0; i < w.length; i++) {
    const ch = w[i] ?? '';
    push(w.slice(0, i + 1) + ch + w.slice(i + 1)); // occur → occcur
  }
  // 2. Vowel substitutions.
  for (let i = 0; i < w.length; i++) {
    if (vowels.includes(w[i]!.toLowerCase())) {
      for (const v of vowels) {
        if (v !== w[i]!.toLowerCase()) push(w.slice(0, i) + v + w.slice(i + 1));
      }
    }
  }
  // 3. Common confusion swaps.
  const swaps: [RegExp, string][] = [
    [/tion\b/, 'sion'], [/sion\b/, 'tion'], [/ce\b/, 'se'], [/se\b/, 'ce'],
    [/c([eiy])/, 's$1'], [/s([eiy])/, 'c$1'], [/ph/, 'f'], [/^k/, 'c'], [/^w/, 'v'],
    [/ou/, 'u'], [/ie/, 'ei'], [/ei/, 'ie'], [/able\b/, 'ible'], [/ible\b/, 'able'],
    [/er\b/, 'ar'], [/ar\b/, 'er'], [/ant\b/, 'ent'], [/ent\b/, 'ant'],
  ];
  for (const [re, rep] of swaps) {
    if (re.test(w)) push(w.replace(re, rep));
  }
  // 4. Adjacent transpositions.
  for (let i = 0; i < w.length - 1; i++) {
    const a = w[i] ?? '';
    const b = w[i + 1] ?? '';
    push(w.slice(0, i) + b + a + w.slice(i + 2));
  }
  // 5. Deterministic alphabet fallback (guarantees count for short words).
  const alpha = 'abcdefghijklmnopqrstuvwxyz';
  let ai = 0;
  while (out.length < count && ai < alpha.length * w.length) {
    const pos = ai % Math.max(1, w.length);
    const ch = alpha[Math.floor(ai / Math.max(1, w.length)) % alpha.length]!;
    push(w.slice(0, pos) + ch + w.slice(pos + 1));
    ai++;
  }

  return shuffled(out, rand).slice(0, count);
}

/** Cloze prompt: the word's sentence with the target blanked (null if invalid). */
export function clozePrompt(word: WordRecord): string | null {
  return blankTarget(word.sentence, word.word, word.forms ?? []);
}

/** Collocation extraction (§12): nearest content word to the target in its sentence. */
export function collocationFor(
  word: WordRecord,
  sameStage: WordRecord[],
  rand: () => number,
): { collocate: string; prompt: string; options: string[] } {
  const sentence = word.sentence;
  const tokens = sentence.split(/\s+/);
  const norm = (t: string): string => t.toLowerCase().replace(/[^a-z-]/g, '');
  const targets = new Set([word.word.toLowerCase(), ...(word.forms ?? []).map((f) => f.toLowerCase())]);
  let targetIdx = tokens.findIndex((t) => targets.has(norm(t)));
  if (targetIdx < 0) targetIdx = Math.floor(tokens.length / 2);
  const content = new Set(contentWords(`${sentence} ${word.shortDefinition ?? ''}`));
  // Nearest content token to the target (prefer the right side), excluding the target.
  let collocate: string | null = null;
  for (let dist = 1; dist < tokens.length && !collocate; dist++) {
    for (const idx of [targetIdx + dist, targetIdx - dist]) {
      if (idx < 0 || idx >= tokens.length || idx === targetIdx) continue;
      const clean = norm(tokens[idx]!);
      if (clean.length > 2 && content.has(clean) && !targets.has(clean)) {
        collocate = clean;
        break;
      }
    }
  }
  const fallback = [...content].filter((c) => !targets.has(c))[0] ?? 'important';
  const answer = collocate ?? fallback;
  const prompt = sentence.replace(new RegExp(`\\b${answer}\\b`, 'i'), '＿＿＿＿');

  // Distractors: content words from other same-stage words' sentences.
  const donorPool: string[] = [];
  for (const donor of shuffled(sameStage.filter((d) => d.id !== word.id), rand)) {
    for (const c of contentWords(`${donor.sentence} ${donor.shortDefinition ?? ''}`)) {
      if (c !== answer && !targets.has(c)) donorPool.push(c);
    }
    if (donorPool.length >= 12) break;
  }
  const distractors = [...new Set(donorPool)].slice(0, 3);
  while (distractors.length < 3) distractors.push(['strong', 'clear', 'major'][distractors.length]!);
  const options = shuffled([answer, ...distractors], rand);
  return { collocate: answer, prompt, options };
}

/** Plain-English label for a target word form (form-transform prompts). */
export function formHint(form: string): string {
  const f = form.toLowerCase();
  if (/tions?$/.test(f) || /sions?$/.test(f) || /ments?$/.test(f) || /nesses?$/.test(f) || /ities?$/.test(f)) return 'noun form';
  if (/ly$/.test(f)) return 'adverb';
  if (/(ous|ive|ful|less|able|ible|al|ic)$/.test(f) && !/ed$/.test(f)) return 'adjective';
  if (/ing$/.test(f)) return '‑ing form';
  if (/eds?$/.test(f) || /ied$/.test(f)) return 'past form';
  if (/s$/.test(f)) return 'plural / third-person form';
  return 'related form';
}

/** Pick a form-transform target (seeded). Null when the word has no forms. */
export function formTarget(word: WordRecord, rand: () => number): { form: string; hint: string } | null {
  const forms = (word.forms ?? []).filter((f) => f.toLowerCase() !== word.word.toLowerCase());
  if (forms.length === 0) return null;
  const form = pickN(forms, 1, rand)[0]!;
  return { form, hint: formHint(form) };
}

/**
 * Minimal-pair partner: confusion partner first, else phonetically similar
 * (shared ending → shared onset+length → same POS+stage), seeded.
 */
export function minimalPairPartner(
  word: WordRecord,
  pool: WordRecord[],
  partnerIds: string[],
  rand: () => number,
): WordRecord | null {
  const byId = new Map(pool.map((w) => [w.id, w]));
  for (const id of partnerIds) {
    const p = byId.get(id);
    if (p && p.id !== word.id) return p;
  }
  const end2 = word.word.slice(-2).toLowerCase();
  const sameEnd = pool.filter((w) => w.id !== word.id && w.word.toLowerCase().endsWith(end2));
  if (sameEnd.length > 0) return pickN(sameEnd, 1, rand)[0]!;
  const sameOnset = pool.filter(
    (w) => w.id !== word.id && w.word[0] === word.word[0] && Math.abs(w.word.length - word.word.length) <= 1,
  );
  if (sameOnset.length > 0) return pickN(sameOnset, 1, rand)[0]!;
  const samePos = pool.filter((w) => w.id !== word.id && w.stage === word.stage && w.pos?.[0] === word.pos?.[0]);
  if (samePos.length > 0) return pickN(samePos, 1, rand)[0]!;
  return null;
}
